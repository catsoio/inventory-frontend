import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { appLocale } from '../../../core/i18n/locale';
import { BookingApi } from '../../../core/api/booking-api';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { Booking, WORK_ORDER_STATUS_LABELS, WorkOrder } from '../../../core/models';

/** Typen som en arbetsorder har när den dras över kalendern. */
export const ORDER_DRAG_TYPE = 'application/x-axle-order';

/**
 * Det som väntar på en tid: förfrågningar från bokningssidan och arbetsorder som ingen bokning
 * planerar än. Ett kort kan dras till en mekaniker och en tid i dagsvyn, eller planeras med
 * knappen (då öppnas bokningen med ordern vald).
 */
@Component({
  selector: 'app-booking-inbox',
  standalone: false,
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    <div class="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
      <h2 class="flex-1 text-sm font-semibold">Att planera</h2>
      <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{{
        count()
      }}</span>
    </div>
    <div class="min-h-0 flex-1 space-y-4 overflow-auto p-2">
      @if (requests().length) {
        <div>
          <h3 class="sec !mb-1 px-1">Förfrågningar från bokningssidan</h3>
          <div class="space-y-2">
            @for (b of requests(); track b.id) {
              <button
                type="button"
                class="block w-full rounded-lg border border-violet-200 bg-violet-50 p-2 text-left hover:bg-violet-100"
                (click)="openBooking.emit(b)"
              >
                <div class="flex items-center gap-1 text-xs text-violet-900">
                  <b>{{ b.regNo || 'Regnr saknas' }}</b>
                  <span class="truncate">· {{ b.customerName }}</span>
                </div>
                <div class="truncate text-sm font-medium">{{ firstLine(b.title) }}</div>
                <div class="text-xs text-violet-800">Önskar {{ when(b.start) }} · bekräfta</div>
              </button>
            }
          </div>
        </div>
      }

      <div>
        <h3 class="sec !mb-1 px-1">Arbetsorder utan tid i kalendern</h3>
        <div class="space-y-2">
          @for (o of orders(); track o.id) {
            <div
              class="cursor-grab rounded-lg border border-gray-200 bg-white p-2 shadow-sm hover:border-teal-500 active:cursor-grabbing"
              draggable="true"
              (dragstart)="dragStart($event, o)"
              (dragend)="dragging.emit(null)"
            >
              <div class="flex flex-wrap items-center gap-x-1.5 text-xs text-gray-600">
                <b class="text-gray-900">{{ o.code }}</b>
                <span>· {{ o.regNo }}</span>
                <span class="rounded bg-blue-100 px-1.5 text-blue-800">{{
                  statuses[o.status]
                }}</span>
                @if (o.hasMissing) {
                  <span class="rounded bg-amber-100 px-1.5 text-amber-800">Del saknas</span>
                }
              </div>
              <div class="truncate text-sm font-medium">{{ jobs(o) }}</div>
              <div class="truncate text-xs text-gray-500">
                {{ o.customerName }}{{ o.vehicle ? ' · ' + o.vehicle : '' }}
              </div>
              <div class="mt-1.5 flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate text-xs text-gray-500">
                  {{ wish(o) }}
                </span>
                <button
                  mat-stroked-button
                  type="button"
                  class="!h-8 !min-w-0 !px-3 text-xs"
                  (click)="plan.emit(o)"
                >
                  Planera
                </button>
              </div>
            </div>
          } @empty {
            <p class="px-1 text-sm text-gray-500">
              {{
                loading()
                  ? 'Hämtar…'
                  : 'Allt är inplanerat. Nya arbetsorder utan tid dyker upp här.'
              }}
            </p>
          }
        </div>
        @if (orders().length) {
          <p class="mt-2 px-1 text-xs text-gray-500">
            Dra ett kort till en mekaniker och tid i dagsvyn, eller tryck Planera.
          </p>
        }
      </div>
    </div>
  `,
})
export class BookingInbox implements OnChanges {
  private readonly bookingApi = inject(BookingApi);
  private readonly orderApi = inject(WorkOrderApi);

  /** Ökas av föräldern när något sparats, så att listan läses om. */
  @Input() refresh = 0;
  @Output() plan = new EventEmitter<WorkOrder>();
  @Output() openBooking = new EventEmitter<Booking>();
  /** Ordern som dras just nu (null när den släpps), så att dagsvyn vet vad den tar emot. */
  @Output() dragging = new EventEmitter<WorkOrder | null>();
  /** Antal som väntar, för knappen i verktygsfältet. */
  @Output() counted = new EventEmitter<number>();

  readonly statuses = WORK_ORDER_STATUS_LABELS;
  readonly loading = signal(true);
  readonly requests = signal<Booking[]>([]);
  readonly orders = signal<WorkOrder[]>([]);
  count = () => this.requests().length + this.orders().length;

  ngOnChanges() {
    this.load();
  }

  private load() {
    const from = new Date();
    from.setDate(from.getDate() - 1);
    const to = new Date(from);
    to.setDate(to.getDate() + 61);
    this.loading.set(true);
    forkJoin([
      this.bookingApi.between(from, to).pipe(catchError(() => of([] as Booking[]))),
      environment.workOrders
        ? this.orderApi
            .list({ active: true, unbooked: true, limit: 100 })
            .pipe(catchError(() => of({ items: [] as WorkOrder[] })))
        : of({ items: [] as WorkOrder[] }),
    ]).subscribe(([bookings, orders]) => {
      this.requests.set(bookings.filter((b) => b.status === 'requested'));
      this.orders.set(
        orders.items
          .filter((o) => !o.locked)
          .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)),
      );
      this.loading.set(false);
      this.counted.emit(this.count());
    });
  }

  dragStart(ev: DragEvent, o: WorkOrder) {
    ev.dataTransfer?.setData(ORDER_DRAG_TYPE, o.id);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    this.dragging.emit(o);
  }

  jobs(o: WorkOrder) {
    const t = (o.jobs ?? [])
      .map((j) => j.title.trim())
      .filter(Boolean)
      .join(', ');
    return t || o.remarks?.trim() || 'Ingen text';
  }

  firstLine(text: string) {
    return text.split('\n')[0];
  }

  /** Tiden ordern själv har, att utgå från när den planeras. */
  wish(o: WorkOrder) {
    const a = new Date(o.receivedAt);
    const day = a.toLocaleDateString(appLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const t = (d: Date) =>
      d.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
    return `Önskad tid: ${day} ${t(a)}${o.pickupAt ? '–' + t(new Date(o.pickupAt)) : ''}`;
  }

  when(iso: string) {
    const d = new Date(iso);
    return `${d.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' })}`;
  }
}
