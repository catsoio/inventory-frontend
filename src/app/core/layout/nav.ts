import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { debounceTime, filter, merge } from 'rxjs';
import { Auth } from '../auth/auth';
import { Billing } from '../billing/billing';
import { productOf, toInternal, type Product } from './products';
import { Todo, todoBadges } from '../todo';
import { environment } from '../../../environments/environment';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Markeras bara på exakt den adressen. */
  exact?: boolean;
  adminOnly?: boolean;
  /** Delen av appen (modul) som måste vara påslagen för garaget, annars visas posten inte. */
  module?: string;
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
 * Axles ekonomi. Hall har en egen översikt (`/dealership/finance`). Fakturor och de andra
 * ekonomisidorna är undermenyn här. Mobilen har ingen sidomeny och visar dem som flikar
 * (`FinanceTabs`).
 */
const FINANCE_NAV: NavItem = {
  path: '/finance',
  label: 'Ekonomi',
  icon: 'account_balance_wallet',
  module: 'bokforing',
  adminOnly: true,
  match: ['/finance', '/bookkeeping'],
  children: [
    { path: '/finance', label: 'Översikt', icon: 'monitoring', exact: true, badge: 'none' },
    { path: '/finance/invoices', label: 'Fakturor', icon: 'receipt_long' },
    { path: '/finance/receipts', label: 'Kvitton', icon: 'receipt' },
    { path: '/finance/register', label: 'Kassa', icon: 'point_of_sale' },
    { path: '/bookkeeping', label: 'Moms och bokföring', icon: 'account_balance' },
  ],
};

/**
 * Sidomenyn på dator. Ordningen är hur ofta det används, inte hur data är modellerad: det man gör
 * flera gånger om dagen ligger överst, ett val per avsnitt (resten är flikar i avsnittet) och
 * sådant som ställs in en gång (registren) ligger längst ned under Register.
 */
export const NAV_AXLE: NavSection[] = [
  {
    title: '',
    items: [{ path: '/dashboard', label: 'Hem', icon: 'home', exact: true }],
  },
  {
    title: 'Arbete',
    items: [
      { path: '/bookings', label: 'Tidsbokning', icon: 'calendar_month', module: 'tidsbokning' },
      // Kundens egen bokningssida; ägaren formar den här, Catso sätter adressen.
      {
        path: '/online-booking',
        label: 'Onlinebokning',
        icon: 'language',
        module: 'onlinebokning',
        adminOnly: true,
        only: 'desktop',
      },
      {
        path: '/workorders',
        label: 'Arbetsorder',
        icon: 'handyman',
        module: 'arbetsorder',
        hidden: !environment.workOrders,
      },
    ],
  },
  {
    title: 'Däck och lager',
    items: [
      { path: '/storage', label: 'Däckhotell', icon: 'warehouse', module: 'dackhotell' },
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
      { path: '/vehicles', label: 'Kundbilar', icon: 'directions_car' },
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
        module: 'arbetsorder',
        hidden: !environment.workOrders,
      },
      {
        path: '/sales',
        label: 'Försäljning',
        icon: 'point_of_sale',
      },
      FINANCE_NAV,
    ],
  },
];

/**
 * Halls ekonomi: egen översikt (vinst per bil, lager, moms på bilarna), medan Fakturor och Moms och
 * bokföring är samma sidor som i Axle, med Hall förvalt (`app-product-filter`). Fakturanummer, moms
 * och bokföring gäller bolaget, inte en produkt.
 */
const HALL_FINANCE_NAV: NavItem = {
  path: '/dealership/finance',
  label: 'Ekonomi',
  icon: 'account_balance_wallet',
  module: 'bilhandel',
  adminOnly: true,
  match: ['/dealership/finance', '/finance', '/bookkeeping'],
  children: [
    {
      path: '/dealership/finance',
      label: 'Översikt',
      icon: 'monitoring',
      exact: true,
      badge: 'none',
    },
    { path: '/finance/invoices', label: 'Fakturor', icon: 'receipt_long' },
    { path: '/bookkeeping', label: 'Moms och bokföring', icon: 'account_balance' },
  ],
};

