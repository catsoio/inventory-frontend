import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, of } from 'rxjs';
import { BookingApi } from '../../core/api/booking-api';
import { AxleApi } from '../../core/api/axle-api';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { StorageApi } from '../../core/api/storage-api';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import { Auth } from '../../core/auth/auth';
import { addDays, startOfDay, ymd } from '../../core/insights/dates';
import { pickupForecast } from '../../core/insights/hotel';
import { Insights } from '../../core/insights/insights';
import { WeeklySeries, weeklySeries } from '../../core/insights/sales';
import { Settings } from '../../core/settings';
import { Todo } from '../../core/todo';
import {
  Booking,
  BookingStatus,
  Report,
  Resource,
  StorageDeposit,
  StorageSummary,
  Summary,
  WorkOrder,
} from '../../core/models';
import { environment } from '../../../environments/environment';

/** En rad under "Att göra": något som väntar på någon. */
export interface Attention {
  key: string;
  icon: string;
  text: string;
  /** bad = brådskande, warn = bör ses över, info = bra att veta. */
  tone: 'bad' | 'warn' | 'info';
  link: string;
  params?: Record<string, string | number | boolean>;
}

const LIVE: BookingStatus[] = ['booked', 'arrived', 'done'];

/**
 * Det startsidan visar, hämtat en gång för både dator- och mobilvyn. Bokningar, hotell och
 * lager hämtas alltid; arbetsorder och pengar bara av datorvyn (`loadDesktop`). Alla anrop
 * tål fel var för sig: en sida utan behörighet eller utan nät ger tomma siffror, inte en tom sida.
 */
@Injectable()
export class HomeData {
  private readonly auth = inject(Auth);
  private readonly bookingApi = inject(BookingApi);
  private readonly inventory = inject(AxleApi);
  private readonly storage = inject(StorageApi);
  private readonly cards = inject(SalesCardApi);
  private readonly orderApi = inject(WorkOrderApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly insights = inject(Insights);
  private readonly todo = inject(Todo);
  private readonly snack = inject(MatSnackBar);

  /** Försäljning och pengar är bara för ägaren. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  readonly workOrdersOn = environment.workOrders;
  /** Perioden för nyckeltalen under Pengar väljs under Inställningar. */
  readonly days = inject(Settings).value().dashboardDays;

  /** Klockan, uppdaterad varje minut så att "kvar" och "nästa" följer dagen. */
  readonly now = signal(Date.now());

  readonly summary = signal<Summary | null>(null);
  readonly hotel = signal<StorageSummary | null>(null);
  readonly deposits = signal<StorageDeposit[]>([]);
  readonly depositsLoaded = signal(false);
  readonly resources = signal<Resource[]>([]);
  /** Alla bokningar från idag och 14 dagar framåt (inte avbokade). */
  readonly bookings = signal<Booking[]>([]);
  readonly bookingsLoaded = signal(false);
  readonly drafts = signal(0);
  readonly unpaid = signal<{ count: number; amount: number; more: boolean } | null>(null);

  // Bara datorvyn
  readonly orders = signal<WorkOrder[]>([]);
  readonly week = signal<WeeklySeries | null>(null);
  readonly cur = signal<Report | null>(null);
  readonly prev = signal<Report | null>(null);

  /** Sant när det som väntar hämtats, så att "Allt under kontroll" inte blinkar fram för tidigt. */
  readonly attentionReady = this.todo.ready;

  /** Datorvyn har hämtat sitt (arbetsorder m.m.); mobilen gör aldrig det. */
  private readonly desktop = signal(false);

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
    this.loadCore();
  }

  // --- dagen ---

  private readonly startToday = computed(() => startOfDay(new Date(this.now())));

