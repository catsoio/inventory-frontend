import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { kronor } from '../shared/chart/chart-kit';
import { CarTodo, carTodo } from '../shared/car-stock';
import { invoiceStatus } from '../shared/invoice-status';
import { AxleApi } from './api/axle-api';
import { BookingApi } from './api/booking-api';
import { CarApi } from './api/car-api';
import { QuoteApi } from './api/quote-api';
import { SalesCardApi } from './api/sales-card-api';
import { StorageApi } from './api/storage-api';
import { WorkOrderApi } from './api/work-order-api';
import { Auth } from './auth/auth';
import type { Product } from './layout/products';
import { StorageSummary, Summary } from './models';
import { environment } from '../../environments/environment';

/**
 * Hur brådskande något är. Det är hela färgskalan i appen:
 *  - `urgent` (röd): ett datum har passerat eller något går inte att sälja (försenat däckset,
 *    förfallen faktura, slut i lagret).
 *  - `wait` (gul): något väntar på att du gör något, men ingenting är sent (utkast, att beställa,
 *    obetald faktura inom tiden).
 *  - `info`: bra att veta. Blir aldrig en siffra i menyn.
 */
export type Urgency = 'urgent' | 'wait' | 'info';

/** Siffra bredvid ett menyval så att man ser läget utan att öppna sidan. */
export interface Badge {
  text: string;
  /** Pillens färger. */
  tone: string;
  /** Prick på ikonen när menyn är hopfälld eller på mobilens flikar. */
  dot: string;
  hint: string;
}

/** En sak som väntar på någon. Hem ("Att göra") och menyns siffror läser samma lista. */
export interface TodoItem {
  key: string;
  /** Vilken produkt det väntar i: Axle (verkstaden) eller Hall (bilhandeln). */
  product: Product;
  urgency: Urgency;
  /** Menyvalen (adresser i `NAV`) som visar siffran. Tomt = bara på Hem. */
  menus: string[];
  /** Siffran och ordet i menyn: "1 utkast", "2 förfallna". */
  badgeCount: number;
  badgeNoun: [one: string, many: string];
  /** Hela meningen, på Hem och i menyns hjälptext. */
  text: string;
  icon: string;
  link: string;
  params?: Record<string, string | number | boolean>;
  /** Bara datorn visar den. */
  desktopOnly?: boolean;
}

/** Obetalda fakturor (ägaren), och hur många av dem som har förfallit. */
export interface UnpaidInvoices {
  unpaid: number;
  overdue: number;
  amount: number;
  more: boolean;
}

export interface TodoInput {
  stock: Summary | null;
  hotel: StorageSummary | null;
  /** Säljkort som väntar på att bokföras (verkstadens, utan bil). */
  drafts: number;
  /** Verkstadens obetalda fakturor. */
  invoices: UnpaidInvoices | null;
  /** Arbetsorder där en del saknas. */
  partsOrders: number;
  quotes: { approved: number; waiting: number };
  /** Bokningsförfrågningar från bokningssidan som ingen bekräftat än. */
  requests?: number;
  /** Bilhandeln: det som väntar i bilarnas böcker. */
  cars?: CarTodo;
  /** Bilhandelns affärer (säljkort med bil) som väntar på att bokföras. */
  hallDrafts?: number;
  /** Bilhandelns obetalda fakturor. */
  hallInvoices?: UnpaidInvoices | null;
}

const RANK: Record<Urgency, number> = { urgent: 0, wait: 1, info: 2 };

