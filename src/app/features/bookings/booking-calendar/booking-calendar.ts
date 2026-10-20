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
import { catchError, firstValueFrom, forkJoin, of } from 'rxjs';
import { Auth } from '../../../core/auth/auth';
import type { BoardColumn } from '../booking-board/booking-board';
import { BookingApi } from '../../../core/api/booking-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { Booking, BookingStatus, Resource, WorkOrder } from '../../../core/models';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { environment } from '../../../../environments/environment';
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
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      <app-booking-views [value]="mode()" (pick)="setMode($event)" />

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
        <mat-form-field class="w-44 max-md:min-w-40 max-md:flex-1 max-md:basis-40" subscriptSizing="dynamic">
          <mat-label>Visa</mat-label>
          <mat-select [value]="filter()" (selectionChange)="setFilter($event.value)">
            <mat-option value="">Alla</mat-option>
            @for (r of resources(); track r.id) {
              <mat-option [value]="r.id">{{ r.name }}{{ mine(r) ? ' (jag)' : '' }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
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

    <div class="flex min-h-0 flex-1 flex-col rounded-xl bg-white p-3 shadow-sm">
      @if (mode() === 'list') {
        <app-booking-list class="min-h-0 flex-1" [embedded]="true" />
      } @else if (mode() === 'board') {
        <app-booking-board
          [day]="date()"
          [filter]="filter()"
          [refresh]="refresh()"
          (openBooking)="open($event)"
          (openOrder)="router.navigate(['/workorders', $event.id])"
          (slot)="createAt($event)"
        />
      } @else if (app(); as a) {
        <sx-calendar class="min-h-0 flex-1" [calendarApp]="a">
          <!-- Vår egen verktygsrad ovanför ersätter kalenderns. -->
          <ng-template #headerContent></ng-template>
        </sx-calendar>
      }
    </div>
  `,
})
export class BookingCalendar implements OnInit {
  private readonly api = inject(BookingApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly workOrders = inject(WorkOrderApi);
  private readonly auth = inject(Auth);
  private readonly myId = this.auth.user()?.id;
  private readonly dialog = inject(MatDialog);
  readonly router = inject(Router);

  /** Bokningar och arbetsorder för perioden som visas, för klick och dra-och-släpp. */
  private bookings = new Map<string, Booking>();
  private orders = new Map<string, WorkOrder>();
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
  private readonly mobile = window.innerWidth < 768;
  readonly mode = signal<Mode>(this.startMode());
  readonly date = signal(new Date());
  readonly title = signal('');
  readonly refresh = signal(0);
  readonly app = signal<CalendarApp | null>(null);

  /** Vy från adressen (?view=), annars den senast använda, annars dator = resurser, mobil = dag. */
  private startMode(): Mode {
    const fromUrl = inject(ActivatedRoute).snapshot.queryParamMap.get('view');
    const saved = (() => {
      try {
        return localStorage.getItem('garagestock.bookingView');
      } catch {
        return null;
      }
    })();
    const v = [fromUrl, saved].find((x) => VIEWS.includes(x as Mode)) as Mode | undefined;
    return v ?? (this.mobile ? 'day' : 'board');
  }

  /** Byt vy utan att tappa dag eller filter. */
  setMode(pick: string) {
    const m = pick as Mode;
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
        dayBoundaries: { start: '06:00', end: '19:00' },
        weekOptions: { gridHeight: 832, gridStep: 30 } as never,
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

  /** Hämtar bokningar och arbetsorder för perioden och gör dem till kalenderhändelser. */
  private async load(r: { start: Date; end: Date }): Promise<CalendarEvent[]> {
    const [list, orders] = await firstValueFrom(
      forkJoin([
        this.api.between(r.start, r.end),
        // Arbetsorder för samma period, så att kalendern kan visa hur långt de kommit.
        environment.workOrders
          ? this.workOrders
              .list({ from: r.start.toISOString(), to: r.end.toISOString(), limit: 100 })
              .pipe(catchError(() => of({ items: [] as WorkOrder[] })))
          : of({ items: [] as WorkOrder[] }),
      ]),
    );
    this.orders = new Map(orders.items.filter((o) => o.bookingId).map((o) => [o.bookingId!, o]));
    const shown = list.filter(
      (b) => !this.filter() || b.resourceId === this.filter() || b.placeId === this.filter(),
    );
    this.bookings = new Map(shown.map((b) => [b.id, b]));
    return [...shown.map((b) => this.toEvent(b))];
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
      start: zoned(b.start),
      end: zoned(b.end),
      calendarId: off || !resource ? 's-' + b.status : 'r' + resource.id,
      _options: { additionalClasses: off ? ['opacity-60', 'line-through'] : [] },
    };
  }

  private clicked(id: string) {
    if (id.startsWith('ao:')) this.router.navigate(['/workorders', id.slice(3)]);
    else {
      const b = this.bookings.get(id);
      if (b) this.open(b);
    }
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
    if (id.startsWith('ao:') || e.start instanceof Temporal.PlainDate) return;
    this.api
      .update(id, {
        start: toDate(e.start).toISOString(),
        end: toDate(e.end).toISOString(),
      })
      .subscribe({ next: () => this.reload(), error: () => this.reload() });
  }
}
