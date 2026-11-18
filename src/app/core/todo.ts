import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, filter, finalize, fromEvent, throttleTime } from 'rxjs';
import { kronor } from '../shared/chart/chart-kit';
import { CarTodo, carTodo } from '../shared/car-stock';
import { invoiceStatus } from '../shared/invoice-status';
import { type ToInvoiceSummary, toInvoiceSummary } from '../shared/to-invoice';
import { ApiCache } from './api/api-cache';
import { TodoApi } from './api/todo-api';
import { Auth } from './auth/auth';
import type { Product } from './layout/products';
import { StorageSummary, Summary, TodoSnapshot, UnpaidSnapshot } from './models';

/**
 * Hur brådskande något är. Det styr ordningen, vilken siffra ett menyval visar och pricken på
 * produktfliken:
 *  - `urgent`: ett datum har passerat eller något går inte att sälja (försenat däckset, förfallen
 *    faktura, slut i lagret).
 *  - `wait`: något väntar på att du gör något, men ingenting är sent.
 *  - `info`: bra att veta. Blir aldrig en siffra i menyn.
 */
export type Urgency = 'urgent' | 'wait' | 'info';

/**
 * Färgen på en siffra följer vad den betyder, inte bara hur brådskande den är:
 *  - röd: något är sent eller går inte att sälja (`urgent`),
 *  - gul: bör åtgärdas, ett problem på väg (att beställa, obetald faktura, del saknas),
 *  - grön: goda nyheter som väntar på nästa steg (`tone: 'good'`, godkänd offert),
 *  - grå: vanligt jobb att ta tag i, inget fel (`tone: 'neutral'`, utkast och förfrågningar).
 */
export type TodoTone = 'good' | 'neutral';
export type ToneName = 'bad' | 'warn' | 'good' | 'info';

/** Färgen på en rad under "Att göra" på Hem (grått jobb visas som blå information). */
export const toneOf = (t: Pick<TodoItem, 'urgency' | 'tone'>): ToneName =>
  t.urgency === 'urgent'
    ? 'bad'
    : t.urgency === 'info' || t.tone === 'neutral'
      ? 'info'
      : t.tone === 'good'
        ? 'good'
        : 'warn';

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
  /** Vilken produkt det väntar i: Axle (verkstaden), Däck (hotellet), Hall (bilhandeln) eller Bärgning. */
  product: Product;
  urgency: Urgency;
  /** Färgen när den inte är gul (se `TodoTone`); utan val följer den urgency. */
  tone?: TodoTone;
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
  /** Beställningar hos en leverantör vars varor inte alla kommit: vanligt jobb, att ta emot. */
  toReceive?: number;
  /** Klara arbetsorder att fakturera (ingen faktura påbörjad), och hur många som är sena. */
  toInvoice?: ToInvoiceSummary | null;
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

