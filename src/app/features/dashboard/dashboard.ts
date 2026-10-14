import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { BookingApi } from '../../core/api/booking-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import { InventoryApi } from '../../core/api/inventory-api';
import { StorageApi } from '../../core/api/storage-api';
import { BOOKING_STATUS_LABELS, Booking, Report, Resource } from '../../core/models';
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
  /** Ljus bakgrund: färgen antyder ämnet utan att ta över sidan. */
  tone: string;
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
  host: { class: 'flex h-full flex-col gap-3 overflow-auto md:overflow-hidden' },
  template: `
    <h1 class="shrink-0 text-2xl font-semibold max-md:hidden">Hem</h1>

    <ng-template #kpi let-c>
      <a [routerLink]="c.link" [queryParams]="c.params" class="block">
        <div
          class="flex h-full min-h-[5.5rem] flex-col justify-between rounded-xl px-3 py-3 transition hover:brightness-[0.97] md:min-h-0 md:p-3"
          [class]="c.tone"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="text-xs leading-tight text-gray-600">{{ c.label }}</span>
            <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-gray-500 max-md:hidden">{{
              c.icon
            }}</mat-icon>
          </div>
          <div
            class="truncate text-2xl leading-none font-semibold tracking-tight max-md:my-1.5 md:mt-0.5"
          >
            {{ c.value }}
          </div>
          <div class="flex min-h-4 items-center gap-1 text-xs">
            @if (c.delta; as d) {
              <span class="flex items-center font-medium" [class]="d.cls">
                <mat-icon class="!h-4 !w-4 !text-sm">{{ d.icon }}</mat-icon
                >{{ d.text }}
              </span>
            }
            <span class="truncate text-gray-500 max-md:text-xs">{{ c.sub }}</span>
          </div>
        </div>
      </a>
    </ng-template>

    <div class="grid shrink-0 gap-x-4 gap-y-3 md:min-h-0 md:flex-1 md:shrink xl:grid-cols-3">
      <div class="min-w-0 flex-col gap-3 max-md:contents md:flex md:min-h-0 xl:col-span-2">
        <section class="shrink-0 max-md:order-1">
          <h2 class="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">Lager</h2>
          <div class="grid grid-cols-3 gap-2.5 md:gap-3">
            @for (c of stockCards(); track c.label) {
              <ng-container [ngTemplateOutlet]="kpi" [ngTemplateOutletContext]="{ $implicit: c }" />
            }
          </div>
        </section>

        <section class="shrink-0 max-md:order-2">
          <h2 class="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Däckhotell
          </h2>
          <div class="grid grid-cols-3 gap-2.5 md:gap-3">
            @for (c of hotelCards(); track c.label) {
              <ng-container [ngTemplateOutlet]="kpi" [ngTemplateOutletContext]="{ $implicit: c }" />
            }
          </div>
        </section>

        <section
          class="flex min-w-0 shrink-0 flex-col max-md:order-5 md:min-h-48 md:flex-1 xl:min-h-0"
        >
          <div class="mb-1 flex shrink-0 flex-wrap items-center gap-2">
            <h2 class="flex items-center gap-2 text-sm font-semibold">
              <mat-icon class="!h-5 !w-5 !text-xl text-gray-400">calendar_month</mat-icon>
              Verkstaden idag
              <span class="font-normal text-gray-500">
                · {{ shown().length }} bokningar, {{ left() }} kvar
              </span>
            </h2>
            <span class="flex-1"></span>

            <button mat-flat-button color="primary" class="max-md:!hidden" (click)="open(null)">
              <mat-icon>add</mat-icon> Ny bokning
            </button>
            <a mat-button routerLink="/bookings" class="max-md:!hidden">Kalender</a>
          </div>
          <div class="flex flex-col gap-1.5 md:hidden">
            @for (b of shown(); track b.id) {
              <button
                type="button"
                (click)="open(b)"
                class="flex items-center gap-3 rounded-xl bg-white p-2.5 text-left shadow-sm"
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
          </div>
          <app-data-table
            class="hidden min-h-0 flex-1 md:block"
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
      </div>

      <div class="min-w-0 flex-col gap-3 max-md:contents md:flex md:min-h-0">
        @if (admin) {
        <section class="shrink-0 rounded-xl bg-white p-3 shadow-sm max-md:hidden">
          <div class="mb-1 flex items-center justify-between gap-2">
            <h2 class="flex items-center gap-2 text-sm font-semibold">
              <mat-icon class="!h-5 !w-5 !text-xl text-gray-400">payments</mat-icon>
              Pengar
              <span class="font-normal text-gray-500">· senaste {{ days() }} dagarna</span>
            </h2>
            <a routerLink="/reports" class="text-xs text-gray-500 hover:underline">Öppna</a>
          </div>
          @for (c of moneyCards(); track c.label) {
            <a
              [routerLink]="c.link"
              [queryParams]="c.params"
              class="flex items-baseline gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-gray-50"
            >
              <span class="flex-1 text-gray-600">{{ c.label }}</span>
              @if (c.delta; as d) {
                <span class="flex items-center text-xs font-medium" [class]="d.cls">
                  <mat-icon class="!h-4 !w-4 !text-sm">{{ d.icon }}</mat-icon
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
          class="flex min-w-0 shrink-0 flex-col max-md:order-4 md:min-h-40 md:flex-1 xl:min-h-0"
        >
          <div class="mb-1 flex shrink-0 items-center justify-between">
            <h2
              class="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-500 uppercase"
            >
              <mat-icon class="!h-4 !w-4 !text-base">history</mat-icon> Senaste händelser
            </h2>
            <a routerLink="/reports" class="text-xs text-gray-500 hover:underline">Visa logg</a>
          </div>
          <div
            class="rounded-xl bg-white px-4 py-1 shadow-sm md:min-h-0 md:flex-1 md:overflow-auto"
          >
            <app-movement-list [compact]="true" [pageSize]="6" />
          </div>
        </section>
      </div>
    </div>
  `,
})
export class Dashboard {
  private readonly auth = inject(Auth);
  /** Pengar och rapporter är bara för ägare. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(InventoryApi);
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
  /** Passerad: sluttiden har gått, oavsett status. */
  readonly past = (b: Booking) => new Date(b.end).getTime() <= this.now();
  /** Kvar: inte avslutad och inte passerad. */
  readonly left = computed(
    () =>
      this.shown().filter(
        (b) => (b.status === 'booked' || b.status === 'arrived') && !this.past(b),
      ).length,
  );

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
    this.load();
    this.loadBookings();
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
        width: '720px',
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
        tone: 'bg-sky-50',
      },
      {
        label: 'Lågt lager',
        icon: 'warning',
        value: s?.lowStock ?? '–',
        sub: 'Behöver beställas',
        link: inv,
        params: { lowStock: true },
        tone: 'bg-amber-50',
      },
      {
        label: 'Slut',
        icon: 'block',
        value: s?.outOfStock ?? '–',
        sub: 'Inget kvar i lager',
        link: inv,
        params: { inStock: false },
        tone: 'bg-red-50',
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
        tone: 'bg-sky-50',
      },
      {
        label: 'Obetalda',
        icon: 'payments',
        value: h?.unpaid ?? '–',
        sub: h ? this.kr.transform(h.unpaidAmount) + ' exkl. moms' : '',
        link: '/storage',
        params: { status: 'stored', paymentStatus: 'unpaid' },
        tone: 'bg-amber-50',
      },
      {
        label: 'Passerat hämtdatum',
        icon: 'event_busy',
        value: h?.overdue ?? '–',
        sub: 'Skulle ha hämtats',
        link: '/storage',
        params: { status: 'stored', overdue: true },
        tone: 'bg-red-50',
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
        tone: 'bg-blue-50',
      },
      {
        label: 'Bruttovinst exkl. moms',
        icon: 'trending_up',
        value: c ? k(c.grossProfit) : '–',
        sub: margin,
        delta: this.delta(c?.grossProfit, p?.grossProfit),
        link: rep,
        params: {},
        tone: 'bg-emerald-50',
      },
      {
        label: 'Sålda enheter',
        icon: 'shopping_cart',
        value: c ? `${c.soldUnits} st` : '–',
        sub: '',
        delta: this.delta(c?.soldUnits, p?.soldUnits),
        link: rep,
        params: {},
        tone: 'bg-green-50',
      },
      {
        label: 'Inköp exkl. moms',
        icon: 'local_shipping',
        value: c ? k(c.purchasedCost) : '–',
        sub: c ? `${c.purchasedUnits} st` : '',
        delta: this.delta(c?.purchasedCost, p?.purchasedCost),
        link: rep,
        params: {},
        tone: 'bg-violet-50',
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
