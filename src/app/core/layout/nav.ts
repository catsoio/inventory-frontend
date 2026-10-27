import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { catchError, debounceTime, filter, merge, of } from 'rxjs';
import { InventoryApi } from '../api/inventory-api';
import { SalesCardApi } from '../api/sales-card-api';
import { StorageApi } from '../api/storage-api';
import { WorkOrderApi } from '../api/work-order-api';
import { Auth } from '../auth/auth';
import { Report, StorageSummary, Summary } from '../models';
import { environment } from '../../../environments/environment';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Markeras bara på exakt den adressen. */
  exact?: boolean;
  adminOnly?: boolean;
  /** Dold tills funktionen är påslagen. */
  hidden?: boolean;
  /** Visas bara på dator eller bara på mobil. */
  only?: 'desktop' | 'mobile';
  /** Markeras också när någon av de här adresserna är öppen (avsnittets flikar och undersidor). */
  match?: string[];
  /**
   * Nyckeln till siffran i menyn (`Nav.badges`); standard är adressen. Sätts för en sida som delar
   * adress med sin grupp (Översikt under Ekonomi) men inte ska visa gruppens siffra.
   */
  badge?: string;
  /**
   * Undermeny på dator: posten fälls ut i sidomenyn och varje barn är en egen adress. Posten själv
   * är bara en rubrik som öppnar och stänger; mobilen har ingen sidomeny och använder inte barnen.
   */
  children?: NavItem[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Siffra bredvid ett menyval så att man ser läget utan att öppna sidan. */
export interface Badge {
  text: string;
  /** Pillens färger. */
  tone: string;
  /** Prick på ikonen när menyn är hopfälld eller på mobilens flikar. */
  dot: string;
  hint: string;
}

/**
 * Sidomenyn på dator. Ordningen är hur ofta det används, inte hur data är modellerad: det man gör
 * flera gånger om dagen ligger överst, ett val per avsnitt (resten är flikar i avsnittet) och
 * sådant som ställs in en gång (registren) ligger längst ned under Register.
 */
export const NAV: NavSection[] = [
  { title: '', items: [{ path: '/dashboard', label: 'Hem', icon: 'home', exact: true }] },
  {
    title: 'Arbete',
    items: [
      { path: '/bookings', label: 'Tidsbokning', icon: 'calendar_month' },
      {
        // Kostnadsförslag är en flik här (förslaget blir en arbetsorder).
        path: '/workorders',
        label: 'Arbetsorder',
        icon: 'handyman',
        only: 'desktop',
        hidden: !environment.workOrders,
        match: ['/workorders', '/quotes'],
      },
    ],
  },
  {
    title: 'Däck och lager',
    items: [
      { path: '/storage', label: 'Däckhotell', icon: 'warehouse' },
      // Översikt och Lagerlogg är flikar här.
      {
        path: '/inventory',
        label: 'Artiklar',
        icon: 'inventory_2',
        match: ['/inventory', '/reports'],
      },
      { path: '/purchases', label: 'Inköp', icon: 'shopping_cart_checkout' },
    ],
  },
  {
    // Det verkstaden ställer in: vem som jobbar, vilka platser som finns och vad man utför.
    title: 'Verkstad',
    items: [
      {
        path: '/resources',
        label: 'Mekaniker och platser',
        icon: 'engineering',
        only: 'desktop',
      },
      { path: '/service-types', label: 'Åtgärder', icon: 'build', only: 'desktop' },
    ],
  },
  {
    title: 'Kunder',
    items: [
      { path: '/customers', label: 'Kunder', icon: 'groups' },
      { path: '/vehicles', label: 'Bilar', icon: 'directions_car' },
    ],
  },
  {
    title: 'Försäljning och ekonomi',
    items: [
      {
        path: '/sales',
        label: 'Försäljning',
        icon: 'point_of_sale',
        match: ['/sales', '/sales-legacy'],
      },
      // Fakturor och de andra ekonomisidorna är undermenyn här. Mobilen har ingen sidomeny och
      // visar dem som flikar (`FinanceTabs`).
      {
        path: '/finance',
        label: 'Ekonomi',
        icon: 'account_balance_wallet',
        adminOnly: true,
        match: ['/finance', '/bookkeeping'],
        children: [
          { path: '/finance', label: 'Översikt', icon: 'monitoring', exact: true, badge: 'none' },
          { path: '/finance/invoices', label: 'Fakturor', icon: 'receipt_long' },
          { path: '/bookkeeping', label: 'Moms och bokföring', icon: 'account_balance' },
        ],
      },
    ],
  },
];

/** Längst ned i sidomenyn: sådant som ställs in en gång. Bara ägaren, bara på dator. */
export const FOOTER_NAV: NavItem[] = [
  {
    path: '/register',
    label: 'Register',
    icon: 'dataset',
    only: 'desktop',
    match: ['/register', '/article-types', '/warehouses', '/suppliers', '/activity'],
  },
];

const MECHANIC_NAV: NavSection[] = [
  { title: '', items: [{ path: '/workorders/mine', label: 'Mina order', icon: 'handyman' }] },
];

/**
 * Mobilens bottenfält: det som görs i farten (hitta ett däckset, se dagens tider, kolla om en
 * storlek finns). Arbetsorder, planering och ekonomi är dator, och ligger inte här.
 */
export const MOBILE_TABS: NavItem[] = [
  { path: '/dashboard', label: 'Hem', icon: 'home', exact: true },
  { path: '/bookings', label: 'Tider', icon: 'calendar_month' },
  { path: '/storage', label: 'Hotell', icon: 'warehouse' },
  { path: '/inventory', label: 'Lager', icon: 'inventory_2', match: ['/inventory', '/reports'] },
];

/** "Mer" på mobil: det som behövs ibland men inte i farten. */
export const MOBILE_MORE: NavItem[] = [
  {
    path: '/sales',
    label: 'Försäljning',
    icon: 'point_of_sale',
    match: ['/sales', '/sales-legacy'],
  },
  { path: '/customers', label: 'Kunder', icon: 'groups' },
  { path: '/vehicles', label: 'Bilar', icon: 'directions_car' },
  { path: '/purchases', label: 'Inköp', icon: 'shopping_cart_checkout' },
  {
    path: '/finance',
    label: 'Ekonomi',
    icon: 'account_balance_wallet',
    adminOnly: true,
    match: ['/finance', '/bookkeeping'],
  },
];

const today = () => new Date().toLocaleDateString('sv-SE');

/** Menyn och siffrorna i den, för sidomenyn på dator och mobilens flikar. */
@Injectable({ providedIn: 'root' })
export class Nav {
  private readonly auth = inject(Auth);
  private readonly api = inject(InventoryApi);
  private readonly storage = inject(StorageApi);
  private readonly orders = inject(WorkOrderApi);
  private readonly cards = inject(SalesCardApi);
  private readonly router = inject(Router);

  /** Nuvarande adress (utan query). */
  readonly url = signal(this.router.url.split(/[?#]/)[0]);

  /** Hopfälld sidomeny (bara ikoner); valet sparas per webbläsare. */
  readonly collapsed = signal(this.stored('garagestock.sidebar') === 'collapsed');

  /**
   * Utfällda undermenyer, per post. Det man själv öppnat eller stängt gäller; annars är en grupp
   * öppen när någon av dess sidor är det. Valet sparas per webbläsare.
   */
  private readonly groups = signal<Record<string, boolean>>(this.storedGroups());

  private readonly stock = signal<Summary | null>(null);
  private readonly hotel = signal<StorageSummary | null>(null);
  private readonly soldToday = signal<Report | null>(null);
  private readonly openOrders = signal(0);
  private readonly missingOrders = signal(0);
  private readonly draftCards = signal(0);
  private readonly unpaidInvoices = signal(0);

  readonly badges = computed<Record<string, Badge>>(() => {
    const out: Record<string, Badge> = {};
    const s = this.stock();
    if (s && s.lowStock > 0) {
      out['/inventory'] = {
        text: String(s.lowStock),
        tone: 'bg-amber-100 text-amber-800',
        dot: 'bg-amber-500',
        hint: `${s.lowStock} artiklar behöver beställas`,
      };
    }
    const h = this.hotel();
    if (h && h.stored > 0) {
      out['/storage'] = {
        text: String(h.stored),
        tone: h.overdue > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600',
        dot: h.overdue > 0 ? 'bg-red-500' : 'bg-gray-400',
        hint:
          `${h.stored} set inlagrade` +
          (h.overdue > 0 ? `, ${h.overdue} har passerat hämtdatum` : '') +
          (h.unpaid > 0 ? `, ${h.unpaid} obetalda` : ''),
      };
    }
    const missing = this.missingOrders();
    const fresh = this.openOrders();
    if (missing > 0 || fresh > 0) {
      out['/workorders'] =
        missing > 0
          ? {
              text: String(missing),
              tone: 'bg-amber-100 text-amber-800',
              dot: 'bg-amber-500',
              hint: `${missing} order har en del som saknas` + (fresh ? `, ${fresh} nya` : ''),
            }
          : {
              text: String(fresh),
              tone: 'bg-blue-100 text-blue-800',
              dot: 'bg-blue-500',
              hint: `${fresh} nya order`,
            };
    }
    const unpaid = this.unpaidInvoices();
    if (unpaid > 0) {
      // På Fakturor, och på Ekonomi (gruppens rad när den är hopfälld, och mobilens "Mer").
      out['/finance/invoices'] = out['/finance'] = {
        text: String(unpaid),
        tone: 'bg-red-100 text-red-800',
        dot: 'bg-red-500',
        hint: `${unpaid} obetalda fakturor`,
      };
    }
    const drafts = this.draftCards();
    const r = this.soldToday();
    if (drafts > 0) {
      out['/sales'] = {
        text: `${drafts} utkast`,
        tone: 'bg-amber-100 text-amber-800',
        dot: 'bg-amber-500',
        hint: `${drafts} säljkort väntar på att bokföras`,
      };
    } else if (r && r.soldUnits > 0) {
      out['/sales'] = {
        text: `${r.soldUnits} idag`,
        tone: 'bg-green-100 text-green-800',
        dot: 'bg-green-500',
        hint: `${r.soldUnits} sålda enheter idag`,
      };
    }
    return out;
  });

  private get admin(): boolean {
    return this.auth.isAdmin() || this.auth.isSuperAdmin();
  }

  private visible(i: NavItem, mobile: boolean): boolean {
    return (
      !i.hidden &&
      (!i.adminOnly || this.admin) &&
      (!i.only || i.only === (mobile ? 'mobile' : 'desktop'))
    );
  }

  /** Sidomenyn (dator): filtrerad efter roll och påslagna funktioner, barnen med. */
  readonly sections = computed<NavSection[]>(() => {
    if (this.auth.isMechanic()) return MECHANIC_NAV;
    const shown = (i: NavItem): NavItem =>
      i.children ? { ...i, children: i.children.filter((c) => this.visible(c, false)) } : i;
    return NAV.map((s) => ({
      ...s,
      items: s.items
        .filter((i) => this.visible(i, false))
        .map(shown)
        .filter((i) => !i.children || i.children.length),
    })).filter((s) => s.items.length);
  });

  readonly footer = computed<NavItem[]>(() =>
    this.auth.isMechanic() ? [] : FOOTER_NAV.filter((i) => this.visible(i, false)),
  );

  /** Mobilens flikar och "Mer". Mekanikern har bara sina order. */
  readonly tabs = computed<NavItem[]>(() =>
    this.auth.isMechanic()
      ? [{ path: '/workorders/mine', label: 'Order', icon: 'handyman' }]
      : MOBILE_TABS,
  );
  readonly more = computed<NavItem[]>(() =>
    this.auth.isMechanic() ? [] : MOBILE_MORE.filter((i) => this.visible(i, true)),
  );

  constructor() {
    const done$ = this.router.events.pipe(filter((e) => e instanceof NavigationEnd));
    done$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((e) => {
      this.url.set(e.urlAfterRedirects.split(/[?#]/)[0]);
      // Kommer man in i en grupp (t.ex. via en länk på Hem) fälls den ut, även om man stängt den förut.
      for (const s of NAV) {
        for (const i of s.items) {
          if (i.children && this.matches(i) && this.groups()[i.path] === false) {
            this.setGroup(i.path, true);
          }
        }
      }
    });
    // Siffrorna uppdateras när garaget byts och efter varje sidbyte (t.ex. efter en försäljning),
    // ett anrop per omgång även om flera händer samtidigt.
    merge(toObservable(computed(() => this.auth.garage()?.id)), done$)
      .pipe(debounceTime(400), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.refresh());
  }

  toggle() {
    this.collapsed.update((c) => !c);
    try {
      localStorage.setItem('garagestock.sidebar', this.collapsed() ? 'collapsed' : 'open');
    } catch {
      /* sparas bara som bekvämlighet */
    }
  }

  private stored(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  /** Är undermenyn utfälld? */
  isOpen(item: NavItem): boolean {
    return this.groups()[item.path] ?? this.matches(item);
  }

  toggleGroup(item: NavItem) {
    this.setGroup(item.path, !this.isOpen(item));
  }

  private setGroup(path: string, open: boolean) {
    this.groups.update((g) => ({ ...g, [path]: open }));
    try {
      localStorage.setItem('garagestock.navGroups', JSON.stringify(this.groups()));
    } catch {
      /* sparas bara som bekvämlighet */
    }
  }

  private storedGroups(): Record<string, boolean> {
    try {
      const raw = JSON.parse(this.stored('garagestock.navGroups') ?? '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

  /** Någon av länkens adresser är öppen (t.ex. Ekonomi över flera sidor). */
  matches(item: NavItem): boolean {
    const u = this.url();
    const hit = (p: string) => u === p || u.startsWith(p + '/');
    if (item.exact) return u === item.path;
    return (item.match ?? [item.path]).some(hit);
  }

  private refresh() {
    // Mekanikern har inga lager- eller hotellsiffror att visa (och skulle få 403).
    if (this.auth.isMechanic() || !this.auth.garage()) return;
    this.api
      .summary()
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.stock.set(x));
    this.storage
      .summary()
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.hotel.set(x));
    if (environment.workOrders) {
      this.orders
        .list({ needsAction: true, limit: 1 })
        .pipe(catchError(() => of(null)))
        .subscribe((x) => this.missingOrders.set(x?.pagination.total ?? 0));
      this.orders
        .list({ status: 'open', limit: 1 })
        .pipe(catchError(() => of(null)))
        .subscribe((x) => this.openOrders.set(x?.pagination.total ?? 0));
    }
    this.cards
      .list({ status: 'draft', limit: 1 })
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.draftCards.set(x?.pagination.total ?? 0));
    // Försäljningssiffror är bara för ägare; personal får annars 403 på varje sida.
    if (!this.admin) return;
    this.api
      .report(today(), today())
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.soldToday.set(x));
    this.cards
      .list({ status: 'posted', paid: false, limit: 1 })
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.unpaidInvoices.set(x?.pagination.total ?? 0));
  }
}