  /** Dagens bokningar, tidigast först. */
  readonly today = computed(() => {
    const from = this.startToday().getTime();
    // Nästa midnatt (inte +24 h: dygnet när klockan ställs om är 23 eller 25 timmar).
    const to = addDays(this.startToday(), 1).getTime();
    return this.bookings()
      .filter((b) => {
        const t = new Date(b.start).getTime();
        return t >= from && t < to;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  });

  /** Passerad: sluttiden har gått, oavsett status. */
  readonly past = (b: Booking) => new Date(b.end).getTime() <= this.now();

  /** Kvar: inte avslutad och inte passerad. */
  readonly left = computed(
    () =>
      this.today().filter((b) => (b.status === 'booked' || b.status === 'arrived') && !this.past(b))
        .length,
  );

  /** Nästa att ta hand om: den som är här nu, annars den närmaste som inte börjat. */
  readonly next = computed(() => {
    const open = this.today().filter((b) => b.status === 'booked' || b.status === 'arrived');
    return (
      open.find((b) => b.status === 'arrived') ??
      open.find((b) => new Date(b.end).getTime() > this.now()) ??
      null
    );
  });

  // --- hotellet ---

  readonly forecast = computed(() => pickupForecast(this.deposits(), new Date(this.now()), 8));

  /** Set som ska hämtas den här veckan (efter de försenade). */
  readonly pickupsThisWeek = computed(() => this.forecast().buckets[1]?.sets ?? 0);

  // --- det som väntar ---

  /**
   * "Att göra": samma lista som siffrorna i menyn (`core/todo.ts`), så att de aldrig säger olika.
   * Hem lägger till det som inte är något att göra men bra att veta (hämtas den här veckan).
   */
  readonly attention = computed<Attention[]>(() => {
    const tone = { urgent: 'bad', wait: 'warn', info: 'info' } as const;
    const out: Attention[] = this.todo
      .items()
      .filter((t) => !t.desktopOnly || this.desktop())
      .map((t) => ({
        key: t.key,
        icon: t.icon,
        tone: tone[t.urgency],
        text: t.text,
        link: t.link,
        params: t.params,
      }));
    const wp = this.pickupsThisWeek();
    if (wp > 0) {
      out.push({
        key: 'pickups',
        icon: 'warehouse',
        tone: 'info',
        text: `${wp} däckset ska hämtas den här veckan`,
        link: '/storage/overview',
      });
    }
    return out;
  });

  // --- hämtning ---

  private loadCore() {
    this.inventory
      .summary()
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.summary.set(x));
    this.storage
      .summary()
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.hotel.set(x));
    this.insights
      .storedDeposits()
      .pipe(catchError(() => of([] as StorageDeposit[])))
      .subscribe((x) => {
        this.deposits.set(x);
        this.depositsLoaded.set(true);
      });
    this.workshop
      .resources()
      .pipe(catchError(() => of([] as Resource[])))
      .subscribe((x) => this.resources.set(x));
    this.loadBookings();
    this.cards
      .list({ status: 'draft', limit: 1 })
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.drafts.set(x?.pagination.total ?? 0));
    if (this.admin) {
      this.cards
        .list({ status: 'posted', paid: false, limit: 100 })
        .pipe(catchError(() => of(null)))
        .subscribe((x) =>
          this.unpaid.set(
            x
              ? {
                  count: x.pagination.total,
                  amount: x.items.reduce((t, c) => t + c.total, 0),
                  more: x.pagination.total > x.items.length,
                }
              : null,
          ),
        );
    }
  }

  /** Arbetsorder och pengar: bara datorvyn behöver dem. */
  loadDesktop() {
    if (this.desktop()) return;
    this.desktop.set(true);
    if (this.workOrdersOn) {
      this.orderApi
        .list({ limit: 100 })
        .pipe(catchError(() => of({ items: [] as WorkOrder[] })))
        .subscribe((p) => this.orders.set(p.items));
    }
    if (!this.admin) return;
    this.loadMoney();
    const now = new Date(this.now());
    const d = this.days;
    const day = (offset: number) => ymd(addDays(now, offset));
    this.inventory
      .report(day(-(d - 1)), day(0))
      .pipe(catchError(() => of(null)))
      .subscribe((r) => this.cur.set(r));
    this.inventory
      .report(day(-(2 * d - 1)), day(-d))
      .pipe(catchError(() => of(null)))
      .subscribe((r) => this.prev.set(r));
  }

  /** Försäljning och inköp per vecka (ägaren), för kurvorna. Både dator och mobil. */
  loadMoney() {
    if (!this.admin || this.week()) return;
    const now = new Date(this.now());
    this.insights
      .weekly(now, 12)
      .pipe(catchError(() => of(null)))
      .subscribe((r) => this.week.set(weeklySeries(r, now, 12)));
  }

  /** Bokningarna från idag och 14 dagar framåt. */
  loadBookings() {
    const from = startOfDay(new Date());
    this.bookingApi
      .between(from, addDays(from, 14))
      .pipe(catchError(() => of([] as Booking[])))
      .subscribe((list) => {
        this.bookings.set(list.filter((b) => LIVE.includes(b.status)));
        this.bookingsLoaded.set(true);
      });
  }

  /** Ändrar status direkt i listan och tar tillbaka det om servern säger nej. */
  setStatus(b: Booking, status: BookingStatus) {
    const before = b.status;
    const apply = (s: BookingStatus) =>
      this.bookings.update((l) => l.map((x) => (x.id === b.id ? { ...x, status: s } : x)));
    apply(status);
    this.bookingApi.update(b.id, { status }).subscribe({
      error: (err) => {
        apply(before);
        this.snack.open(err?.error?.message ?? 'Kunde inte ändra status', 'Stäng', {
          duration: 5000,
        });
      },
    });
  }
}
