import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { CalendarOptions } from 'fullcalendar';
import { FullCalendarComponent } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import listPlugin from '@fullcalendar/angular/list';
import svLocale from 'fullcalendar/locales/sv';
import timeGridPlugin from '@fullcalendar/angular/timegrid';
import themePlugin from '@fullcalendar/angular/themes/classic';
import { Auth } from '../../../core/auth/auth';
import type { BoardColumn } from '../booking-board/booking-board';
import { BookingApi } from '../../../core/api/booking-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { Booking, BookingStatus, Resource, WorkOrder } from '../../../core/models';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { environment } from '../../../../environments/environment';
import { catchError, forkJoin, of } from 'rxjs';
import {
  BookingDialog,
  BookingDialogData,
  BookingDialogResult,
} from '../../../shared/booking-dialog/booking-dialog';

type FcMode = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth';
type Mode = FcMode | 'board';

const COLORS: Record<BookingStatus, string> = {
  booked: '#1976d2',
  arrived: '#f59e0b',
  done: '#16a34a',
  cancelled: '#9ca3af',
  no_show: '#dc2626',
};

@Component({
  selector: 'app-booking-calendar',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      <h1 class="mr-2 text-2xl font-semibold max-md:hidden">Tidsbokning</h1>

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

      <span class="flex-1"></span>

      <mat-form-field class="w-44 max-md:min-w-0 max-md:flex-1" subscriptSizing="dynamic">
        <mat-label>Visa</mat-label>
        <mat-select [value]="filter()" (selectionChange)="setFilter($event.value)">
          <mat-option value="">Alla</mat-option>
          @for (r of resources(); track r.id) {
            <mat-option [value]="r.id">{{ r.name }}{{ mine(r) ? ' (jag)' : '' }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <button
        mat-flat-button
        color="primary"
        class="whitespace-nowrap"
        (click)="create(newStart(), newEnd())"
      >
        <mat-icon>add</mat-icon> Ny<span class="max-md:hidden">&nbsp;bokning</span>
      </button>
    </div>

    <div class="flex min-h-0 flex-1 flex-col rounded-xl bg-white p-3 shadow-sm">
      @if (mode() === 'board') {
        <app-booking-board
          [day]="date()"
          [filter]="filter()"
          [refresh]="refresh()"
          (openBooking)="open($event)"
          (openOrder)="router.navigate(['/workorders', $event.id])"
          (slot)="createAt($event)"
        />
      } @else {
        <full-calendar class="min-h-0 flex-1" [options]="options()" />
      }
    </div>
  `,
})
export class BookingCalendar implements OnInit {
  private readonly api = inject(BookingApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly workOrders = inject(WorkOrderApi);
  /** Bokningarnas arbetsorder för perioden som visas. */
  private orders = new Map<string, WorkOrder>();
  private readonly auth = inject(Auth);
  private readonly myId = this.auth.user()?.id;
  /** Mekaniker som är kopplad till den inloggade, om någon. */
  mine(r: Resource) {
    return !!this.myId && r.userId === this.myId;
  }

  readonly resources = signal<Resource[]>([]);
  /** Resurs-id som kalendern är filtrerad på, tomt = alla. */
  readonly filter = signal('');
  private readonly dialog = inject(MatDialog);

  @ViewChild(FullCalendarComponent) calendar!: FullCalendarComponent;

  /** Mobil: bara dagvyn, med pilar och Idag. */
  private readonly mobile = window.innerWidth < 768;

  /** Vyn väljs i sidomenyn (routens `data.view`); mobilen visar resursvyn som dagvy. */
  readonly mode = signal<Mode>(this.startMode());
  /** Dagen/perioden som visas; följer med när man byter vy. */
  private startMode(): Mode {
    const v = inject(ActivatedRoute).snapshot.data['view'] as Mode | undefined;
    return v === 'board' && this.mobile ? 'timeGridDay' : (v ?? 'board');
  }

  readonly date = signal(new Date());
  readonly title = signal('');
  readonly refresh = signal(0);
  readonly router = inject(Router);
  readonly options = signal<CalendarOptions>(this.buildOptions());

  private buildOptions(): CalendarOptions {
    return this.baseOptions(this.mode() === 'board' ? 'timeGridDay' : (this.mode() as FcMode));
  }

  private baseOptions(view: FcMode): CalendarOptions {
    return {
      plugins: [themePlugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
      locale: svLocale,
      initialView: view,
      initialDate: this.date(),
      height: '100%',
      // Verktygsfältet (datum, vyer, filter) ligger ovanför och styr kalendern.
      headerToolbar: false,
      datesSet: (arg) => {
        this.title.set(arg.view.title);
        this.date.set(arg.view.currentStart);
      },
      dayMaxEventRows: 3,
      weekNumbers: true,
      nowIndicator: true,
      allDaySlot: true,
      allDayText: 'AO',
      slotMinTime: '06:00:00',
      slotMaxTime: '19:00:00',
      slotDuration: '00:30:00',
      snapDuration: '00:15:00',
      scrollTime: '07:00:00',
      businessHours: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '07:00', endTime: '17:00' },
      selectable: true,
      editable: true,
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      events: (info, success, failure) =>
        forkJoin([
          this.api.between(info.start, info.end),
          // Arbetsorder för samma period, så att kalendern kan visa hur långt de kommit.
          environment.workOrders
            ? this.workOrders
                .list({ from: info.start.toISOString(), to: info.end.toISOString(), limit: 100 })
                .pipe(catchError(() => of({ items: [] as WorkOrder[] })))
            : of({ items: [] as WorkOrder[] }),
        ]).subscribe({
          next: ([list, orders]) => {
            this.orders = new Map(
              orders.items.filter((o) => o.bookingId).map((o) => [o.bookingId!, o]),
            );
            success([
              ...list
                .filter(
                  (b) =>
                    !this.filter() || b.resourceId === this.filter() || b.placeId === this.filter(),
                )
                .map((b) => this.toEvent(b)),
              ...this.orderEvents(orders.items),
            ]);
          },
          error: failure,
        }),
      select: (arg) => this.create(arg.start, arg.end),
      eventClick: (arg) => {
        const orderId = arg.event.extendedProps['orderId'] as string | undefined;
        if (orderId) this.router.navigate(['/workorders', orderId]);
        else this.open(arg.event.extendedProps['booking'] as Booking);
      },
      eventDrop: (arg) => this.move(arg),
      eventResize: (arg) => this.move(arg),
    };
  }

  step(dir: 1 | -1) {
    if (this.mode() === 'board') {
      const d = new Date(this.date());
      d.setDate(d.getDate() + dir);
      this.date.set(d);
      this.title.set(this.dayTitle());
    } else if (dir === 1) {
      this.calendar.getApi().next();
    } else {
      this.calendar.getApi().prev();
    }
  }

  today() {
    if (this.mode() === 'board') {
      this.date.set(new Date());
      this.title.set(this.dayTitle());
    } else {
      this.calendar.getApi().today();
    }
  }

  private dayTitle() {
    return this.date().toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
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

  ngOnInit() {
    if (this.mode() === 'board') this.title.set(this.dayTitle());
    this.workshop.resources(true).subscribe((r) => {
      this.resources.set(r);
      // En mekaniker med eget konto ser sina egna bokningar först; "Alla" finns kvar.
      const mine = r.find((x) => this.mine(x) && x.active);
      if (mine && !this.auth.isAdmin()) this.filter.set(mine.id);
    });
  }

  setFilter(id: string) {
    this.filter.set(id);
    if (this.mode() !== 'board') this.calendar.getApi().refetchEvents();
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

  /**
   * Arbetsorder utan bokning syns som heldagsfält från start till klar senast, så att
   * jobb som lagts direkt (utan tid i kalendern) också går att se.
   */
  private orderEvents(orders: WorkOrder[]) {
    return orders
      .filter(
        (o) =>
          !o.bookingId &&
          o.status !== 'cancelled' &&
          (!this.filter() || o.resourceId === this.filter() || o.placeId === this.filter()),
      )
      .map((o) => {
        const start = new Date(o.receivedAt);
        const last = new Date(o.pickupAt ?? o.receivedAt);
        const end = new Date(Math.max(last.getTime(), start.getTime()));
        end.setDate(end.getDate() + 1);
        const day = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const resource = this.resources().find((r) => r.id === o.resourceId);
        return {
          id: 'ao:' + o.id,
          title: `${o.status === 'done' ? '▣ ' : o.hasMissing ? '⚠ ' : ''}${o.code} · ${o.regNo} · ${o.customerName}`,
          start: day(start),
          end: day(end),
          allDay: true,
          editable: false,
          color: resource?.color ?? '#475569',
          classNames: o.status === 'done' ? ['opacity-60'] : [],
          extendedProps: { orderId: o.id },
        };
      });
  }

  /** Färgen följer mekanikern; bokningar utan mekaniker färgas efter status. */
  private toEvent(b: Booking) {
    const off = b.status === 'cancelled' || b.status === 'no_show';
    const resource = this.resources().find((r) => r.id === b.resourceId);
    const mark = { done: '✓ ', cancelled: '✗ ', no_show: '✗ ', arrived: '→ ', booked: '' }[
      b.status
    ];
    // Arbetsordern: ⚠ del saknas, ⏳ väntar på del, ▣ klar.
    const o = this.orders.get(b.id);
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
        ao + mark + [b.title, b.regNo, b.customerName, b.resourceName].filter(Boolean).join(' · '),
      start: b.start,
      end: b.end,
      color: off ? COLORS[b.status] : (resource?.color ?? COLORS[b.status]),
      classNames: off ? ['opacity-60', 'line-through'] : [],
      extendedProps: { booking: b },
    };
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
        width: '720px',
        maxWidth: '96vw',
        panelClass: 'dialog-sheet',
      })
      .afterClosed()
      .subscribe((r) => {
        if (!r) return;
        this.refresh.update((n) => n + 1);
        if (this.mode() !== 'board') this.calendar.getApi().refetchEvents();
      });
  }

  /** Dra eller dra i kanten: spara den nya tiden, annars flytta tillbaka. */
  private move(arg: {
    event: { id: string; start: Date | null; end: Date | null };
    revert: () => void;
  }) {
    const { id, start, end } = arg.event;
    if (!start || !end) return arg.revert();
    this.api.update(id, { start: start.toISOString(), end: end.toISOString() }).subscribe({
      next: () => this.calendar.getApi().refetchEvents(),
      error: () => arg.revert(),
    });
  }
}