/**
 * Hall (bilhandeln). Handlarens ord är bilen och affären: vad som står i lager, vad som är till salu
 * och vad som sålts. Kunder delas med Axle.
 */
export const NAV_HALL: NavSection[] = [
  {
    title: '',
    items: [{ path: '/dealership', label: 'Hem', icon: 'home', exact: true, module: 'bilhandel' }],
  },
  {
    title: 'Bilhandel',
    items: [
      // Till salu, Inköpta och Sålda är flikar här, och bilens kort hör också hit.
      {
        path: '/dealership/cars',
        label: 'Bilar',
        icon: 'directions_car',
        module: 'bilhandel',
      },
      {
        path: '/dealership/deals',
        label: 'Affärer',
        icon: 'handshake',
        module: 'bilhandel',
      },
      {
        path: '/dealership/site',
        label: 'Webbplats',
        icon: 'language',
        module: 'bilhandel',
        adminOnly: true,
      },
    ],
  },
  { title: 'Kunder', items: [{ path: '/customers', label: 'Kunder', icon: 'groups' }] },
  { title: 'Ekonomi', items: [HALL_FINANCE_NAV] },
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
  { path: '/bookings', label: 'Tider', icon: 'calendar_month', module: 'tidsbokning' },
  { path: '/storage', label: 'Hotell', icon: 'warehouse', module: 'dackhotell' },
  { path: '/inventory', label: 'Lager', icon: 'inventory_2', match: ['/inventory', '/reports'] },
];

/**
 * Mobilens flikar i Hall: bilhandlaren går mellan bilarna på tomten. Hem visar frågor och det som
 * väntar, Bilar är listan att öppna och fota i, Kunder att ringa.
 */
export const MOBILE_TABS_HALL: NavItem[] = [
  { path: '/dealership', label: 'Hem', icon: 'home', exact: true, module: 'bilhandel' },
  { path: '/dealership/cars', label: 'Bilar', icon: 'directions_car', module: 'bilhandel' },
  { path: '/customers', label: 'Kunder', icon: 'groups' },
];

/** "Mer" i Hall. */
export const MOBILE_MORE_HALL: NavItem[] = [
  { path: '/dealership/deals', label: 'Affärer', icon: 'handshake', module: 'bilhandel' },
  {
    path: '/dealership/finance',
    label: 'Ekonomi',
    icon: 'account_balance_wallet',
    module: 'bilhandel',
    adminOnly: true,
    match: ['/dealership/finance', '/finance', '/bookkeeping'],
  },
];