/** Siffrans färger (`TodoTone`). Grå prickar visas inte på mobilens flikar: inget är fel. */
const TONES = {
  urgent: { tone: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  wait: { tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  good: { tone: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
  neutral: { tone: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
} as const;

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
      product: 'dack',
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
      product: 'dack',
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
      tone: 'neutral',
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
      tone: 'good',
      menus: ['/quotes'],
      badgeCount: n,
      badgeNoun: ['godkänd', 'godkända'],
      text: `${n} ${plural(n, 'offert är godkänd', 'offerter är godkända')}, skapa arbetsorder`,
      icon: 'thumb_up',
      link: '/quotes',
      params: { status: 'approved' },
    });
  }
  if (i.toInvoice && i.toInvoice.due > 0) {
    const n = i.toInvoice.due;
    const late = i.toInvoice.late;
    out.push({
      key: 'to-invoice',
      product: 'axle',
      urgency: late > 0 ? 'urgent' : 'wait',
      menus: ['/sales'],
      badgeCount: n,
      badgeNoun: ['att fakturera', 'att fakturera'],
      text: late
        ? `${n} ${plural(n, 'klar arbetsorder', 'klara arbetsorder')} att fakturera, ${late} borde redan ha fakturerats`
        : `${n} ${plural(n, 'klar arbetsorder', 'klara arbetsorder')} att fakturera`,
      icon: 'receipt_long',
      link: '/sales/to-invoice',
    });
  }
  if (i.drafts > 0) {
    out.push({
      key: 'drafts',
      product: 'axle',
      urgency: 'wait',
      tone: 'neutral',
      menus: ['/sales'],
      badgeCount: i.drafts,
      badgeNoun: ['utkast', 'utkast'],
      text: `${i.drafts} säljkort väntar på att bokföras`,
      icon: 'edit_note',
      link: '/sales',
      params: { show: 'draft' },
    });
  }
  if ((i.toReceive ?? 0) > 0) {
    const n = i.toReceive!;
    out.push({
      key: 'to-receive',
      product: 'axle',
      urgency: 'wait',
      tone: 'neutral',
      menus: ['/purchases'],
      badgeCount: n,
      badgeNoun: ['att ta emot', 'att ta emot'],
      text: `${n} ${plural(n, 'beställning', 'beställningar')} att ta emot`,
      icon: 'local_shipping',
      link: '/purchases',
      params: { status: 'ordered' },
    });
  }
  if ((i.hallDrafts ?? 0) > 0) {
    const n = i.hallDrafts!;
    out.push({
      key: 'hall-drafts',
      product: 'hall',
      urgency: 'wait',
      tone: 'neutral',
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
      ...TONES[head.urgency === 'urgent' ? 'urgent' : (head.tone ?? 'wait')],
      hint: mine.map((i) => i.text).join(' · '),
    };
  }
  return out;
}

/** Obetalda fakturor ur det servern skickar: hur många som förfallit avgörs här, som överallt. */
export function unpaidOf(x: UnpaidSnapshot, today = new Date()): UnpaidInvoices {
  return {
    unpaid: x.total,
    overdue: x.items.filter(
      (c) =>
        invoiceStatus({ kind: c.kind ?? 'invoice', dueAt: c.dueAt, paidAt: c.paidAt }, today) ===
        'overdue',
    ).length,
    amount: x.items.reduce((t, c) => t + c.total, 0),
    more: x.total > x.items.length,
  };
}

/**
 * Det servern samlat, som `buildTodo` läser det. En del som servern inte gett (`null`: modulen är av eller
 * rollen saknar rätt) blir tom och visar ingenting.
 */
export function todoInputOf(s: TodoSnapshot, today = new Date()): TodoInput {
  return {
    stock: s.stock,
    hotel: s.hotel,
    drafts: s.drafts ?? 0,
    toReceive: s.toReceive ?? 0,
    toInvoice: s.toInvoice ? toInvoiceSummary(s.toInvoice.customers, today) : null,
    invoices: s.invoices ? unpaidOf(s.invoices, today) : null,
    partsOrders: s.partsOrders ?? 0,
    quotes: s.quotes ?? { approved: 0, waiting: 0 },
    requests: s.requests ?? 0,
    cars: s.cars ? carTodo(s.cars, today) : undefined,
    hallDrafts: s.hallDrafts ?? 0,
    hallInvoices: s.hallInvoices ? unpaidOf(s.hallInvoices, today) : null,
  };
}

/** Så gammal får listan vara när man byter sida innan den hämtas om. */
const STALE_AFTER = 30_000;
/** Och när man kommer tillbaka till fliken. */
const STALE_ON_FOCUS = 60_000;

/**
 * Håller det som väntar (`items`) och hämtar det i ETT anrop (`GET inventory/todo`). Används av menyn och av
 * Hem. Mekanikern har inga siffror (servern svarar 403), och ägarens pengar kommer bara till ägaren.
 *
 * Hämtas om: när garaget byts, när man byter sida och listan är äldre än en halv minut, när man kommer
 * tillbaka till fliken, och en liten stund efter att något ändrats härifrån (så siffran följer det man
 * just gjort). Misslyckas ett anrop står den senaste listan kvar.
 */
@Injectable({ providedIn: 'root' })
export class Todo {
  private readonly auth = inject(Auth);
  private readonly api = inject(TodoApi);

  private readonly state = signal<{ snapshot: TodoSnapshot; at: number; input: TodoInput } | null>(
    null,
  );
  private inflight = false;
  private again = false;

  constructor() {
    const destroyed = inject(DestroyRef);
    // Efter en ändring härifrån: en omräkning efter en kort paus, högst en var tionde sekund.
    inject(ApiCache)
      .writes$.pipe(
        filter((path) => !path.startsWith('inventory/todo')),
        debounceTime(800),
        throttleTime(10_000, undefined, { leading: true, trailing: true }),
        takeUntilDestroyed(destroyed),
      )
      .subscribe(() => this.refresh());
    fromEvent(document, 'visibilitychange')
      .pipe(
        filter(() => document.visibilityState === 'visible'),
        takeUntilDestroyed(destroyed),
      )
      .subscribe(() => this.refreshIfStale(STALE_ON_FOCUS));
  }

  readonly items = computed(() => {
    const s = this.state();
    return s ? buildTodo(s.input) : [];
  });

  // Delar av svaret som Hem visar som egna nyckeltal, så att de inte hämtas en gång till.
  readonly stock = computed(() => this.state()?.snapshot.stock ?? null);
  readonly hotel = computed(() => this.state()?.snapshot.hotel ?? null);
  readonly drafts = computed(() => this.state()?.input.drafts ?? 0);
  readonly invoices = computed(() => this.state()?.input.invoices ?? null);
  readonly hallInvoices = computed(() => this.state()?.input.hallInvoices ?? null);

  /**
   * Det som väntar i en produkt. Menyn visar bara den produktens saker. Verkstad och Däck delar
   * Varor och Ekonomi, så de ser varandras siffror (menyval som saknas i den andras meny syns inte).
   */
  itemsFor(product: Product): TodoItem[] {
    const shared = (p: Product) => p === 'axle' || p === 'dack';
    return this.items().filter((t) =>
      shared(product) ? shared(t.product) : t.product === product,
    );
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
    return {
      axle: worst('axle'),
      dack: worst('dack'),
      hall: worst('hall'),
      towing: worst('towing'),
    };
  });

  /** Listan har hämtats, så att "Allt under kontroll" inte visas innan svaret kommit. */
  readonly ready = computed(() => this.state() !== null);

  /** Hämtar listan nu. Ett anrop i taget: kommer en ny fråga medan en pågår tas den efteråt. */
  refresh(): void {
    // Mekanikern har inga lager- eller hotellsiffror att visa (och skulle få 403).
    if (this.auth.isMechanic() || !this.auth.garage()) return;
    if (this.inflight) {
      this.again = true;
      return;
    }
    this.inflight = true;
    this.api
      .snapshot()
      .pipe(
        finalize(() => {
          this.inflight = false;
          if (this.again) {
            this.again = false;
            this.refresh();
          }
        }),
      )
      .subscribe({
        next: (snapshot) => {
          const now = Date.now();
          this.state.set({ snapshot, at: now, input: todoInputOf(snapshot, new Date(now)) });
        },
        // Det som redan visas står kvar.
        error: () => {},
      });
  }

  /** Hämtar om listan om den är äldre än `maxAge` ms (eller inte hämtats alls). */
  refreshIfStale(maxAge = STALE_AFTER): void {
    const s = this.state();
    if (!s || Date.now() - s.at > maxAge) this.refresh();
  }
}
