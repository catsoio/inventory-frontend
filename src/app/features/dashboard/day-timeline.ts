import { Component, computed, input, output } from '@angular/core';
import { Booking, Resource } from '../../core/models';

interface Placed {
  booking: Booking;
  /** Kortare än en timme och en kvart: bara regnumret ryms. */
  short: boolean;
  lane: number;
  left: number;
  width: number;
}

interface Row {
  key: string;
  name: string;
  color: string;
  lanes: number;
  items: Placed[];
}

const hours = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
};
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

/**
 * Dagen på en rad per mekaniker: var det finns luft, vem som har mest och vad som pågår just nu.
 * Staplarna är bokningarna (mekanikerns färg), med en tunn linje för klockan. Klick öppnar
 * bokningen. Bara för dator; mobilen visar dagen som en lista.
 */
@Component({
  selector: 'app-day-timeline',
  standalone: false,
  host: { class: 'block' },
  template: `
    <div class="grid grid-cols-[92px_1fr] text-xs text-gray-500">
      <span></span>
      <div class="relative h-5">
        @for (h of ticks(); track h) {
          <span
            class="absolute -translate-x-1/2 tabular-nums"
            [style.left.%]="pct(h)"
            [class.hidden]="h === win().from || h === win().to"
            >{{ h }}</span
          >
        }
      </div>
    </div>
    @for (r of rows(); track r.key) {
      <div class="grid grid-cols-[92px_1fr] items-stretch border-t border-gray-100">
        <div class="flex items-center gap-2 pr-2">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" [style.background]="r.color"></span>
          <span class="truncate text-sm font-medium">{{ r.name }}</span>
        </div>
        <div class="relative" [style.height.px]="Math.max(r.lanes, 1) * 38 + 6">
          @for (h of ticks(); track h) {
            <span class="absolute inset-y-0 w-px bg-gray-100" [style.left.%]="pct(h)"></span>
          }
          @for (p of r.items; track p.booking.id) {
            <button
              type="button"
              class="absolute overflow-hidden rounded-md border-l-[3px] px-1.5 text-left text-[11px] leading-tight transition hover:brightness-95 focus-visible:outline-2"
              [style.left.%]="p.left"
              [style.width.%]="p.width"
              [style.top.px]="p.lane * 38 + 4"
              [style.height.px]="34"
              [style.border-color]="r.color"
              [style.background]="'color-mix(in srgb, ' + r.color + ' 16%, white)'"
              [style.color]="'color-mix(in srgb, ' + r.color + ' 62%, black)'"
              [class.opacity-55]="p.booking.status === 'done'"
              [class.ring-2]="p.booking.status === 'arrived'"
              [class.ring-amber-400]="p.booking.status === 'arrived'"
              [title]="tip(p.booking)"
              [attr.aria-label]="tip(p.booking)"
              (click)="openBooking.emit(p.booking)"
            >
              @if (p.short) {
                <span class="block truncate font-semibold">{{
                  p.booking.regNo || firstName(p.booking.customerName)
                }}</span>
              } @else {
                <span class="block truncate font-semibold">{{ p.booking.title }}</span>
                <span class="block truncate opacity-80">{{
                  p.booking.regNo || p.booking.customerName
                }}</span>
              }
            </button>
          }
          @if (nowPct(); as n) {
            <span
              class="pointer-events-none absolute inset-y-0 z-10 w-px bg-gray-700"
              [style.left.%]="n"
            ></span>
          }
        </div>
      </div>
    } @empty {
      <p class="border-t border-gray-100 py-6 text-center text-sm text-gray-500">
        Inga bokningar idag.
      </p>
    }
  `,
})
export class DayTimeline {
  readonly bookings = input.required<Booking[]>();
  readonly resources = input.required<Resource[]>();
  /** Klockan (ms), så att linjen följer dagen. */
  readonly now = input.required<number>();
  readonly openBooking = output<Booking>();
  readonly Math = Math;

  /** Fönstret: 07–17 som lägst, men alla bokningar ska rymmas. */
  readonly win = computed(() => {
    const b = this.bookings();
    const from = Math.max(5, Math.min(7, ...b.map((x) => Math.floor(hours(x.start)))));
    const to = Math.min(22, Math.max(17, ...b.map((x) => Math.ceil(hours(x.end)))));
    return { from, to };
  });
  readonly ticks = computed(() => {
    const { from, to } = this.win();
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  });
  readonly nowPct = computed(() => {
    const d = new Date(this.now());
    const h = d.getHours() + d.getMinutes() / 60;
    const { from, to } = this.win();
    return h >= from && h <= to ? this.pct(h) : null;
  });

  pct(h: number): number {
    const { from, to } = this.win();
    return ((h - from) / (to - from)) * 100;
  }

  readonly rows = computed<Row[]>(() => {
    const mechanics = this.resources().filter((r) => r.kind === 'mechanic' && r.active);
    const ids = new Set(mechanics.map((m) => m.id));
    const rows: Row[] = mechanics.map((m) => ({
      key: m.id,
      name: m.name,
      color: m.color,
      lanes: 1,
      items: [],
    }));
    const loose: Booking[] = [];
    for (const b of this.bookings()) {
      const row =
        b.resourceId && ids.has(b.resourceId) ? rows.find((r) => r.key === b.resourceId) : null;
      if (row) row.items.push({ booking: b, short: false, lane: 0, left: 0, width: 0 });
      else loose.push(b);
    }
    if (loose.length) {
      rows.push({
        key: 'none',
        name: 'Ej tilldelad',
        color: '#64748b',
        lanes: 1,
        items: loose.map((b) => ({ booking: b, short: false, lane: 0, left: 0, width: 0 })),
      });
    }
    for (const r of rows) this.pack(r);
    // Mekaniker utan något idag visas inte, så att raderna är de som har något att visa.
    return rows.filter((r) => r.items.length);
  });

  /** Lägger bokningar som överlappar på varsin rad (fil) så att inget döljer något. */
  private pack(row: Row) {
    const ends: number[] = [];
    row.items.sort((a, b) => a.booking.start.localeCompare(b.booking.start));
    for (const it of row.items) {
      const s = hours(it.booking.start);
      const e = Math.max(hours(it.booking.end), s + 0.25);
      let lane = ends.findIndex((x) => x <= s + 1e-6);
      if (lane < 0) lane = ends.length;
      ends[lane] = e;
      it.lane = lane;
      it.short = e - s < 1.25;
      it.left = this.pct(s);
      it.width = Math.max(this.pct(e) - this.pct(s), 4);
    }
    row.lanes = Math.max(ends.length, 1);
  }

  firstName(name: string): string {
    return name.split(' ')[0];
  }

  tip(b: Booking): string {
    return `${hhmm(b.start)}–${hhmm(b.end)} ${b.title}${b.regNo ? ' · ' + b.regNo : ''} · ${b.customerName}`;
  }
}
