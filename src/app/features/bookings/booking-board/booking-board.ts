import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BookingApi } from '../../../core/api/booking-api';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { Booking, BookingStatus, Resource, WorkOrder } from '../../../core/models';

const FIRST_HOUR = 6;
const LAST_HOUR = 19;
/** Pixlar per timme i tidsaxeln. */
const HOUR_PX = 64;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);

const STATUS_COLOR: Record<BookingStatus, string> = {
  booked: '#1976d2',
  arrived: '#f59e0b',
  done: '#16a34a',
  cancelled: '#9ca3af',
  no_show: '#dc2626',
};

export interface BoardColumn {
  /** Resurs-id, eller '' för bokningar utan mekaniker och plats. */
  id: string;
  name: string;
  kind: 'mechanic' | 'lift' | 'bay' | 'none';
  color: string;
}

interface Block {
  booking: Booking;
  order: WorkOrder | undefined;
  /** Kopia i lyftets kolumn: samma bokning, men mekanikern äger den. */
  ghost: boolean;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

/**
 * Dagen per mekaniker och lyft: en kolumn per resurs med tidsaxeln nedåt, så att man ser vem som
 * gör vad och vilket lyft som är ledigt. Arbetsorder utan tid ligger i en rad ovanför.
 */
@Component({
  selector: 'app-booking-board',
  standalone: false,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    @if (orderChips().length) {
      <div class="mb-2 flex shrink-0 flex-wrap items-center gap-2 text-sm">
        <span class="text-gray-500">Arbetsorder utan tid:</span>
        @for (c of orderChips(); track c.order.id) {
          <button
            type="button"
            class="flex items-center gap-1 rounded-full px-3 py-1 text-white"
            [style.background]="c.color"
            (click)="openOrder.emit(c.order)"
          >
            {{ mark(c.order) }}{{ c.order.code }} · {{ c.order.regNo }}
            @if (c.order.resourceName) {
              <span class="opacity-80">· {{ c.order.resourceName }}</span>
            }
          </button>
        }
      </div>
    }

    <div class="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200">
      <div class="flex min-w-max">
        <div class="sticky left-0 z-20 w-12 shrink-0 border-r border-gray-200 bg-white">
          <div class="sticky top-0 z-10 h-12 border-b border-gray-200 bg-white"></div>
          @for (h of hours; track h) {
            <div
              class="relative border-b border-gray-100 pr-1 text-right text-xs text-gray-500"
              [style.height.px]="hourPx"
            >
              <span class="relative -top-2 bg-white px-0.5">{{ h < 10 ? '0' + h : h }}</span>
            </div>
          }
        </div>

        @for (col of columns(); track col.id) {
          <div class="min-w-44 flex-1 border-r border-gray-200 last:border-r-0">
            <div
              class="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-gray-200 bg-white px-3"
            >
              <span class="h-3 w-3 shrink-0 rounded-full" [style.background]="col.color"></span>
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold">{{ col.name }}</div>
                <div class="text-xs text-gray-500">
                  {{ kindLabel[col.kind] }}
                </div>
              </div>
            </div>
            <div
              class="relative cursor-pointer"
              [style.height.px]="hours.length * hourPx"
              [style.background]="columnBg()"
              (click)="clickColumn(col, $event)"
            >
              @if (nowTop() !== null) {
                <div
                  class="pointer-events-none absolute right-0 left-0 z-10 border-t-2 border-red-500"
                  [style.top.px]="nowTop()"
                ></div>
              }
              @for (b of blocksOf(col); track b.booking.id + (b.ghost ? ':g' : '')) {
                <button
                  type="button"
                  class="absolute overflow-hidden rounded-md px-2 py-1 text-left text-xs leading-tight text-white shadow-sm ring-1 ring-white/60"
                  [class.opacity-60]="b.ghost || off(b.booking)"
                  [class.line-through]="off(b.booking)"
                  [style.top.px]="b.top"
                  [style.height.px]="b.height"
                  [style.left.%]="(b.lane / b.lanes) * 100"
                  [style.width.%]="100 / b.lanes"
                  [style.background]="color(b)"
                  [style.border]="b.ghost ? '2px dashed rgba(255,255,255,.8)' : ''"
                  (click)="$event.stopPropagation(); openBooking.emit(b.booking)"
                >
                  <div class="font-semibold">
                    {{ mark(b.order) }}{{ time(b.booking.start) }}–{{ time(b.booking.end) }}
                  </div>
                  <div class="truncate">{{ b.booking.title }}</div>
                  @if (b.height > 44) {
                    <div class="truncate opacity-90">
                      {{ b.booking.regNo
                      }}{{ b.booking.customerName ? ' · ' + b.booking.customerName : '' }}
                    </div>
                  }
                  @if (b.height > 62 && b.ghost) {
                    <div class="truncate opacity-90">Mekaniker: {{ b.booking.resourceName }}</div>
                  }
                </button>
              }
            </div>
          </div>
        } @empty {
          <p class="p-6 text-sm text-gray-500">
            @if (loading()) {
              Hämtar…
            } @else {
              Inga mekaniker eller platser än. Lägg till under Register › Mekaniker och platser.
            }
          </p>
        }
      </div>
    </div>
  `,
})
export class BookingBoard implements OnChanges {
  private readonly bookingApi = inject(BookingApi);
  private readonly orderApi = inject(WorkOrderApi);
  private readonly workshop = inject(WorkshopApi);

  /** Dagen som visas. */
  @Input({ required: true }) day!: Date;
  /** Resurs-id som visningen är begränsad till, tomt = alla. */
  @Input() filter = '';
  /** Ökas av föräldern när något sparats, så att dagen läses om. */
  @Input() refresh = 0;
  @Output() openBooking = new EventEmitter<Booking>();
  @Output() openOrder = new EventEmitter<WorkOrder>();
  /** Klick på en ledig tid i en kolumn. */
  @Output() slot = new EventEmitter<{ start: Date; end: Date; column: BoardColumn }>();

  readonly hours = HOURS;
  readonly hourPx = HOUR_PX;
  readonly kindLabel = { mechanic: 'Mekaniker', lift: 'Lyft', bay: 'Plats', none: 'Ingen vald' };
  readonly loading = signal(true);
  readonly columns = signal<BoardColumn[]>([]);
  readonly orderChips = signal<{ order: WorkOrder; color: string }[]>([]);
  private bookings: Booking[] = [];
  private orders = new Map<string, WorkOrder>();
  private resources: Resource[] = [];

  ngOnChanges() {
    this.load();
  }

  private load() {
    const from = new Date(this.day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    this.loading.set(true);
    forkJoin([
      this.workshop.resources(),
      this.bookingApi.between(from, to),
      environment.workOrders
        ? this.orderApi
            .list({ from: from.toISOString(), to: to.toISOString(), limit: 100 })
            .pipe(catchError(() => of({ items: [] as WorkOrder[] })))
        : of({ items: [] as WorkOrder[] }),
    ]).subscribe(([resources, bookings, orders]) => {
      this.resources = resources.filter((r) => r.active);
      this.bookings = bookings.filter(
        (b) => !this.filter || b.resourceId === this.filter || b.placeId === this.filter,
      );
      this.orders = new Map(orders.items.filter((o) => o.bookingId).map((o) => [o.bookingId!, o]));
      this.build(orders.items);
      this.loading.set(false);
    });
  }

  private build(allOrders: WorkOrder[]) {
    const order = { mechanic: 0, lift: 1, bay: 2 };
    let cols: BoardColumn[] = this.resources
      .filter((r) => !this.filter || r.id === this.filter)
      .sort((a, b) => order[a.kind] - order[b.kind] || a.number - b.number)
      .map((r) => ({ id: r.id, name: r.name, kind: r.kind, color: r.color }));
    if (this.bookings.some((b) => !b.resourceId && !b.placeId)) {
      cols = [...cols, { id: '', name: 'Ej tilldelad', kind: 'none', color: '#6b7280' }];
    }
    this.columns.set(cols);
    this.orderChips.set(
      allOrders
        .filter(
          (o) =>
            !o.bookingId &&
            o.status !== 'cancelled' &&
            (!this.filter || o.resourceId === this.filter || o.placeId === this.filter),
        )
        .map((o) => ({
          order: o,
          color: this.resources.find((r) => r.id === o.resourceId)?.color ?? '#475569',
        })),
    );
  }

  blocksOf(col: BoardColumn): Block[] {
    const mine = this.bookings
      .filter((b) =>
        col.kind === 'none'
          ? !b.resourceId && !b.placeId
          : b.resourceId === col.id || b.placeId === col.id,
      )
      .sort((a, b) => a.start.localeCompare(b.start));
    // Överlappande bokningar delar kolumnen i filer.
    const laneEnds: number[] = [];
    const blocks: Block[] = mine.map((b) => {
      const start = new Date(b.start);
      const end = new Date(b.end);
      const s = Math.max(minutes(start), FIRST_HOUR * 60);
      const e = Math.min(Math.max(minutes(end), s + 15), LAST_HOUR * 60);
      let lane = laneEnds.findIndex((x) => x <= s);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = e;
      return {
        booking: b,
        order: this.orders.get(b.id),
        ghost: col.kind !== 'mechanic' && col.kind !== 'none' && b.resourceId !== col.id,
        top: ((s - FIRST_HOUR * 60) / 60) * HOUR_PX,
        height: Math.max(((e - s) / 60) * HOUR_PX - 2, 22),
        lane,
        lanes: 1,
      };
    });
    for (const b of blocks) b.lanes = laneEnds.length;
    return blocks;
  }

  clickColumn(col: BoardColumn, ev: MouseEvent) {
    const el = ev.currentTarget as HTMLElement;
    const y = ev.clientY - el.getBoundingClientRect().top;
    const mins = Math.floor(((y / HOUR_PX) * 60) / 30) * 30 + FIRST_HOUR * 60;
    const start = new Date(this.day);
    start.setHours(0, mins, 0, 0);
    this.slot.emit({ start, end: new Date(start.getTime() + 3600_000), column: col });
  }

  /** Timlinjer; dagens kolumner är dessutom randiga. */
  columnBg(): string {
    const lines = `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, #f3f4f6 ${HOUR_PX - 1}px, #f3f4f6 ${HOUR_PX}px)`;
    if (this.day.toDateString() !== new Date().toDateString()) return lines;
    return `${lines}, repeating-linear-gradient(135deg, #f1f7f6 0 9px, #e3f0ee 9px 18px)`;
  }

  nowTop(): number | null {
    const now = new Date();
    if (now.toDateString() !== this.day.toDateString()) return null;
    const m = minutes(now);
    if (m < FIRST_HOUR * 60 || m > LAST_HOUR * 60) return null;
    return ((m - FIRST_HOUR * 60) / 60) * HOUR_PX;
  }

  off(b: Booking) {
    return b.status === 'cancelled' || b.status === 'no_show';
  }

  color(b: Block) {
    if (this.off(b.booking)) return STATUS_COLOR[b.booking.status];
    const r = this.resources.find((x) => x.id === b.booking.resourceId);
    return r?.color ?? STATUS_COLOR[b.booking.status];
  }

  /** Arbetsordern: ⚠ del saknas, ⏳ väntar på del, ▣ klar. */
  mark(o: WorkOrder | undefined) {
    if (!o) return '';
    if (o.status === 'done') return '▣ ';
    if (o.status === 'waiting_parts') return '⏳ ';
    return o.hasMissing ? '⚠ ' : '';
  }

  time(iso: string) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
