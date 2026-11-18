import { appLocale } from '../../../core/i18n/locale';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { CalendarApp, CalendarEvent, createCalendar } from '@schedule-x/calendar';
import { createViewDay, createViewMonthGrid, createViewWeek } from '@schedule-x/calendar';
import { createCurrentTimePlugin } from '@schedule-x/current-time';
import { createDragAndDropPlugin } from '@schedule-x/drag-and-drop';
import { createResizePlugin } from '@schedule-x/resize';
// Schedule-X letar efter ett globalt `Temporal`. Webbläsare som har det på riktigt använder det,
// övriga får polyfillen. Importera aldrig Temporal från paketet: då blir det en annan klass och
// kalenderns `instanceof`-kontroller misslyckas.
import 'temporal-polyfill/global';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../../../core/auth/auth';
import type { BoardColumn } from '../booking-board/booking-board';
import { BookingApi } from '../../../core/api/booking-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { Booking, BookingOrder, BookingStatus, Resource, WorkOrder } from '../../../core/models';
import { nextHour } from '../../../shared/when/when';
import {
  BookingDialog,
  BookingDialogData,
  BookingDialogResult,
} from '../../../shared/booking-dialog/booking-dialog';

/** Kalendervyerna (Schedule-X) och resursvyn (egen komponent). */
type CalView = 'day' | 'week' | 'month-grid';
type Mode = CalView | 'board' | 'list';
const VIEWS: Mode[] = ['board', 'day', 'week', 'month-grid', 'list'];

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const COLORS: Record<BookingStatus, string> = {
  requested: '#7c3aed',
  booked: '#1976d2',
  arrived: '#f59e0b',
  done: '#16a34a',
  cancelled: '#9ca3af',
  no_show: '#dc2626',
};
const FALLBACK = '#475569';

/** Färgdefinition för en kalender: stark kant, ljus fyllning och mörk text av samma färg. */
const palette = (c: string) => ({
  main: c,
  container: `color-mix(in srgb, ${c} 16%, white)`,
  onContainer: `color-mix(in srgb, ${c} 65%, black)`,
});

const zoned = (iso: string) => Temporal.Instant.from(iso).toZonedDateTimeISO(TZ);
const toDate = (z: Temporal.ZonedDateTime | Temporal.PlainDate) =>
  z instanceof Temporal.PlainDate
    ? new Date(z.year, z.month - 1, z.day)
    : new Date(z.epochMilliseconds);
