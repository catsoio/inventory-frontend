import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { ChartConfiguration } from 'chart.js';
import { brandColor } from '../../shared/chart/chart';
import { loadTrades } from '../finance/invoices';
import { TradeRow } from '../../core/models';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { BookingApi } from '../../core/api/booking-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import { InventoryApi } from '../../core/api/inventory-api';
import { StorageApi } from '../../core/api/storage-api';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { environment } from '../../../environments/environment';
import {
  BOOKING_STATUS_LABELS,
  Booking,
  Report,
  Resource,
  WorkOrder,
  WorkOrderStatus,
} from '../../core/models';
import {
  BookingDialog,
  BookingDialogData,
  BookingDialogResult,
} from '../../shared/booking-dialog/booking-dialog';
import { DtCol } from '../../shared/data-table/data-table';
import { Auth } from '../../core/auth/auth';
import { Settings } from '../../core/settings';
import { KrPipe } from '../../shared/kr-pipe';

interface Delta {
  text: string;
  icon: string;
  cls: string;
}

/** En ruta med ett nyckeltal. */
interface Card {
  label: string;
  icon: string;
  value: string | number;
  sub: string;
  delta?: Delta;
  link: string;
  params: Record<string, string | number | boolean>;
  /** Ikonens färg, samma ton som bakgrunden fast mörkare. */
  ico: string;
}

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toLocaleDateString('sv-SE');

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

const BOOKING_COLS: DtCol<Booking>[] = [
  {
    key: 'time',
    label: 'Tid',
    value: (b) => b.start,
    fmt: (b) => `${time(b.start)}–${time(b.end)}`,
  },
  { key: 'title', label: 'Vad', value: (b) => b.title },
  { key: 'regNo', label: 'Regnr', value: (b) => b.regNo ?? '', fmt: (b) => b.regNo || '–' },
  { key: 'customer', label: 'Kund', value: (b) => b.customerName },
  {
    key: 'resource',
    label: 'Mekaniker',
    value: (b) => b.resourceName ?? '',
    fmt: (b) => b.resourceName || '–',
  },
  { key: 'status', label: 'Status', value: (b) => BOOKING_STATUS_LABELS[b.status] },
];

/**
 * Hem: en snabb startsida som ryms på en skärm utan att scrolla. Rutorna är grupperade per
 * ämne: lager och däckhotell till vänster över dagens bokningar, pengarna till höger med
 * loggen under. Menyn leder till resten.
 */
