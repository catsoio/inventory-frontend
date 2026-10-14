import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
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
import { BookingApi } from '../../../core/api/booking-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { Booking, BookingStatus, Resource } from '../../../core/models';
import {
  BookingDialog,
  BookingDialogData,
  BookingDialogResult,
} from '../../../shared/booking-dialog/booking-dialog';

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
    <div class="mb-3 flex shrink-0 items-center gap-3">
      <h1 class="text-2xl font-semibold max-md:hidden">Tidsbokning</h1>
      <mat-form-field class="w-52 max-md:min-w-0 max-md:flex-1" subscriptSizing="dynamic">
        <mat-label>Visa</mat-label>
        <mat-select [value]="filter()" (selectionChange)="setFilter($event.value)">
          <mat-option value="">Alla</mat-option>
          @for (r of resources(); track r.id) {
            <mat-option [value]="r.id">{{ r.name }}{{ mine(r) ? " (jag)" : "" }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <span class="flex-1 max-md:hidden"></span>
      <button
        mat-flat-button
        color="primary"
        class="whitespace-nowrap"
        (click)="create(newStart(), newEnd())"
      >
        <mat-icon>add</mat-icon> Ny<span class="max-md:hidden">&nbsp;bokning</span>
      </button>
    </div>
    <div class="min-h-0 flex-1 rounded-xl bg-white p-3 shadow-sm">
      <full-calendar [options]="options" />
    </div>
  `,
})
export class BookingCalendar implements OnInit {
  private readonly api = inject(BookingApi);
  private readonly workshop = inject(WorkshopApi);
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

  readonly options: CalendarOptions = {
    plugins: [themePlugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
    locale: svLocale,
    initialView: this.mobile ? 'timeGridDay' : 'timeGridWeek',
    height: '100%',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: this.mobile ? '' : 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
    },
    weekNumbers: true,
    nowIndicator: true,
    allDaySlot: false,
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
      this.api.between(info.start, info.end).subscribe({
        next: (list) =>
          success(
            list
              .filter((b) => !this.filter() || b.resourceId === this.filter())
              .map((b) => this.toEvent(b)),
          ),
        error: failure,
      }),
    select: (arg) => this.create(arg.start, arg.end),
    eventClick: (arg) => this.open(arg.event.extendedProps['booking'] as Booking),
    eventDrop: (arg) => this.move(arg),
    eventResize: (arg) => this.move(arg),
  };

  ngOnInit() {
    this.workshop.resources(true).subscribe((r) => {
      this.resources.set(r);
      // En mekaniker med eget konto ser sina egna bokningar först; "Alla" finns kvar.
      const mine = r.find((x) => this.mine(x) && x.active);
      if (mine && !this.auth.isAdmin()) this.filter.set(mine.id);
    });
  }

  setFilter(id: string) {
    this.filter.set(id);
    this.calendar.getApi().refetchEvents();
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

  /** Färgen följer mekanikern; bokningar utan mekaniker färgas efter status. */
  private toEvent(b: Booking) {
    const off = b.status === 'cancelled' || b.status === 'no_show';
    const resource = this.resources().find((r) => r.id === b.resourceId);
    const mark = { done: '✓ ', cancelled: '✗ ', no_show: '✗ ', arrived: '→ ', booked: '' }[
      b.status
    ];
    return {
      id: b.id,
      title: mark + [b.title, b.regNo, b.customerName, b.resourceName].filter(Boolean).join(' · '),
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

  private open(booking: Booking) {
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
      .subscribe((r) => r && this.calendar.getApi().refetchEvents());
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
