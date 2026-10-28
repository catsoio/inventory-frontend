import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { debounceTime, filter, merge } from 'rxjs';
import { Auth } from '../auth/auth';
import { Todo, todoBadges } from '../todo';
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
        path: '/workorders',
        label: 'Arbetsorder',
        icon: 'handyman',
        only: 'desktop',
        hidden: !environment.workOrders,
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
      // Offerten är säljdokumentet som kommer före affären (som Sales Quote i ett affärssystem),
      // därför står den över Försäljning.
      {
        path: '/quotes',
        label: 'Offert',
        icon: 'request_quote',
        only: 'desktop',
        hidden: !environment.workOrders,
      },
      {
        path: '/sales',
        label: 'Försäljning',
        icon: 'point_of_sale',
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
          { path: '/finance/receipts', label: 'Kvitton', icon: 'receipt' },
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

/** Menyn och siffrorna i den, för sidomenyn på dator och mobilens flikar. */
@Injectable({ providedIn: 'root' })
export class Nav {
  private readonly auth = inject(Auth);
  private readonly todo = inject(Todo);
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

  /**
   * Siffrorna i menyn: det som väntar på någon, ett antal med ett ord ("1 utkast"), röd när något är
   * sent eller slut och gul när det väntar på dig. Samma lista som Hem visar (`core/todo.ts`).
   */
  readonly badges = computed(() => todoBadges(this.todo.items()));

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
    this.todo.refresh();
  }
}
