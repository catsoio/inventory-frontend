import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { forkJoin } from 'rxjs';
import { BookingApi } from '../../core/api/booking-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import { Booking, Resource } from '../../core/models';
import { appLocale } from '../../core/i18n/locale';
import { at, hm, ymd } from '../when/when';

const FIRST = 6;
const LAST = 19;
const SPAN = (LAST - FIRST) * 60;
const HOUR_LABELS = Array.from({ length: (LAST - FIRST) / 2 + 1 }, (_, i) => FIRST + i * 2);

interface Row {
  /** Resurs-id, eller '' för "Ej tilldelad". */
  id: string;
  name: string;
  color: string;
  blocks: Block[];
  lanes: number;
}

interface Block {
  booking: Booking;
  left: number;
  width: number;
  lane: number;
}

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const pct = (mins: number) =>
  ((Math.min(Math.max(mins, FIRST * 60), LAST * 60) - FIRST * 60) / SPAN) * 100;

/**
 * En dag i miniatyr: mekanikerns rader med det som redan är bokat, och den här tiden som en
 * markerad ruta. Visar direkt om tiden krockar, och ett klick på raden väljer starttid.
 * Används där en tid väljs utan att man ser kalendern (arbetsorderkortet).
 */
@Component({
  selector: 'app-day-plan',
  standalone: false,
  template: `
    <div class="rounded-lg border border-gray-200 bg-white">
      <div
        class="flex flex-wrap items-center justify-between gap-x-3 border-b border-gray-100 px-3 py-1.5 text-xs text-gray-600"
      >
        <span class="font-medium first-letter:uppercase">{{ dayLabel() }}</span>
        @if (start && end) {
          <span class="tabular-nums"
            >Den här tiden: {{ time(start.toISOString()) }}–{{ time(end.toISOString()) }}</span
          >
        }
      </div>
      <div class="overflow-x-auto">
        <div class="min-w-[520px] px-3 py-2">
          <div class="relative ml-28 h-4 text-[10px] text-gray-500">
            @for (h of hourLabels; track h) {
              <span
                class="absolute -translate-x-1/2"
                [style.left.%]="((h - first) * 60 * 100) / span"
                >{{ h < 10 ? '0' + h : h }}</span
              >
            }
          </div>
          @for (row of rows(); track row.id) {
            <div class="flex items-stretch gap-0 border-t border-gray-100 first:border-t-0">
              <div class="flex w-28 shrink-0 items-center gap-2 pr-2 text-xs">
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-full"
                  [style.background]="row.color"
                ></span>
                <span class="truncate font-medium">{{ row.name }}</span>
              </div>
              <div
                class="relative flex-1 cursor-pointer"
                [style.height.px]="row.lanes * 26 + 6"
                [style.background-image]="grid"
                [style.background-size]="'calc(100% / ' + (last - first) + ') 100%'"
                (click)="clicked($event)"
              >
                @if (nowLeft() !== null) {
                  <div
                    class="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-red-400"
                    [style.left.%]="nowLeft()"
                  ></div>
                }
                @for (b of row.blocks; track b.booking.id) {
                  <div
                    class="absolute overflow-hidden rounded px-1.5 text-[11px] leading-[22px] whitespace-nowrap text-white"
                    [style.left.%]="b.left"
                    [style.width.%]="b.width"
                    [style.top.px]="3 + b.lane * 26"
                    [style.height.px]="22"
                    [style.background]="row.color"
                    [style.opacity]="0.55"
                    [attr.title]="describe(b.booking)"
                    (click)="$event.stopPropagation()"
                  >
                    {{ b.booking.regNo || b.booking.title }}
                  </div>
                }
                @if (slotIn(row); as s) {
                  <div
                    class="pointer-events-none absolute inset-y-0 z-10 rounded border-2 border-dashed"
                    [class]="
                      clash().length
                        ? 'border-red-500 bg-red-500/15'
                        : 'border-teal-600 bg-teal-500/20'
                    "
                    [style.left.%]="s.left"
                    [style.width.%]="s.width"
                  ></div>
                }
              </div>
            </div>
          } @empty {
            <p class="py-2 text-xs text-gray-500">
              {{
                loading()
                  ? 'Hämtar…'
                  : 'Inga mekaniker än. Lägg till under Register › Mekaniker och platser.'
              }}
            </p>
          }
        </div>
      </div>
      @if (clash().length) {
        <p class="border-t border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-800">
          Tiden krockar med
          @for (b of clash(); track b.id; let last = $last) {
            <b>{{ b.code }}</b> {{ b.regNo || b.title }} ({{ time(b.start) }}–{{ time(b.end) }}){{
              last ? '.' : ', '
            }}
          }
        </p>
      }
    </div>
  `,
})
export class DayPlan implements OnChanges {
  private readonly bookingApi = inject(BookingApi);
  private readonly workshop = inject(WorkshopApi);

  /** Dagen som visas, "YYYY-MM-DD". */
  @Input({ required: true }) day = '';
  /** Tiden som planeras (markeras), eller null. */
  @Input() start: Date | null = null;
  @Input() end: Date | null = null;
  @Input() resourceId = '';
  @Input() placeId = '';
  /** Bokningen som hör till det som planeras (ritas inte som upptagen). */
  @Input() excludeBookingId: string | null = null;
  /** Ökas av föräldern när något sparats, så att dagen läses om. */
  @Input() refresh = 0;
  /** Starttid vald med ett klick (dagen är `day`). */
  @Output() pick = new EventEmitter<Date>();