const TONES: Record<Exclude<Urgency, 'info'>, { tone: string; dot: string }> = {
  urgent: { tone: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  wait: { tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Obetalda fakturor för en produkt. Siffran ligger på Fakturor (som är gemensam) och på
 * Ekonomi-raden i den produktens egen meny.
 */
function unpaidInvoices(product: Product, inv: UnpaidInvoices): TodoItem[] {
  if (inv.unpaid <= 0) return [];
  const late = inv.overdue > 0;
  return [
    {
      key: product === 'hall' ? 'hall-unpaid-invoices' : 'unpaid-invoices',
      product,
      urgency: late ? 'urgent' : 'wait',
      // På Fakturor, och på Ekonomi (gruppens rad när den är hopfälld, och mobilens "Mer").
      menus: ['/finance/invoices', product === 'hall' ? '/dealership/finance' : '/finance'],
      badgeCount: late ? inv.overdue : inv.unpaid,
      badgeNoun: late ? ['förfallen', 'förfallna'] : ['obetald', 'obetalda'],
      text:
        `${inv.unpaid} ${plural(inv.unpaid, 'obetald faktura', 'obetalda fakturor')}` +
        (late ? `, varav ${inv.overdue} ${plural(inv.overdue, 'förfallen', 'förfallna')}` : '') +
        ` · ${kronor(inv.amount)}${inv.more ? '+' : ''}`,
      icon: 'receipt_long',
      link: '/finance/invoices',
      params: { status: late ? 'overdue' : 'unpaid' },
    },
  ];
}

/** Menynycklarna för Bilar-undersidorna (`badge` i `NAV_HALL`). */
const CARS_FOR_SALE = 'cars-for-sale';
const CARS_PURCHASES = '/dealership/cars/purchases';

/** Det som väntar i bilhandelns bilar. Länkarna bär `flag` så att siffran går att hitta i listan. */
function carItems(c: CarTodo | undefined): TodoItem[] {
  if (!c) return [];
  const car = (
    key: string,
    n: number,
    icon: string,
    flag: string,
    noun: [string, string],
    text: string,
    page: string,
    desktopOnly = false,
  ): TodoItem[] =>
    n > 0
      ? [
          {
            key,
            product: 'hall',
            urgency: 'wait',
            // Gruppens rad (Bilar) och undersidan där bilarna finns.
            menus: ['/dealership/cars', page],
            badgeCount: n,
            badgeNoun: noun,
            text,
            icon,
            link: '/dealership/cars',
            params: { flag },
            desktopOnly,
          },
        ]
      : [];
  return [
    ...car(
      'car-sellers',
      c.sellersMissing,
      'person_search',
      'sellers',
      ['saknar säljare', 'saknar säljare'],
      `${c.sellersMissing} ${plural(c.sellersMissing, 'inköpt bil saknar', 'inköpta bilar saknar')} uppgift om vem ni köpte av`,
      CARS_PURCHASES,
      true,
    ),
    ...car(
      'cars-unlisted',
      c.unlisted,
      'publish',
      'unlisted',
      ['ej utlagd', 'ej utlagda'],
      `${c.unlisted} ${plural(c.unlisted, 'inköpt bil är', 'inköpta bilar är')} inte utlagd${c.unlisted === 1 ? '' : 'a'} till salu`,
      CARS_PURCHASES,
    ),
    ...car(
      'cars-inspection',
      c.inspectionSoon,
      'fact_check',
      'inspection',
      ['besiktning', 'besiktningar'],
      `${c.inspectionSoon} ${plural(c.inspectionSoon, 'bil', 'bilar')} behöver besiktas inom 30 dagar`,
      CARS_FOR_SALE,
    ),
    ...car(
      'cars-idle',
      c.idle,
      'hourglass_top',
      'idle',
      ['står länge', 'står länge'],
      `${c.idle} ${plural(c.idle, 'bil har', 'bilar har')} stått 90 dagar eller mer, se över priset`,
      CARS_FOR_SALE,
    ),
  ];
}

/**
 * Allt som väntar, mest brådskande först. Här, och bara här, bestäms vad som räknas och hur
 * brådskande det är: varje sak räknas en gång och siffran är det man hittar när man klickar in
 * (länken bär filtret).
 */
export function buildTodo(i: TodoInput): TodoItem[] {
  const out: TodoItem[] = [];
  const { hotel: h, stock: s, invoices: inv } = i;

  if (h && h.overdue > 0) {
    out.push({
      key: 'late-sets',
      product: 'axle',
      urgency: 'urgent',
      menus: ['/storage'],
      badgeCount: h.overdue,
      badgeNoun: ['försenad', 'försenade'],
      text: `${h.overdue} däckset har passerat hämtdatum`,
      icon: 'event_busy',
      link: '/storage',
      params: { status: 'stored', overdue: true },
    });
  }
  if (h && h.unpaid > 0) {
    out.push({
      key: 'unpaid-sets',
      product: 'axle',
      urgency: 'wait',
      menus: ['/storage'],
      badgeCount: h.unpaid,
      badgeNoun: ['obetald', 'obetalda'],
      text: `${h.unpaid} ${plural(h.unpaid, 'obetald hotellavgift', 'obetalda hotellavgifter')} · ${kronor(h.unpaidAmount)}`,
      icon: 'payments',
      link: '/storage',
      // Summan räknar alla obetalda avgifter, så listan ska inte begränsas till inlagrade set.
      params: { status: '', paymentStatus: 'unpaid' },
    });
  }
  // Slut och att beställa räknas var för sig (en slut artikel är bara i den första), och gäller bara
  // artiklar med en påminnelsenivå: den som inte bett om en påminnelse får ingen.
  if (s && s.reorderSoldOut > 0) {
    out.push({
      key: 'sold-out',
      product: 'axle',
      urgency: 'urgent',
      menus: ['/inventory'],
      badgeCount: s.reorderSoldOut,
      badgeNoun: ['slut', 'slut'],
      text: `${s.reorderSoldOut} ${plural(s.reorderSoldOut, 'artikel är', 'artiklar är')} slut`,
      icon: 'block',
      link: '/inventory',
      params: { lowStock: true, inStock: false },
    });
  }
  if (s && s.reorderLow > 0) {
    out.push({
      key: 'to-order',
      product: 'axle',
      urgency: 'wait',
      menus: ['/inventory'],
      badgeCount: s.reorderLow,
      badgeNoun: ['att beställa', 'att beställa'],
      text: `${s.reorderLow} ${plural(s.reorderLow, 'artikel', 'artiklar')} att beställa`,
      icon: 'inventory',
      link: '/inventory',
      params: { lowStock: true, inStock: true },
    });
  }
  if (inv) out.push(...unpaidInvoices('axle', inv));
  if ((i.requests ?? 0) > 0) {
    const n = i.requests!;
    out.push({
      key: 'booking-requests',
      product: 'axle',
      urgency: 'wait',
      menus: ['/bookings'],
      badgeCount: n,
      badgeNoun: ['förfrågan', 'förfrågningar'],
      text: `${n} ${plural(n, 'bokningsförfrågan väntar', 'bokningsförfrågningar väntar')} på svar`,
      icon: 'event_available',
      link: '/bookings',
      params: { view: 'list' },
    });
  }
  out.push(...carItems(i.cars));
  if (i.hallInvoices) out.push(...unpaidInvoices('hall', i.hallInvoices));
  if (i.quotes.approved > 0) {
    const n = i.quotes.approved;
    out.push({
      key: 'quotes-approved',
      product: 'axle',
      urgency: 'wait',
      menus: ['/quotes'],
      badgeCount: n,
      badgeNoun: ['godkänd', 'godkända'],
      text: `${n} ${plural(n, 'offert är godkänd', 'offerter är godkända')}, skapa arbetsorder`,
      icon: 'thumb_up',
      link: '/quotes',
      params: { status: 'approved' },
    });
  }
  if (i.drafts > 0) {
    out.push({
      key: 'drafts',
      product: 'axle',
      urgency: 'wait',
      menus: ['/sales'],
      badgeCount: i.drafts,
      badgeNoun: ['utkast', 'utkast'],
      text: `${i.drafts} säljkort väntar på att bokföras`,
      icon: 'edit_note',
      link: '/sales',
      params: { show: 'draft' },
    });
  }
  if ((i.hallDrafts ?? 0) > 0) {
    const n = i.hallDrafts!;
    out.push({
      key: 'hall-drafts',
      product: 'hall',
      urgency: 'wait',
      menus: ['/dealership/deals'],
      badgeCount: n,
      badgeNoun: ['utkast', 'utkast'],
      text: `${n} ${plural(n, 'bilaffär väntar', 'bilaffärer väntar')} på att bokföras`,
      icon: 'edit_note',
      link: '/dealership/deals',
      params: { show: 'draft' },
    });
  }
  if (i.partsOrders > 0) {
    out.push({
      key: 'parts',
      product: 'axle',
      urgency: 'wait',
      menus: ['/workorders'],
      badgeCount: i.partsOrders,
      badgeNoun: ['väntar på del', 'väntar på del'],
      text: `${i.partsOrders} arbetsorder väntar på del`,
      icon: 'handyman',
      link: '/workorders',
      params: { status: 'action' },
      desktopOnly: true,
    });
  }
  if (i.quotes.waiting > 0) {
    const n = i.quotes.waiting;
    out.push({
      key: 'quotes-waiting',
      product: 'axle',
      urgency: 'info',
      menus: [],
      badgeCount: n,
      badgeNoun: ['väntar', 'väntar'],
      text: `${n} ${plural(n, 'offert väntar', 'offerter väntar')} på kundens svar`,
      icon: 'request_quote',
      link: '/quotes',
      params: { status: 'given' },
    });
  }
  // Stabil sortering: mest brådskande först, i övrigt i den ordning sakerna definieras ovan.
  return out.sort((a, b) => RANK[a.urgency] - RANK[b.urgency]);
}

/**
 * Menyns siffror: en per menyval, för det mest brådskande som väntar där. Siffran är alltid antalet
 * av en sak med ett ord efter ("1 försenad"), aldrig en total, och hjälptexten räknar upp resten.
 */
export function todoBadges(items: TodoItem[]): Record<string, Badge> {
  const out: Record<string, Badge> = {};
  for (const menu of new Set(items.flatMap((i) => i.menus))) {
    const mine = items.filter((i) => i.menus.includes(menu) && i.urgency !== 'info');
    const head = mine[0];
    if (!head || head.urgency === 'info') continue;
    out[menu] = {
      text: `${head.badgeCount} ${plural(head.badgeCount, ...head.badgeNoun)}`,
      ...TONES[head.urgency],
      hint: mine.map((i) => i.text).join(' · '),
    };
  }
  return out;
}

/**
 * Hämtar det som väntar och håller listan (`items`). Används av menyn och av Hem. Siffrorna som kräver
 * rättigheter hämtas bara för dem som får se dem (personal får 403 på ägarens), och mekanikern har
 * inga.
 */
@Injectable({ providedIn: 'root' })
export class Todo {
  private readonly auth = inject(Auth);
  private readonly inventory = inject(AxleApi);
  private readonly storage = inject(StorageApi);
  private readonly orders = inject(WorkOrderApi);
  private readonly cards = inject(SalesCardApi);
  private readonly quoteApi = inject(QuoteApi);
  private readonly bookingApi = inject(BookingApi);
  private readonly carApi = inject(CarApi);

  private readonly stock = signal<Summary | null>(null);
  private readonly hotel = signal<StorageSummary | null>(null);
  private readonly drafts = signal(0);
  private readonly partsOrders = signal(0);
  private readonly approved = signal(0);
  private readonly waiting = signal(0);
  private readonly requests = signal(0);
  private readonly cars = signal<CarTodo | undefined>(undefined);
  private readonly hallDrafts = signal(0);
  private readonly invoices = signal<TodoInput['invoices']>(null);
  private readonly hallInvoices = signal<TodoInput['hallInvoices']>(null);

  readonly items = computed(() =>
    buildTodo({
      stock: this.stock(),
      hotel: this.hotel(),
      drafts: this.drafts(),
      invoices: this.invoices(),
      partsOrders: this.partsOrders(),
      quotes: { approved: this.approved(), waiting: this.waiting() },
      requests: this.requests(),
      cars: this.cars(),
      hallDrafts: this.hallDrafts(),
      hallInvoices: this.hallInvoices(),
    }),
  );

  /** Det som väntar i en produkt. Menyn och Hem visar bara den produktens saker. */
  itemsFor(product: Product): TodoItem[] {
    return this.items().filter((t) => t.product === product);
  }

  /**
   * Hur brådskande det mest brådskande är i en produkt (för pricken på produktfliken), eller null när
   * inget väntar. Bara sådant som blir en siffra räknas, inte "bra att veta".
   */
  readonly urgencyOf = computed<Record<Product, Exclude<Urgency, 'info'> | null>>(() => {
    const worst = (p: Product) => {
      const mine = this.items().filter((t) => t.product === p && t.urgency !== 'info');
      return mine.some((t) => t.urgency === 'urgent') ? 'urgent' : mine.length ? 'wait' : null;
    };
    return { axle: worst('axle'), hall: worst('hall') };
  });

  /** Lager och hotell hämtade, så att "Allt under kontroll" inte visas innan svaret kommit. */
  readonly ready = computed(() => this.stock() !== null && this.hotel() !== null);

  private get admin(): boolean {
    return this.auth.isAdmin() || this.auth.isSuperAdmin();
  }

  /**
   * `hall` = garaget har bilhandel (modulen är påslagen). Todo känner inte till abonnemanget, så den
   * som anropar säger det; utan bilhandel hämtas inga bilar och inga bilaffärer.
   */
  refresh(hall = false): void {
    // Mekanikern har inga lager- eller hotellsiffror att visa (och skulle få 403).
    if (this.auth.isMechanic() || !this.auth.garage()) return;
    this.inventory
      .summary()
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.stock.set(x));
    this.storage
      .summary()
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.hotel.set(x));
    this.cards
      .list({ status: 'draft', product: 'axle', limit: 1 })
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.drafts.set(x?.pagination.total ?? 0));
    // Förfrågningar från bokningssidan, de närmaste två månaderna (så långt kalendern läser åt gången).
    const now = new Date();
    this.bookingApi
      .between(now, new Date(now.getTime() + 60 * 24 * 3600 * 1000))
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.requests.set(x?.filter((b) => b.status === 'requested').length ?? 0));
    // Bilhandeln: utan modulen svarar servern 402 (tyst) och inget av det här visas.
    if (hall) {
      this.carApi
        .list()
        .pipe(catchError(() => of(null)))
        .subscribe((x) => this.cars.set(x ? carTodo(x) : undefined));
      this.cards
        .list({ status: 'draft', product: 'hall', limit: 1 })
        .pipe(catchError(() => of(null)))
        .subscribe((x) => this.hallDrafts.set(x?.pagination.total ?? 0));
    }
    if (environment.workOrders) {
      this.orders
        .list({ needsAction: true, limit: 1 })
        .pipe(catchError(() => of(null)))
        .subscribe((x) => this.partsOrders.set(x?.pagination.total ?? 0));
      const quotes = (status: 'given' | 'approved') =>
        this.quoteApi.list({ status, limit: 100 }).pipe(catchError(() => of(null)));
      // Ett lämnat förslag efter sista giltighetsdag (`expired`) väntar inte längre på svar.
      quotes('given').subscribe((x) =>
        this.waiting.set(x?.items.filter((q) => q.shownStatus === 'given').length ?? 0),
      );
      quotes('approved').subscribe((x) =>
        this.approved.set(x?.items.filter((q) => !q.workOrderId).length ?? 0),
      );
    }
    if (!this.admin) return;
    // Pengarna är bara för ägare.
    const unpaid = (product: 'axle' | 'hall', set: (v: UnpaidInvoices | null) => void) =>
      this.cards
        .list({ status: 'posted', paid: false, product, limit: 100 })
        .pipe(catchError(() => of(null)))
        .subscribe((x) => {
          if (!x) return set(null);
          const today = new Date();
          set({
            unpaid: x.pagination.total,
            overdue: x.items.filter(
              (c) =>
                invoiceStatus(
                  { kind: c.kind ?? 'invoice', dueAt: c.dueAt, paidAt: c.paidAt },
                  today,
                ) === 'overdue',
            ).length,
            amount: x.items.reduce((t, c) => t + c.total, 0),
            more: x.pagination.total > x.items.length,
          });
        });
    unpaid('axle', (v) => this.invoices.set(v));
    if (hall) unpaid('hall', (v) => this.hallInvoices.set(v));
  }
}
