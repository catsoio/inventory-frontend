import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { kronor } from '../shared/chart/chart-kit';
import { invoiceStatus } from '../shared/invoice-status';
import { InventoryApi } from './api/inventory-api';
import { QuoteApi } from './api/quote-api';
import { SalesCardApi } from './api/sales-card-api';
import { StorageApi } from './api/storage-api';
import { WorkOrderApi } from './api/work-order-api';
import { Auth } from './auth/auth';
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

export interface TodoInput {
  stock: Summary | null;
  hotel: StorageSummary | null;
  drafts: number;
  /** Obetalda fakturor (ägaren), och hur många av dem som har förfallit. */
  invoices: { unpaid: number; overdue: number; amount: number; more: boolean } | null;
  /** Arbetsorder där en del saknas. */
  partsOrders: number;
  quotes: { approved: number; waiting: number };
}

const RANK: Record<Urgency, number> = { urgent: 0, wait: 1, info: 2 };

const TONES: Record<Exclude<Urgency, 'info'>, { tone: string; dot: string }> = {
  urgent: { tone: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  wait: { tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

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
  if (inv && inv.unpaid > 0) {
    const late = inv.overdue > 0;
    out.push({
      key: 'unpaid-invoices',
      urgency: late ? 'urgent' : 'wait',
      // På Fakturor, och på Ekonomi (gruppens rad när den är hopfälld, och mobilens "Mer").
      menus: ['/finance/invoices', '/finance'],
      badgeCount: late ? inv.overdue : inv.unpaid,
      badgeNoun: late ? ['förfallen', 'förfallna'] : ['obetald', 'obetalda'],
      text:
        `${inv.unpaid} ${plural(inv.unpaid, 'obetald faktura', 'obetalda fakturor')}` +
        (late ? `, varav ${inv.overdue} ${plural(inv.overdue, 'förfallen', 'förfallna')}` : '') +
        ` · ${kronor(inv.amount)}${inv.more ? '+' : ''}`,
      icon: 'receipt_long',
      link: '/finance/invoices',
      params: { status: late ? 'overdue' : 'unpaid' },
    });
  }
  if (i.quotes.approved > 0) {
    const n = i.quotes.approved;
    out.push({
      key: 'quotes-approved',
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
  if (i.partsOrders > 0) {
    out.push({
      key: 'parts',
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
  private readonly inventory = inject(InventoryApi);
  private readonly storage = inject(StorageApi);
  private readonly orders = inject(WorkOrderApi);
  private readonly cards = inject(SalesCardApi);
  private readonly quoteApi = inject(QuoteApi);

  private readonly stock = signal<Summary | null>(null);
  private readonly hotel = signal<StorageSummary | null>(null);
  private readonly drafts = signal(0);
  private readonly partsOrders = signal(0);
  private readonly approved = signal(0);
  private readonly waiting = signal(0);
  private readonly invoices = signal<TodoInput['invoices']>(null);

  readonly items = computed(() =>
    buildTodo({
      stock: this.stock(),
      hotel: this.hotel(),
      drafts: this.drafts(),
      invoices: this.invoices(),
      partsOrders: this.partsOrders(),
      quotes: { approved: this.approved(), waiting: this.waiting() },
    }),
  );

  /** Lager och hotell hämtade, så att "Allt under kontroll" inte visas innan svaret kommit. */
  readonly ready = computed(() => this.stock() !== null && this.hotel() !== null);

  private get admin(): boolean {
    return this.auth.isAdmin() || this.auth.isSuperAdmin();
  }

  refresh(): void {
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
      .list({ status: 'draft', limit: 1 })
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.drafts.set(x?.pagination.total ?? 0));
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
    this.cards
      .list({ status: 'posted', paid: false, limit: 100 })
      .pipe(catchError(() => of(null)))
      .subscribe((x) => {
        if (!x) return this.invoices.set(null);
        const today = new Date();
        this.invoices.set({
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
  }
}