  readonly first = FIRST;
  readonly last = LAST;
  readonly span = SPAN;
  readonly hourLabels = HOUR_LABELS;
  readonly grid = 'linear-gradient(to right, #eef0f2 1px, transparent 1px)';
  readonly loading = signal(true);
  private readonly resources = signal<Resource[]>([]);
  private readonly bookings = signal<Booking[]>([]);

  ngOnChanges(c: SimpleChanges) {
    if (c['day'] || c['refresh']) this.load();
  }

  private load() {
    const from = at(this.day || ymd(new Date()), '00:00');
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    this.loading.set(true);
    forkJoin([this.workshop.resources(), this.bookingApi.between(from, to)]).subscribe({
      next: ([r, b]) => {
        this.resources.set(r.filter((x) => x.active));
        this.bookings.set(b.filter((x) => x.status !== 'cancelled' && x.status !== 'no_show'));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  dayLabel() {
    if (!this.day) return '';
    return at(this.day, '12:00').toLocaleDateString(appLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  /** Raderna: vald mekaniker (annars alla), vald plats, och "Ej tilldelad" när inget är valt. */
  rows(): Row[] {
    const all = this.resources();
    const mechanics = all.filter((r) => r.kind === 'mechanic');
    const shown: { id: string; name: string; color: string }[] = [
      ...(this.resourceId ? mechanics.filter((r) => r.id === this.resourceId) : mechanics).map(
        (r) => ({ id: r.id, name: r.name, color: r.color || '#475569' }),
      ),
      ...all
        .filter((r) => r.kind !== 'mechanic' && r.id === this.placeId)
        .map((r) => ({ id: r.id, name: r.name, color: r.color || '#475569' })),
    ];
    if (!this.resourceId && !this.placeId) {
      shown.push({ id: '', name: 'Ej tilldelad', color: '#6b7280' });
    }
    return shown.map((r) => {
      const mine = this.bookings()
        .filter(
          (b) =>
            b.id !== this.excludeBookingId &&
            (r.id === ''
              ? !b.resourceId && !b.placeId
              : b.resourceId === r.id || b.placeId === r.id),
        )
        .sort((a, b) => a.start.localeCompare(b.start));
      const laneEnds: number[] = [];
      const blocks = mine.map((b): Block => {
        const [s, e] = this.minutesOnDay(new Date(b.start), new Date(b.end));
        let lane = laneEnds.findIndex((x) => x <= s);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = e;
        return { booking: b, left: pct(s), width: Math.max(pct(e) - pct(s), 1.5), lane };
      });
      return { ...r, blocks, lanes: Math.max(laneEnds.length, 1) };
    });
  }

  /** Början och slut i minuter på den visade dagen; ett jobb över flera dagar fyller dagen. */
  private minutesOnDay(start: Date, end: Date): [number, number] {
    const s = ymd(start) === this.day ? minutesOf(start) : FIRST * 60;
    const e = ymd(end) === this.day ? minutesOf(end) : LAST * 60;
    return [s, Math.max(e, s + 15)];
  }

  /** Den planerade tiden på dagen, om den når hit. */
  private slot(): { s: number; e: number } | null {
    if (!this.start || !this.end || !this.day) return null;
    if (ymd(this.start) > this.day || ymd(this.end) < this.day) return null;
    const [s, e] = this.minutesOnDay(this.start, this.end);
    return { s, e };
  }

  /** Rutan för tiden i en rad: hos vald mekaniker och plats, annars i "Ej tilldelad". */
  slotIn(row: Row): { left: number; width: number; label: string } | null {
    const s = this.slot();
    if (!s) return null;
    const here =
      row.id === ''
        ? !this.resourceId && !this.placeId
        : row.id === this.resourceId || row.id === this.placeId;
    if (!here) return null;
    return {
      left: pct(s.s),
      width: Math.max(pct(s.e) - pct(s.s), 1.5),
      label: `${hm(this.start!)}–${hm(this.end!)}`,
    };
  }

  /** Bokningar som tiden krockar med hos vald mekaniker eller plats. */
  clash(): Booking[] {
    const s = this.slot();
    if (!s || (!this.resourceId && !this.placeId)) return [];
    return this.bookings().filter((b) => {
      if (b.id === this.excludeBookingId) return false;
      const sameRes =
        (!!this.resourceId && b.resourceId === this.resourceId) ||
        (!!this.placeId && b.placeId === this.placeId);
      if (!sameRes) return false;
      const [bs, be] = this.minutesOnDay(new Date(b.start), new Date(b.end));
      return bs < s.e && be > s.s;
    });
  }

  nowLeft(): number | null {
    const now = new Date();
    if (ymd(now) !== this.day) return null;
    const m = minutesOf(now);
    return m < FIRST * 60 || m > LAST * 60 ? null : pct(m);
  }

  time(iso: string) {
    return hm(new Date(iso));
  }

  describe(b: Booking) {
    return `${b.code} · ${this.time(b.start)}–${this.time(b.end)} · ${[b.title.split('\n')[0], b.regNo, b.customerName].filter(Boolean).join(' · ')}`;
  }

  /** Klick på en rad: starttiden blir klockslaget under muspekaren, avrundat till en kvart. */
  clicked(ev: MouseEvent) {
    const el = ev.currentTarget as HTMLElement;
    const x = ev.clientX - el.getBoundingClientRect().left;
    const mins = FIRST * 60 + Math.round(((x / el.clientWidth) * SPAN) / 15) * 15;
    const clamped = Math.min(Math.max(mins, FIRST * 60), (LAST - 1) * 60);
    this.pick.emit(
      at(
        this.day,
        `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`,
      ),
    );
  }
}