/** "Mer" på mobil: det som behövs ibland men inte i farten. */
export const MOBILE_MORE: NavItem[] = [
  // Verkstad som kör ute hos kunden skapar order och offerter i bilen (beslut 2026-10-31).
  {
    path: '/workorders',
    label: 'Arbetsorder',
    icon: 'handyman',
    module: 'arbetsorder',
    hidden: !environment.workOrders,
  },
  {
    path: '/quotes',
    label: 'Offert',
    icon: 'request_quote',
    module: 'arbetsorder',
    hidden: !environment.workOrders,
  },
  {
    path: '/sales',
    label: 'Försäljning',
    icon: 'point_of_sale',
  },
  { path: '/customers', label: 'Kunder', icon: 'groups' },
  { path: '/vehicles', label: 'Kundbilar', icon: 'directions_car' },
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
  private readonly billing = inject(Billing);
  private readonly router = inject(Router);

  /** Nuvarande adress (utan query), som rutterna heter internt (`/workorders`, inte `/axle/workorders`). */
  readonly url = signal(toInternal(this.router.url).split(/[?#]/)[0]);

  /**
   * Produkten man är i: Axle eller Hall. Styr produktfältet och sidomenyn. Sidor som hör till båda
   * (Kunder, Ekonomi) låter produkten vara som den var, så man stannar där man jobbade. Valet sparas
   * per webbläsare.
   */
  readonly product = signal<Product>(this.initialProduct());

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
  readonly badges = computed(() => todoBadges(this.todo.itemsFor(this.product())));

  private get admin(): boolean {
    return this.auth.isAdmin() || this.auth.isSuperAdmin();
  }

  private visible(i: NavItem, mobile: boolean): boolean {
    return (
      !i.hidden &&
      this.billing.allows(i.module) &&
      (!i.adminOnly || this.admin) &&
      (!i.only || i.only === (mobile ? 'mobile' : 'desktop'))
    );
  }

  /** Sidomenyn (dator): filtrerad efter roll och påslagna funktioner, barnen med. */
  readonly sections = computed<NavSection[]>(() => {
    if (this.auth.isMechanic()) return MECHANIC_NAV;
    const shown = (i: NavItem): NavItem =>
      i.children ? { ...i, children: i.children.filter((c) => this.visible(c, false)) } : i;
    return (this.product() === 'hall' ? NAV_HALL : NAV_AXLE)
      .map((s) => ({
        ...s,
        items: s.items
          .filter((i) => this.visible(i, false))
          .map(shown)
          .filter((i) => !i.children || i.children.length),
      }))
      .filter((s) => s.items.length);
  });

  readonly footer = computed<NavItem[]>(() =>
    // Registret (artikeltyper, lager, aktivitetslogg) hör till Axle.
    this.auth.isMechanic() || this.product() !== 'axle'
      ? []
      : FOOTER_NAV.filter((i) => this.visible(i, false)),
  );

  /** Mobilens flikar och "Mer". Mekanikern har bara sina order. */
  readonly tabs = computed<NavItem[]>(() =>
    this.auth.isMechanic()
      ? [{ path: '/workorders/mine', label: 'Order', icon: 'handyman' }]
      : (this.product() === 'hall' ? MOBILE_TABS_HALL : MOBILE_TABS).filter((i) =>
          this.billing.allows(i.module),
        ),
  );
  readonly more = computed<NavItem[]>(() =>
    this.auth.isMechanic()
      ? []
      : (this.product() === 'hall' ? MOBILE_MORE_HALL : MOBILE_MORE).filter((i) =>
          this.visible(i, true),
        ),
  );

  constructor() {
    const done$ = this.router.events.pipe(filter((e) => e instanceof NavigationEnd));
    done$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((e) => {
      const url = toInternal(e.urlAfterRedirects).split(/[?#]/)[0];
      this.url.set(url);
      const product = productOf(url);
      if (product && product !== this.product()) this.setProduct(product);
      // Kommer man in i en grupp (t.ex. via en länk på Hem) fälls den ut, även om man stängt den förut.
      for (const s of [...NAV_AXLE, ...NAV_HALL]) {
        for (const i of s.items) {
          if (i.children && this.matches(i) && this.groups()[i.path] === false) {
            this.setGroup(i.path, true);
          }
        }
      }
    });
    // Siffrorna uppdateras när garaget byts och efter varje sidbyte (t.ex. efter en försäljning),
    // ett anrop per omgång även om flera händer samtidigt.
    // Vad garaget får använda hämtas när garaget byts (banderollen gör det bara för vanliga användare).
    toObservable(computed(() => this.auth.garage()?.id))
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((id) => id && !this.auth.isSuperAdmin() && this.billing.refresh());
    merge(toObservable(computed(() => this.auth.garage()?.id)), done$)
      .pipe(debounceTime(400), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.refresh());
  }

  private initialProduct(): Product {
    const fromUrl = productOf(toInternal(this.router.url));
    if (fromUrl) {
      try {
        localStorage.setItem('garagestock.product', fromUrl);
      } catch {
        /* sparas bara som bekvämlighet */
      }
      return fromUrl;
    }
    return this.stored('garagestock.product') === 'hall' ? 'hall' : 'axle';
  }

  private setProduct(p: Product) {
    this.product.set(p);
    try {
      localStorage.setItem('garagestock.product', p);
    } catch {
      /* sparas bara som bekvämlighet */
    }
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
    this.todo.refresh(this.billing.allows('bilhandel'));
  }
}
