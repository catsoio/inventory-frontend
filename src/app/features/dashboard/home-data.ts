import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, of } from 'rxjs';
import { BookingApi } from '../../core/api/booking-api';
import { AxleApi } from '../../core/api/axle-api';
import { PurchaseCardApi } from '../../core/api/purchase-card-api';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import { addDays, startOfDay } from '../../core/insights/dates';
import { Insights } from '../../core/insights/insights';
import { Todo, toneOf } from '../../core/todo';
import {
  Article,
  Booking,
  BookingStatus,
  Movement,
  Resource,
  Summary,
  WorkOrder,
  WorkOrderStatus,
} from '../../core/models';
import { environment } from '../../../environments/environment';

/** En rad under "Att göra": något som väntar på någon. */
export interface Attention {
  key: string;
  icon: string;
  text: string;
  /** bad = sent, warn = bör åtgärdas, good = goda nyheter, info = vanligt jobb eller bra att veta. */
  tone: 'bad' | 'warn' | 'good' | 'info';
  link: string;
  params?: Record<string, string | number | boolean>;
}

const LIVE: BookingStatus[] = ['booked', 'arrived', 'done'];

/**
 * Det startsidan visar, hämtat en gång för både dator- och mobilvyn. Bokningar och
 * lager hämtas alltid; arbetsorder, artiklar och lagerrörelser bara av datorvyn (`loadDesktop`). Alla anrop
 * tål fel var för sig: en sida utan behörighet eller utan nät ger tomma siffror, inte en tom sida.
 */
@Injectable()
export class HomeData {
  private readonly bookingApi = inject(BookingApi);
  private readonly inventory = inject(AxleApi);
  private readonly purchases = inject(PurchaseCardApi);
  private readonly orderApi = inject(WorkOrderApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly insights = inject(Insights);
  private readonly todo = inject(Todo);
  private readonly snack = inject(MatSnackBar);

  readonly workOrdersOn = environment.workOrders;

  /** Klockan, uppdaterad varje minut så att "kvar" och "nästa" följer dagen. */
  readonly now = signal(Date.now());

  // Lager, utkast och obetalt kommer ur samma svar som menyns siffror (`Todo`): inget eget anrop.
  readonly summary: Signal<Summary | null> = this.todo.stock;
  readonly resources = signal<Resource[]>([]);
  /** Alla bokningar från idag och 14 dagar framåt (inte avbokade). */
  readonly bookings = signal<Booking[]>([]);
  readonly bookingsLoaded = signal(false);

  // Bara datorvyn
  readonly orders = signal<WorkOrder[]>([]);
  readonly ordersLoaded = signal(false);
  /** Klara order som kunden ännu inte hämtat (mobilen visar dem med en ring-knapp). */
  readonly doneOrders = signal<WorkOrder[]>([]);
  /** Alla aktiva artiklar (delas med Lager via `Insights`) och de senaste lagerrörelserna. */
  readonly articles = signal<Article[]>([]);
  /** Beställt hos en leverantör och inte kommit, per artikel: räknas av i Att beställa. */
  readonly onOrder = signal<Record<string, number>>({});
  readonly movements = signal<Movement[]>([]);
  readonly stockLoaded = signal(false);

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

  // --- det som väntar ---

  /**
   * "Att göra": samma lista som siffrorna i menyn (`core/todo.ts`), så att de aldrig säger olika.
   * Hem lägger till det som inte är något att göra men bra att veta (hämtas den här veckan).
   */
  readonly attention = computed<Attention[]>(() => {
    const out: Attention[] = this.todo
      .items()
      .filter((t) => !t.desktopOnly || this.desktop())
      // Bara verkstadens saker: Halls, Däckhotellets och Bärgnings hör till respektive Hem.
      .filter((t) => t.product === 'axle')
      .map((t) => ({
        key: t.key,
        icon: t.icon,
        tone: toneOf(t),
        text: t.text,
        link: t.link,
        params: t.params,
      }));
    return out;
  });

  // --- hämtning ---

  private loadCore() {
    this.workshop
      .resources()
      .pipe(catchError(() => of([] as Resource[])))
      .subscribe((x) => this.resources.set(x));
    this.loadBookings();
  }

  /** Arbetsorder, artiklar och lagerrörelser: bara datorvyn behöver dem. */
  loadDesktop() {
    if (this.desktop()) return;
    this.desktop.set(true);
    this.loadOrders(false);
    this.insights
      .articles()
      .pipe(catchError(() => of([] as Article[])))
      .subscribe((a) => {
        this.articles.set(a);
        this.stockLoaded.set(true);
      });
    this.purchases
      .onOrder()
      .pipe(catchError(() => of({} as Record<string, number>)))
      .subscribe((m) => this.onOrder.set(m));
    this.inventory
      .movements({ limit: 8 })
      .pipe(catchError(() => of({ items: [] as Movement[] })))
      .subscribe((p) => this.movements.set(p.items));
  }

  /** Hämtar mobilens orderlista på nytt, t.ex. efter att en order skapats. */
  reloadOrders() {
    this.ordersLoaded.set(false);
    this.loadOrders(true);
    this.loadDone();
  }

  /** De senast klara orderna som inte fakturerats (alltså inte hämtade och betalda än). */
  loadDone() {
    if (!this.workOrdersOn) return;
    this.orderApi
      .list({ status: 'done', limit: 20 })
      .pipe(catchError(() => of({ items: [] as WorkOrder[] })))
      .subscribe((p) => this.doneOrders.set(p.items.filter((o) => !o.locked)));
  }

  /**
   * Byter status på en order direkt i listan och tar tillbaka det om servern säger nej (t.ex. att
   * mätarställning krävs för Klar). Klar bokar lagerdelarna som en försäljning, så den som anropar
   * har frågat först.
   */
  setOrderStatus(o: WorkOrder, status: WorkOrderStatus) {
    const before = o.status;
    const apply = (s: WorkOrderStatus) =>
      this.orders.update((l) => l.map((x) => (x.id === o.id ? { ...x, status: s } : x)));
    apply(status);
    this.orderApi.update(o.id, { status }).subscribe({
      next: () => status === 'done' && this.loadDone(),
      error: (err) => {
        apply(before);
        this.snack.open(err?.error?.message ?? 'Kunde inte ändra status', 'Stäng', {
          duration: 5000,
        });
      },
    });
  }

  /**
   * Arbetsorder. Datorn tar även klara (tavlan visar dem idag); mobilen bara de pågående och
   * lämnar listan ifred om datorvyn redan hämtat den.
   */
  loadOrders(onlyActive: boolean) {
    if (!this.workOrdersOn || (onlyActive && this.ordersLoaded())) return;
    this.orderApi
      .list(onlyActive ? { active: true, limit: 30 } : { limit: 100 })
      .pipe(catchError(() => of({ items: [] as WorkOrder[] })))
      .subscribe((p) => {
        this.orders.set(p.items);
        this.ordersLoaded.set(true);
      });
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