@Component({
  selector: 'app-dashboard',
  standalone: false,
  host: { class: 'flex h-full flex-col gap-4 overflow-auto' },
  styles: `
    .order-card {
      cursor: grab;
    }
    .cdk-drag-preview {
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
      border-radius: 8px;
      cursor: grabbing;
    }
    .cdk-drag-placeholder {
      opacity: 0.35;
    }
    .cdk-drag-animating {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }
    .cdk-drop-list-dragging .order-card:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }
    .drop-over {
      outline: 2px dashed var(--mat-sys-primary);
      outline-offset: -2px;
    }
    /* Ikonen i en fast ruta: Material-ikoner klipps annars av radhöjden. */
    .kpi-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
      line-height: 20px;
      overflow: visible;
    }
  `,
  template: `
    <ng-template #kpi let-c>
      <a [routerLink]="c.link" [queryParams]="c.params" class="block min-w-0">
        <div
          class="flex h-full min-h-[6.5rem] flex-col justify-between gap-1 md:min-h-[7rem] rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5 transition hover:shadow-md md:p-3.5"
        >
          <div
            class="flex flex-col-reverse items-start gap-1.5 md:flex-row md:items-center md:justify-between md:gap-2"
          >
            <span class="text-xs leading-tight font-medium text-gray-600">{{ c.label }}</span>
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg md:h-8 md:w-8"
              [class]="c.ico"
            >
              <mat-icon class="kpi-icon">{{ c.icon }}</mat-icon>
            </span>
          </div>
          <div
            class="truncate text-2xl leading-none font-semibold tracking-tight max-md:my-1.5 md:mt-0.5"
          >
            {{ c.value }}
          </div>
          <div class="flex min-h-4 items-center gap-1 text-xs">
            @if (c.delta; as d) {
              <span class="flex items-center font-medium" [class]="d.cls">
                <mat-icon class="!h-4 !w-4 !text-sm !leading-4">{{ d.icon }}</mat-icon
                >{{ d.text }}
              </span>
            }
            <span class="truncate text-gray-500 max-md:text-xs">{{ c.sub }}</span>
          </div>
        </div>
      </a>
    </ng-template>

    <div class="grid gap-x-5 gap-y-4 lg:grid-cols-[1fr_auto_1fr]">
      <section>
        <h2 class="mb-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">Lager</h2>
        <div class="grid grid-cols-3 gap-2.5 md:gap-3">
          @for (c of stockCards(); track c.label) {
            <ng-container [ngTemplateOutlet]="kpi" [ngTemplateOutletContext]="{ $implicit: c }" />
          }
        </div>
      </section>
      <div class="hidden w-px self-stretch bg-gray-200 lg:block" role="separator"></div>
      <section>
        <h2 class="mb-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          Däckhotell
        </h2>
        <div class="grid grid-cols-3 gap-2.5 md:gap-3">
          @for (c of hotelCards(); track c.label) {
            <ng-container [ngTemplateOutlet]="kpi" [ngTemplateOutletContext]="{ $implicit: c }" />
          }
        </div>
      </section>
    </div>

    <div class="grid gap-4 lg:min-h-[28rem] lg:flex-1 lg:grid-cols-3">
      <div class="flex min-w-0 flex-col gap-4 lg:col-span-2">
        @if (workOrdersOn) {
          <section
            class="min-w-0 max-md:hidden rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5"
          >
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <h2 class="text-sm font-semibold">
                <a routerLink="/workorders" class="flex items-center gap-2 hover:underline">
                  <mat-icon class="kpi-icon text-gray-400">handyman</mat-icon>
                  Arbetsorder idag
                  <span class="font-normal text-gray-500">· {{ activeOrders() }} pågående</span>
                </a>
              </h2>
              <span class="flex-1"></span>
              <a mat-button routerLink="/workorders/new"><mat-icon>add</mat-icon> Ny arbetsorder</a>
            </div>
            <div cdkDropListGroup class="grid grid-cols-2 gap-3 xl:grid-cols-4">
              @for (col of orderColumns(); track col.status) {
                <div class="min-w-0 rounded-xl bg-gray-50 p-2.5">
                  <div class="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
                    <span class="text-gray-600 uppercase">{{ col.label }}</span>
                    <app-pill [tone]="col.tone">{{ col.items.length }}</app-pill>
                  </div>
                  <div
                    cdkDropList
                    [cdkDropListData]="col.status"
                    (cdkDropListDropped)="drop($event, col.status)"
                    class="flex h-48 flex-col gap-1.5 overflow-y-auto rounded-lg"
                  >
                    @for (o of col.items; track o.id) {
                      <div
                        cdkDrag
                        [cdkDragData]="o"
                        [cdkDragStartDelay]="{ touch: 250, mouse: 0 }"
                        (cdkDragStarted)="dragging = true"
                        (click)="openOrder(o)"
                        (keydown.enter)="openOrder(o)"
                        tabindex="0"
                        role="link"
                        class="order-card block rounded-lg bg-white p-2 text-sm shadow-sm ring-1 ring-black/5"
                      >
                        <span class="flex items-center justify-between gap-2">
                          <app-reg-plate [value]="o.regNo" size="sm" />
                          <span class="text-xs text-gray-500">{{ o.code }}</span>
                        </span>
                        <span class="mt-1 block truncate">{{ o.vehicle || '–' }}</span>
                        <span class="block truncate text-xs text-gray-500">
                          {{ o.customerName }} · {{ o.resourceName || 'Ej tilldelad' }}
                        </span>
                      </div>
                    } @empty {
                      <p class="px-1 py-2 text-xs text-gray-400">Inga. Dra hit en order.</p>
                    }
                  </div>
                </div>
              }
            </div>
          </section>
        }
        @if (admin) {
          <section
            class="min-w-0 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5 max-md:hidden"
          >
            <div class="mb-3 flex items-baseline gap-2">
              <h2 class="text-sm font-semibold">Försäljning och inköp per vecka</h2>
              <span class="text-xs text-gray-500">exkl. moms, senaste 12 veckorna</span>
            </div>
            <div class="h-64">
              <app-chart [config]="weeklyChart()" label="Försäljning och inköp per vecka" />
            </div>
          </section>
        }
      </div>

      <div class="flex min-w-0 flex-col gap-4 lg:min-h-0">
        <section class="min-w-0 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-semibold">
              <a routerLink="/bookings" class="flex items-center gap-2 hover:underline">
                <mat-icon class="kpi-icon text-gray-400">calendar_month</mat-icon>
                Verkstaden idag
                <span class="font-normal text-gray-500">
                  · {{ shown().length }} bokningar, {{ left() }} kvar
                </span>
              </a>
            </h2>
            <span class="flex-1"></span>
            <button mat-button class="max-md:!hidden" (click)="open(null)">
              <mat-icon>add</mat-icon> Ny bokning
            </button>
          </div>
          <div class="flex flex-col gap-1.5 md:hidden">
            @for (b of shown(); track b.id) {
              <button
                type="button"
                (click)="open(b)"
                class="flex items-center gap-3 rounded-xl bg-gray-50 p-2.5 text-left"
                [class.opacity-55]="past(b) || b.status === 'done'"
              >
                <span class="w-12 shrink-0 text-sm font-semibold tabular-nums">{{
                  hhmm(b.start)
                }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm">{{ b.title }}</span>
                  <span class="block truncate text-xs text-gray-500">
                    {{ b.regNo || '–' }} · {{ b.customerName }}
                  </span>
                </span>
                @if (b.status === 'done') {
                  <app-pill tone="green">Klar</app-pill>
                } @else if (past(b)) {
                  <app-pill tone="gray">Passerad</app-pill>
                } @else if (b.status === 'arrived') {
                  <app-pill tone="amber">Här</app-pill>
                }
              </button>
            } @empty {
              <p class="py-2 text-sm text-gray-500">Inga bokningar idag.</p>
            }
            <button mat-stroked-button class="mt-1" (click)="open(null)">
              <mat-icon>add</mat-icon> Ny bokning
            </button>
          </div>
          <app-data-table
            class="hidden md:block"
            [columns]="bookingCols"
            [rows]="shown()"
            [clickable]="true"
            emptyText="Inga bokningar idag."
            (rowClick)="open($event)"
          >
            <ng-template #cell let-b="row" let-c="col" let-text="text">
              @if (c.key === 'status') {
                <app-pill
                  [tone]="
                    b.status === 'done'
                      ? 'green'
                      : b.status === 'arrived'
                        ? 'amber'
                        : b.status === 'booked'
                          ? 'blue'
                          : 'gray'
                  "
                  >{{ text }}</app-pill
                >
              } @else if (c.key === 'regNo' && b.regNo) {
                <app-reg-plate [value]="text" size="sm" />
              } @else {
                {{ text }}
              }
            </ng-template>
          </app-data-table>
        </section>
        @if (admin) {
          <section class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h2 class="flex items-center gap-2 text-sm font-semibold">
                <mat-icon class="kpi-icon text-gray-400">insights</mat-icon>
                Försäljning och inköp
                <span class="font-normal text-gray-500">· {{ days() }} dagar</span>
              </h2>
              <a routerLink="/reports" class="text-xs text-gray-500 hover:underline">Öppna</a>
            </div>
            @for (c of moneyCards(); track c.label) {
              <a
                [routerLink]="c.link"
                [queryParams]="c.params"
                class="flex flex-wrap items-baseline gap-x-2 rounded-md px-1 py-1.5 text-sm hover:bg-gray-50"
              >
                <span class="min-w-0 flex-1 text-gray-600">{{ c.label }}</span>
                @if (c.delta; as d) {
                  <span class="flex items-center text-xs font-medium" [class]="d.cls">
                    <mat-icon class="!h-4 !w-4 !text-sm !leading-4">{{ d.icon }}</mat-icon
                    >{{ d.text }}
                  </span>
                }
                @if (c.sub) {
                  <span class="text-xs text-gray-500">{{ c.sub }}</span>
                }
                <b class="tabular-nums">{{ c.value }}</b>
              </a>
            }
          </section>
        }

        <section
          class="flex flex-col rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5 lg:min-h-40 lg:flex-1"
        >
          <div class="mb-1 flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-sm font-semibold">
              <mat-icon class="kpi-icon text-gray-400">history</mat-icon> Senaste händelser
            </h2>
            <a routerLink="/reports" class="text-xs text-gray-500 hover:underline">Visa logg</a>
          </div>
          <app-movement-list
            class="flex min-h-0 flex-col lg:flex-1"
            [compact]="true"
            [pageSize]="20"
          />
        </section>
      </div>
    </div>
  `,
})
export class Dashboard {
  private readonly auth = inject(Auth);
  /** Försäljning och rapporter är bara för ägare. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(InventoryApi);
  private readonly sales = signal<TradeRow[]>([]);
  private readonly purchases = signal<TradeRow[]>([]);

  /** Försäljning och inköp per vecka, tolv veckor bakåt. */
  readonly weeklyChart = computed<ChartConfiguration>(() => {
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() - 7 * (11 - i));
      return d;
    });
    const sum = (rows: TradeRow[], from: Date) => {
      const to = new Date(from);
      to.setDate(from.getDate() + 7);
      return (
        rows
          .filter((r) => new Date(r.createdAt) >= from && new Date(r.createdAt) < to)
          .reduce((t, r) => t + r.total, 0) / 100
      );
    };
    const week = (d: Date) => {
      const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
      return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
    };
    return {
      type: 'bar',
      data: {
        labels: weeks.map((d) => `v. ${week(d)}`),
        datasets: [
          {
            label: 'Försäljning',
            data: weeks.map((d) => sum(this.sales(), d)),
            backgroundColor: brandColor(),
            borderRadius: 4,
            maxBarThickness: 18,
          },
          {
            label: 'Inköp',
            data: weeks.map((d) => sum(this.purchases(), d)),
            backgroundColor: '#94a3b8',
            borderRadius: 4,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: ${this.kr.transform((c.parsed.y ?? 0) * 100)}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => `${Number(v).toLocaleString('sv-SE')} kr` },
          },
        },
      },
    };
  });
  private readonly storage = inject(StorageApi);
  private readonly bookings = inject(BookingApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly kr = new KrPipe();
  readonly router = inject(Router);
  readonly bookingCols = BOOKING_COLS;
  readonly hhmm = time;

  /** Perioden för siffrorna under Pengar väljs under Inställningar. */
  readonly days = signal(inject(Settings).value().dashboardDays);
  readonly summary = toSignal(this.api.summary().pipe(catchError(() => of(null))));
  readonly hotel = toSignal(this.storage.summary().pipe(catchError(() => of(null))));
  readonly cur = signal<Report | null>(null);
  readonly prev = signal<Report | null>(null);

  /** Dagens bokningar, tidigast först (avbokade syns inte). */
  readonly today = signal<Booking[]>([]);
  readonly resources = signal<Resource[]>([]);
  /** Mekaniker som listan är filtrerad på, tomt = alla. */
  readonly filter = signal('');
  readonly shown = computed(() =>
    this.today().filter((b) => !this.filter() || b.resourceId === this.filter()),
  );
  /** Klockan, uppdaterad varje minut, så att "kvar" följer tiden på dagen. */
  readonly now = signal(Date.now());

  /** Arbetsorder visas bara när funktionen är påslagen. */
  readonly workOrdersOn = environment.workOrders;
  private readonly workOrderApi = inject(WorkOrderApi);
  readonly orders = signal<WorkOrder[]>([]);
  private readonly isToday = (iso: string | null) =>
    !!iso && new Date(iso).toLocaleDateString('sv-SE') === day(0);
  /** Öppna, pågående och väntande order, samt de som blev klara idag eller hämtas idag. */
  readonly orderColumns = computed(() => {
    const list = this.orders().filter((o) => o.status !== 'cancelled');
    const col = (
      status: WorkOrderStatus,
      label: string,
      tone: 'blue' | 'amber' | 'green' | 'gray',
      keep: (o: WorkOrder) => boolean = () => true,
    ) => ({ status, label, tone, items: list.filter((o) => o.status === status && keep(o)) });
    return [
      col('open', 'Öppna', 'blue'),
      col('in_progress', 'Pågår', 'amber'),
      col('waiting_parts', 'Väntar på del', 'gray'),
      col(
        'done',
        'Klara idag',
        'green',
        (o) => this.isToday(o.pickupAt) || this.isToday(o.receivedAt) || this.movedDone().has(o.id),
      ),
    ];
  });
  /** Order som dragits till Klara: ska stanna kvar i kolumnen även om de inte hör till idag. */
  private readonly movedDone = signal<Set<string>>(new Set());
  /** Sant medan ett kort dras, så att släppet inte räknas som klick. */
  dragging = false;
  private readonly snack = inject(MatSnackBar);

  openOrder(o: WorkOrder) {
    if (this.dragging) return;
    this.router.navigate(['/workorders', o.id]);
  }

  /** Släpp i en annan kolumn: statusen ändras direkt, och tas tillbaka om servern säger nej. */
  drop(e: CdkDragDrop<WorkOrderStatus>, to: WorkOrderStatus) {
    setTimeout(() => (this.dragging = false));
    const o = e.item.data as WorkOrder;
    if (o.status === to) return;
    const apply = () => {
      const from = o.status;
      this.orders.update((l) => l.map((x) => (x.id === o.id ? { ...x, status: to } : x)));
      if (to === 'done') this.movedDone.update((m) => new Set(m).add(o.id));
      this.workOrderApi.update(o.id, { status: to }).subscribe({
        error: (err) => {
          this.orders.update((l) => l.map((x) => (x.id === o.id ? { ...x, status: from } : x)));
          this.snack.open(err?.error?.message ?? 'Kunde inte ändra status', 'Stäng', {
            duration: 5000,
          });
        },
      });
    };
    if (to !== 'done') return apply();
    // Klar bokar lagerdelarna som en försäljning, så det frågas en gång.
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Markera ${o.code} som klar?`,
          message: 'Delarna på ordern tas ut ur lagret och bokas som en försäljning.',
          confirmText: 'Markera klar',
        },
      })
      .afterClosed()
      .subscribe((ok) => ok && apply());
  }

  readonly activeOrders = computed(
    () => this.orders().filter((o) => o.status === 'open' || o.status === 'in_progress').length,
  );
  /** Passerad: sluttiden har gått, oavsett status. */
  readonly past = (b: Booking) => new Date(b.end).getTime() <= this.now();
  /** Kvar: inte avslutad och inte passerad. */
  readonly left = computed(
    () =>
      this.shown().filter((b) => (b.status === 'booked' || b.status === 'arrived') && !this.past(b))
        .length,
  );

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
    this.load();
    this.loadBookings();
    if (this.admin) {
      loadTrades(this.api, 'sales')
        .pipe(catchError(() => of([] as TradeRow[])))
        .subscribe((r) => this.sales.set(r));
      loadTrades(this.api, 'purchases')
        .pipe(catchError(() => of([] as TradeRow[])))
        .subscribe((r) => this.purchases.set(r));
    }
    if (this.workOrdersOn) {
      this.workOrderApi
        .list({ limit: 100 })
        .pipe(catchError(() => of({ items: [] as WorkOrder[] })))
        .subscribe((p) => this.orders.set(p.items));
    }
    this.workshop
      .resources()
      .pipe(catchError(() => of([] as Resource[])))
      .subscribe((r) => this.resources.set(r));
  }

  /** Öppnar en bokning, eller en ny (nästa hela timme) när `booking` är null. */
  open(booking: Booking | null) {
    const start = booking ? new Date(booking.start) : new Date();
    if (!booking) start.setHours(start.getHours() + 1, 0, 0, 0);
    const data: BookingDialogData = {
      booking,
      start,
      end: booking ? new Date(booking.end) : new Date(start.getTime() + 3600_000),
    };
    this.dialog
      .open<BookingDialog, BookingDialogData, BookingDialogResult>(BookingDialog, {
        data,
        width: '1040px',
        maxWidth: '96vw',
        panelClass: 'dialog-sheet',
      })
      .afterClosed()
      .subscribe((r) => r && this.loadBookings());
  }

  private loadBookings() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const live = (b: Booking) => b.status !== 'cancelled' && b.status !== 'no_show';
    this.bookings
      .between(start, new Date(start.getTime() + 864e5))
      .pipe(catchError(() => of([] as Booking[])))
      .subscribe((l) =>
        this.today.set(l.filter(live).sort((a, b) => a.start.localeCompare(b.start))),
      );
  }

  private load() {
    if (!this.admin) return;
    const d = this.days();
    this.api.report(day(-(d - 1)), day(0)).subscribe((r) => this.cur.set(r));
    this.api.report(day(-(2 * d - 1)), day(-d)).subscribe((r) => this.prev.set(r));
  }

  readonly stockCards = computed(() => {
    const s = this.summary();
    const inv = '/inventory';
    const cards: Card[] = [
      {
        label: 'Artiklar',
        icon: 'inventory_2',
        value: s?.articles ?? '–',
        sub: 'Aktiva artiklar',
        link: inv,
        params: {},
        ico: 'bg-sky-100 text-sky-700',
      },
      {
        label: 'Lågt lager',
        icon: 'warning',
        value: s?.lowStock ?? '–',
        sub: 'Behöver beställas',
        link: inv,
        params: { lowStock: true },
        ico: 'bg-amber-100 text-amber-700',
      },
      {
        label: 'Slut',
        icon: 'block',
        value: s?.outOfStock ?? '–',
        sub: 'Inget kvar i lager',
        link: inv,
        params: { inStock: false },
        ico: 'bg-rose-100 text-rose-700',
      },
    ];
    return cards;
  });

  readonly hotelCards = computed(() => {
    const h = this.hotel();
    const cards: Card[] = [
      {
        label: 'Inlagrade set',
        icon: 'warehouse',
        value: h?.stored ?? '–',
        sub: h ? `${h.units} st` : '',
        link: '/storage',
        params: { status: 'stored' },
        ico: 'bg-indigo-100 text-indigo-700',
      },
      {
        label: 'Obetalda',
        icon: 'payments',
        value: h?.unpaid ?? '–',
        sub: h ? this.kr.transform(h.unpaidAmount) + ' exkl. moms' : '',
        link: '/storage',
        params: { status: 'stored', paymentStatus: 'unpaid' },
        ico: 'bg-violet-100 text-violet-700',
      },
      {
        label: 'Passerat hämtdatum',
        icon: 'event_busy',
        value: h?.overdue ?? '–',
        sub: 'Skulle ha hämtats',
        link: '/storage',
        params: { status: 'stored', overdue: true },
        ico: 'bg-orange-100 text-orange-700',
      },
    ];
    return cards;
  });

  readonly moneyCards = computed(() => {
    const c = this.cur();
    const p = this.prev();
    const k = (o: number | undefined | null) => this.kr.transform(o ?? 0);
    const margin =
      c && c.soldRevenue ? `${Math.round((c.grossProfit / c.soldRevenue) * 100)} % marginal` : '';
    const rep = '/reports';
    const cards: Card[] = [
      {
        label: 'Försäljning exkl. moms',
        icon: 'sell',
        value: c ? k(c.soldRevenue) : '–',
        sub: '',
        delta: this.delta(c?.soldRevenue, p?.soldRevenue),
        link: rep,
        params: {},
        ico: 'bg-blue-100 text-blue-700',
      },
      {
        label: 'Bruttovinst exkl. moms',
        icon: 'trending_up',
        value: c ? k(c.grossProfit) : '–',
        sub: margin,
        delta: this.delta(c?.grossProfit, p?.grossProfit),
        link: rep,
        params: {},
        ico: 'bg-emerald-100 text-emerald-700',
      },
      {
        label: 'Sålda enheter',
        icon: 'shopping_cart',
        value: c ? `${c.soldUnits} st` : '–',
        sub: '',
        delta: this.delta(c?.soldUnits, p?.soldUnits),
        link: rep,
        params: {},
        ico: 'bg-teal-100 text-teal-700',
      },
      {
        label: 'Inköp exkl. moms',
        icon: 'local_shipping',
        value: c ? k(c.purchasedCost) : '–',
        sub: c ? `${c.purchasedUnits} st` : '',
        delta: this.delta(c?.purchasedCost, p?.purchasedCost),
        link: rep,
        params: {},
        ico: 'bg-fuchsia-100 text-fuchsia-700',
      },
    ];
    return cards;
  });

  /** Förändring mot föregående period; grönt = upp. */
  private delta(cur: number | undefined, prev: number | undefined): Delta {
    const flat: Delta = { text: '–', icon: 'remove', cls: 'text-gray-500' };
    if (cur == null || prev == null) return flat;
    if (prev === 0)
      return cur === 0 ? flat : { text: 'Ny', icon: 'arrow_upward', cls: 'text-green-600' };
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    if (pct === 0) return { text: '0 %', icon: 'remove', cls: 'text-gray-500' };
    return {
      text: `${Math.abs(pct)} %`,
      icon: pct > 0 ? 'arrow_upward' : 'arrow_downward',
      cls: pct > 0 ? 'text-green-600' : 'text-red-600',
    };
  }
}