const plain = (d: Date) =>
  Temporal.PlainDate.from({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

@Component({
  selector: 'app-booking-calendar',
  standalone: false,
  host: { class: 'flex h-full flex-col', '[class.m-day]': "mobile && mode() === 'day'" },
  styles: `
    /* Mobil, dagvy: veckoremsan ovanför ersätter kalenderns egen dagrubrik. */
    :host(.m-day) ::ng-deep .sx__week-header-content {
      display: none;
    }
    @media (max-width: 767px) {
      :host ::ng-deep .sx__calendar-wrapper {
        border: 0;
      }
    }
  `,
  template: `
    @if (mobile) {
      <div class="mb-2 shrink-0 space-y-2">
        <div class="flex items-center gap-1">
          <span
            class="min-w-0 flex-1 truncate text-[28px] font-bold leading-tight first-letter:uppercase"
            >{{ monthTitle() }}</span
          >
          @if (mode() !== 'list') {
            <button
              mat-icon-button
              [matMenuTriggerFor]="who"
              aria-label="Visa"
              [class.!text-teal-700]="!!filter()"
            >
              <mat-icon>{{ filter() ? 'person' : 'filter_list' }}</mat-icon>
            </button>
            <button
              mat-icon-button
              class="relative"
              (click)="toggleInbox()"
              aria-label="Att planera"
            >
              <mat-icon>inbox</mat-icon>
              @if (toPlan()) {
                <span
                  class="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white"
                  >{{ toPlan() }}</span
                >
              }
            </button>
          }
          <button
            mat-icon-button
            class="!bg-teal-700 !text-white"
            (click)="create(newStart(), newEnd())"
            aria-label="Ny bokning"
          >
            <mat-icon>add</mat-icon>
          </button>
          <mat-menu #who="matMenu">
            <button mat-menu-item (click)="setFilter('')">Alla</button>
            @for (r of resources(); track r.id) {
              <button mat-menu-item (click)="setFilter(r.id)">
                {{ r.name }}{{ mine(r) ? ' (jag)' : '' }}
              </button>
            }
          </mat-menu>
        </div>

        <app-booking-views [value]="mode()" [mobile]="mobile" (pick)="setMode($event)" />

        @if (mode() === 'day') {
          <div
            class="grid grid-cols-7 text-center"
            (touchstart)="swipeStart($event)"
            (touchend)="swipeEnd($event)"
          >
            @for (d of weekDays(); track d.key) {
              <button
                type="button"
                class="flex flex-col items-center gap-0.5 py-1"
                (click)="pickDay(d.date)"
              >
                <span class="text-[11px] font-semibold uppercase text-gray-500">{{ d.label }}</span>
                <span
                  class="grid h-9 w-9 place-items-center rounded-full text-lg"
                  [class]="
                    d.selected
                      ? 'bg-teal-700 font-semibold text-white'
                      : d.today
                        ? 'font-bold text-teal-700'
                        : 'text-gray-900'
                  "
                  >{{ d.n }}</span
                >
              </button>
            }
          </div>
          <div class="flex items-center justify-between px-1 text-sm text-gray-600">
            <span class="first-letter:uppercase">{{ title() }}</span>
            @if (!isToday()) {
              <button type="button" class="font-semibold text-teal-700" (click)="today()">
                Idag
              </button>
            }
          </div>
        }
        @if (mode() !== 'day' && mode() !== 'list') {
          <div class="flex items-center justify-between">
            <button mat-icon-button (click)="step(-1)" aria-label="Föregående">
              <mat-icon>chevron_left</mat-icon>
            </button>
            <button type="button" class="text-sm font-semibold text-teal-700" (click)="today()">
              Idag
            </button>
            <button mat-icon-button (click)="step(1)" aria-label="Nästa">
              <mat-icon>chevron_right</mat-icon>
            </button>
          </div>
        }
      </div>
    } @else {
      <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <app-booking-views [value]="mode()" [mobile]="mobile" (pick)="setMode($event)" />

        @if (mode() !== 'list') {
          <div class="flex items-center gap-1">
            <button mat-icon-button (click)="step(-1)" aria-label="Föregående">
              <mat-icon>chevron_left</mat-icon>
            </button>
            <button mat-stroked-button (click)="today()">Idag</button>
            <button mat-icon-button (click)="step(1)" aria-label="Nästa">
              <mat-icon>chevron_right</mat-icon>
            </button>
            <span class="ml-2 text-lg font-semibold first-letter:uppercase">{{ title() }}</span>
          </div>
        }

        <span class="flex-1"></span>

        @if (mode() !== 'list') {
          <mat-form-field
            class="w-40 max-md:min-w-40 max-md:flex-1 max-md:basis-40"
            subscriptSizing="dynamic"
          >
            <mat-label>Visa</mat-label>
            <mat-select [value]="filter()" (selectionChange)="setFilter($event.value)">
              <mat-option value="">Alla</mat-option>
              @for (r of resources(); track r.id) {
                <mat-option [value]="r.id">{{ r.name }}{{ mine(r) ? ' (jag)' : '' }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <button
            mat-stroked-button
            class="whitespace-nowrap"
            [class.!bg-teal-50]="inboxOpen()"
            [attr.aria-pressed]="inboxOpen()"
            (click)="toggleInbox()"
          >
            <mat-icon>inbox</mat-icon>
            <span class="max-2xl:hidden">Att planera</span>
            <span class="ml-1 rounded-full bg-gray-200 px-2 text-xs font-semibold">{{
              toPlan()
            }}</span>
          </button>
        }

        <button
          mat-flat-button
          color="primary"
          class="whitespace-nowrap"
          (click)="create(newStart(), newEnd())"
        >
          <mat-icon>add</mat-icon> Ny<span class="max-md:hidden">&nbsp;bokning</span>
        </button>
      </div>
    }

    <div class="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <div
        class="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl bg-white p-3 shadow-sm max-md:-mx-1 max-md:rounded-lg max-md:p-0"
      >
        @if (mode() === 'list') {
          <app-booking-list class="min-h-0 flex-1" [embedded]="true" />
        } @else if (mode() === 'board') {
          <app-booking-board
            [day]="date()"
            [filter]="filter()"
            [refresh]="refresh()"
            [dragged]="dragged()"
            (openBooking)="open($event)"
            (slot)="createAt($event)"
            (dropOrder)="dropOrder($event)"
          />
        } @else if (app(); as a) {
          <sx-calendar class="min-h-0 flex-1" [calendarApp]="a">
            <!-- Vår egen verktygsrad ovanför ersätter kalenderns. -->
            <ng-template #headerContent></ng-template>
          </sx-calendar>
        }
      </div>

      @if (mobile && inboxOpen() && mode() !== 'list') {
        <div class="fixed inset-0 z-40 bg-black/40" (click)="toggleInbox()"></div>
      }
      <app-booking-inbox
        class="rounded-xl bg-white shadow-sm max-lg:order-first max-lg:max-h-72 lg:w-72 lg:shrink-0 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:max-h-[75vh] max-md:rounded-b-none max-md:rounded-t-2xl max-md:shadow-2xl"
        [class.hidden]="!inboxOpen() || mode() === 'list'"
        [refresh]="refresh()"
        (plan)="planOrder($event); mobile && inboxOpen() && toggleInbox()"
        (openBooking)="open($event)"
        (dragging)="dragged.set($event)"
        (counted)="toPlan.set($event)"
      />
    </div>
  `,
})
export class BookingCalendar implements OnInit {
  private readonly api = inject(BookingApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly auth = inject(Auth);
  private readonly myId = this.auth.user()?.id;
  private readonly dialog = inject(MatDialog);
  readonly router = inject(Router);

  /** Bokningar för perioden som visas, för klick och dra-och-släpp. */
  private bookings = new Map<string, Booking>();
  private range: { start: Date; end: Date } | null = null;
  /** Kalenderns interna tillstånd, för att byta vy och dag utifrån. */
  private $app: any = null;

  /** Mekaniker som är kopplad till den inloggade, om någon. */
  mine(r: Resource) {
    return !!this.myId && r.userId === this.myId;
  }
  readonly resources = signal<Resource[]>([]);
  /** Resurs-id som kalendern är filtrerad på, tomt = alla. */
  readonly filter = signal('');
  private resourcesLoaded = false;

  /** Mobil startar på dag. */
  readonly mobile = window.innerWidth < 768;
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  readonly mode = signal<Mode>(this.startMode());
  readonly date = signal(this.startDate());
  /** "Att planera": förfrågningar och arbetsorder som väntar på en tid. */
  readonly inboxOpen = signal(this.startInbox());
  readonly toPlan = signal(0);
  /** Arbetsordern som dras från "Att planera" just nu. */
  readonly dragged = signal<WorkOrder | null>(null);
  readonly title = signal('');
  readonly refresh = signal(0);
  readonly app = signal<CalendarApp | null>(null);

  /** Vy från adressen (?view=), annars den senast använda, annars dator = resurser, mobil = dag. */
  private startMode(): Mode {
    const fromUrl = this.query.get('view');
    const saved = (() => {
      try {
        return localStorage.getItem('garagestock.bookingView');
      } catch {
        return null;
      }
    })();
    const v = [fromUrl, saved].find((x) => VIEWS.includes(x as Mode)) as Mode | undefined;
    return this.forDevice(v ?? 'day');
  }

  /** Dagen är en kolumn på mobil och en kolumn per mekaniker och lyft på dator. */
  private forDevice(m: Mode): Mode {
    if (m === 'day' || m === 'board') return this.mobile ? 'day' : 'board';
    return m;
  }

  /** Dag från adressen (?date=ÅÅÅÅ-MM-DD), annars i dag. */
  private startDate(): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.query.get('date') ?? '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  }

  private startInbox(): boolean {
    if (this.mobile) return false;
    try {
      const saved = localStorage.getItem('garagestock.bookingInbox');
      if (saved) return saved === '1';
    } catch {
      /* sparas bara som bekvämlighet */
    }
    return window.innerWidth >= 1280;
  }

  toggleInbox() {
    this.inboxOpen.update((v) => !v);
    if (this.mobile) return;
    try {
      localStorage.setItem('garagestock.bookingInbox', this.inboxOpen() ? '1' : '0');
    } catch {
      /* sparas bara som bekvämlighet */
    }
  }

  /** Byt vy utan att tappa dag eller filter. */
  setMode(pick: string) {
    const m = this.forDevice(pick as Mode);
    if (!VIEWS.includes(m) || m === this.mode()) return;
    try {
      localStorage.setItem('garagestock.bookingView', m);
    } catch {
      /* sparas bara som bekvämlighet */
    }
    const wasBoard = this.mode() === 'board' || this.mode() === 'list';
    this.mode.set(m);
    this.router.navigate([], { queryParams: { view: m }, replaceUrl: true });
    if (m === 'board' || m === 'list') {
      this.title.set(this.titleFor());
    } else if (wasBoard || !this.$app) {
      // Kalendern byggs om och startar på dagen som visades.
      this.build();
    } else {
      this.$app.calendarState.setView(m, plain(this.date()));
      this.title.set(this.titleFor());
      this.scrollToWork();
    }
  }

  ngOnInit() {
    this.title.set(this.titleFor());
    this.workshop.resources(true).subscribe((r) => {
      this.resources.set(r);
      this.resourcesLoaded = true;
      // En mekaniker med eget konto ser sina egna bokningar först; "Alla" finns kvar.
      const mine = r.find((x) => this.mine(x) && x.active);
      if (mine && !this.auth.isAdmin()) this.filter.set(mine.id);
      if (this.mode() !== 'board') this.build();
    });
  }

  /** Skapar kalendern; körs när resurserna (färgerna) är laddade och vid byte från resursvyn. */
  private build() {
    if (!this.resourcesLoaded) return;
    const calendars: Record<
      string,
      { colorName: string; lightColors: ReturnType<typeof palette> }
    > = {
      none: { colorName: 'none', lightColors: palette(FALLBACK) },
    };
    for (const r of this.resources()) {
      calendars['r' + r.id] = { colorName: 'r' + r.id, lightColors: palette(r.color || FALLBACK) };
    }
    for (const [s, c] of Object.entries(COLORS)) {
      calendars['s-' + s] = { colorName: 's-' + s, lightColors: palette(c) };
    }
    const app = createCalendar(
      {
        locale: appLocale(),
        timezone: TZ as never,
        firstDayOfWeek: 1,
        showWeekNumbers: true,
        views: [createViewDay(), createViewWeek(), createViewMonthGrid()],
        defaultView: this.mode() as CalView,
        selectedDate: plain(this.date()),
        dayBoundaries: { start: '00:00', end: '24:00' },
        weekOptions: { gridHeight: 1536, gridStep: 30 } as never,
        calendars,
        callbacks: {
          beforeRender: ($app: any) => {
            this.$app = $app;
          },
          fetchEvents: (range) => {
            this.range = { start: toDate(range.start), end: toDate(range.end) };
            return this.load(this.range);
          },
          onRangeUpdate: (range) => {
            this.range = { start: toDate(range.start), end: toDate(range.end) };
            this.title.set(this.titleFor());
          },
          onSelectedDateUpdate: (d) => {
            this.date.set(new Date(d.year, d.month - 1, d.day));
            this.title.set(this.titleFor());
          },
          onEventClick: (e) => this.clicked(String(e.id)),
          onClickDateTime: (dt) => {
            const start = toDate(dt);
            this.create(start, new Date(start.getTime() + 3600_000));
          },
          onClickDate: (d) => {
            // Månadsvyn: ny bokning kl. 08 den dagen.
            const start = new Date(d.year, d.month - 1, d.day, 8);
            this.create(start, new Date(start.getTime() + 3600_000));
          },
          onEventUpdate: (e) => this.move(e),
        },
      },
      [createDragAndDropPlugin(15), createResizePlugin(15), createCurrentTimePlugin()],
    );
    this.app.set(app);
    this.title.set(this.titleFor());
    this.scrollToWork();
  }

  /** Hela dygnet visas, men vyn börjar vid arbetsdagen (eller en timme före klockan nu). */
  private scrollToWork() {
    const go = (tries: number) => {
      const el = document.querySelector<HTMLElement>('.sx__week-grid');
      if (!el) return tries > 0 ? void setTimeout(() => go(tries - 1), 100) : undefined;
      const now = new Date();
      const hour = dayKey(this.date()) === dayKey(now) ? Math.max(0, now.getHours() - 1) : 7;
      el.scrollTop = (el.scrollHeight / 24) * hour;
    };
    go(10);
  }

  step(dir: 1 | -1) {
    const d = new Date(this.date());
    const m = this.mode();
    if (m === 'month-grid') d.setMonth(d.getMonth() + dir, 1);
    else d.setDate(d.getDate() + dir * (m === 'week' ? 7 : 1));
    this.goTo(d);
  }

  today() {
    this.goTo(new Date());
  }

  /** Mobilens rubrik: månad (och år när det inte är i år), som i Apples kalender. */
  monthTitle() {
    const d = this.date();
    return d.toLocaleDateString(appLocale(), {
      month: 'long',
      ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' as const }),
    });
  }

  isToday() {
    return dayKey(this.date()) === dayKey(new Date());
  }

  /** Veckan som visas som en remsa med dagar (mån–sön). */
  weekDays() {
    const sel = this.date();
    const from = new Date(
      sel.getFullYear(),
      sel.getMonth(),
      sel.getDate() - ((sel.getDay() + 6) % 7),
    );
    const today = dayKey(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
      return {
        date: d,
        key: dayKey(d),
        n: d.getDate(),
        label: d.toLocaleDateString(appLocale(), { weekday: 'narrow' }),
        selected: dayKey(d) === dayKey(sel),
        today: dayKey(d) === today,
      };
    });
  }

  pickDay(d: Date) {
    this.goTo(d);
  }

  private swipeX = 0;
  private swipeY = 0;
  swipeStart(e: TouchEvent) {
    this.swipeX = e.changedTouches[0].clientX;
    this.swipeY = e.changedTouches[0].clientY;
  }
  /** Svep i veckoremsan: förra eller nästa vecka, samma veckodag. */
  swipeEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - this.swipeX;
    const dy = e.changedTouches[0].clientY - this.swipeY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    const d = new Date(this.date());
    d.setDate(d.getDate() + (dx < 0 ? 7 : -7));
    this.goTo(d);
  }

  private goTo(d: Date) {
    this.date.set(d);
    if (this.mode() !== 'board' && this.$app) {
      this.$app.calendarState.setView(this.mode(), plain(d));
    }
    this.title.set(this.titleFor());
  }

  private titleFor() {
    const d = this.date();
    const m = this.mode();
    if (m === 'month-grid') {
      return d.toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' });
    }
    if (m === 'week') {
      const from = new Date(d);
      from.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const to = new Date(from);
      to.setDate(from.getDate() + 6);
      const f = (x: Date, y = false) =>
        x.toLocaleDateString(appLocale(), {
          day: 'numeric',
          month: 'short',
          ...(y ? { year: 'numeric' } : {}),
        });
      return `${f(from)} – ${f(to, true)}`;
    }
    return d.toLocaleDateString(appLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      // Året står bara när det inte är det här året.
      ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' as const }),
    });
  }

  /** Klick på en ledig tid i resursvyn: ny bokning på den mekanikern eller platsen. */
  createAt(e: { start: Date; end: Date; column: BoardColumn }) {
    const id = e.column.id || undefined;
    this.show({
      booking: null,
      start: e.start,
      end: e.end,
      ...(e.column.kind === 'mechanic' ? { resourceId: id } : { placeId: id }),
    });
  }

  setFilter(id: string) {
    this.filter.set(id);
    if (this.mode() !== 'board') this.reload();
  }

  /** "Ny bokning"-knappen: nästa hela timme, en timme lång. */
  newStart() {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  }
  newEnd() {
    return new Date(this.newStart().getTime() + 3600_000);
  }

  /** Hämtar bokningarna för perioden och gör dem till kalenderhändelser. */
  private async load(r: { start: Date; end: Date }): Promise<CalendarEvent[]> {
    const list = await firstValueFrom(this.api.between(r.start, r.end));
    const shown = list.filter(
      (b) => !this.filter() || b.resourceId === this.filter() || b.placeId === this.filter(),
    );
    this.bookings = new Map(shown.map((b) => [b.id, b]));
    return shown.map((b) => this.toEvent(b));
  }

  /** Läser om händelserna efter en ändring. */
  private reload() {
    if (!this.range || !this.app()) return;
    this.load(this.range).then((events) => this.app()?.events.set(events));
  }

  /** Färgen följer mekanikern; bokningar utan mekaniker färgas efter status. */
  private toEvent(b: Booking): CalendarEvent {
    const off = b.status === 'cancelled' || b.status === 'no_show';
    const resource = this.resources().find((r) => r.id === b.resourceId);
    const mark = {
      requested: '? ',
      done: '✓ ',
      cancelled: '✗ ',
      no_show: '✗ ',
      arrived: '→ ',
      booked: '',
    }[b.status];
    // Arbetsordern: ⚠ del saknas, ⏳ väntar på del, ▣ klar.
    const o: BookingOrder | null = b.workOrder;
    const ao = !o
      ? ''
      : o.status === 'done'
        ? '▣ '
        : o.status === 'waiting_parts'
          ? '⏳ '
          : o.hasMissing
            ? '⚠ '
            : '';
    return {
      id: b.id,
      title:
        ao +
        mark +
        [o?.code, b.title.split('\n')[0], b.regNo, b.customerName, b.resourceName]
          .filter(Boolean)
          .join(' · '),
      start: zoned(b.start),
      end: zoned(b.end),
      calendarId: off || !resource ? 's-' + b.status : 'r' + resource.id,
      _options: { additionalClasses: off ? ['opacity-60', 'line-through'] : [] },
    };
  }

  private clicked(id: string) {
    const b = this.bookings.get(id);
    if (b) this.open(b);
  }

  /** En arbetsorder planeras med knappen: bokningen öppnas med ordern vald. */
  planOrder(o: WorkOrder, drop?: { start: Date; column: BoardColumn }) {
    const start = drop?.start ?? this.suggestedStart(o);
    const asked = o.pickupAt
      ? new Date(o.pickupAt).getTime() - new Date(o.receivedAt).getTime()
      : 0;
    // Ordern har ofta en egen längd; annars en timme.
    const length = asked >= 15 * 60_000 && asked <= 12 * 3600_000 ? asked : 3600_000;
    const col = drop?.column;
    this.show({
      booking: null,
      start,
      end: new Date(start.getTime() + length),
      workOrder: o,
      ...(col?.id ? (col.kind === 'mechanic' ? { resourceId: col.id } : { placeId: col.id }) : {}),
    });
  }

  /** En order släppt på en tid i dagsvyn. */
  dropOrder(e: { start: Date; column: BoardColumn }) {
    const o = this.dragged();
    this.dragged.set(null);
    if (o) this.planOrder(o, e);
  }

  /** Ordern egen önskade tid om den ligger framåt, annars kl. 08 på dagen som visas. */
  private suggestedStart(o: WorkOrder): Date {
    const wish = new Date(o.receivedAt);
    if (wish.getTime() > Date.now()) return wish;
    const d = new Date(this.date());
    d.setHours(8, 0, 0, 0);
    return d.getTime() > Date.now() || d.toDateString() !== new Date().toDateString()
      ? d
      : nextHour();
  }

  create(start: Date, end: Date) {
    this.show({ booking: null, start, end });
  }

  open(booking: Booking) {
    this.show({ booking, start: new Date(booking.start), end: new Date(booking.end) });
  }

  private show(data: BookingDialogData) {
    this.dialog
      .open<BookingDialog, BookingDialogData, BookingDialogResult>(BookingDialog, {
        data,
        width: '1040px',
        maxWidth: '96vw',
        panelClass: 'dialog-sheet',
      })
      .afterClosed()
      .subscribe((r) => {
        if (!r) return;
        this.refresh.update((n) => n + 1);
        if (this.mode() !== 'board') this.reload();
      });
  }

  /** Dra eller dra i kanten: spara den nya tiden, annars läs om så att händelsen hoppar tillbaka. */
  private move(e: CalendarEvent) {
    const id = String(e.id);
    if (e.start instanceof Temporal.PlainDate) return;
    this.api
      .update(id, {
        start: toDate(e.start).toISOString(),
        end: toDate(e.end).toISOString(),
      })
      .subscribe({ next: () => this.reload(), error: () => this.reload() });
  }
}
