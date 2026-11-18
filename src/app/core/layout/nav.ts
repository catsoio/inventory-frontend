import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { debounceTime, filter } from 'rxjs';
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
  /** Markeras inte på de här adresserna, även om de ligger under `path` (en Hem-sida under produktens lista). */
  exclude?: string[];
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
 * Axles ekonomi: ett enda menyval. Översikt, Fakturor, Kvitton, Kassaregister och Moms och
 * bokföring är flikar i sidhuvudet (`FinanceTabs`), på dator och mobil. Siffran för obetalda
 * och förfallna fakturor ligger på menyvalet. Hall har en egen översikt (`/dealership/finance`).
 */
const FINANCE_NAV: NavItem = {
  path: '/finance',
  label: 'Ekonomi',
  icon: 'account_balance_wallet',
  module: 'bokforing',
  adminOnly: true,
  match: ['/finance', '/bookkeeping'],
};

/**
 * Varor: försäljning, artiklar och inköp, allt som rör varor och pengarna för dem. Delas av
 * Verkstad och Däck (samma sidor, man stannar i den produkt man kom från). Säljkort och Att
 * fakturera är flikar under Försäljning, Översikt, Lagerlogg och Inventering under Artiklar.
 */
const VAROR_NAV: NavSection = {
  title: 'Varor',
  items: [
    { path: '/sales', label: 'Försäljning', icon: 'point_of_sale' },
    {
      path: '/inventory',
      label: 'Artiklar',
      icon: 'inventory_2',
      match: ['/inventory', '/reports'],
    },
    { path: '/purchases', label: 'Inköp', icon: 'shopping_cart_checkout' },
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
    // Flödet från samtal till jobb: tid, offert och arbetsorder. Fakturan skapas under Varor.
    title: 'Arbete',
    items: [
      { path: '/bookings', label: 'Tidsbokning', icon: 'calendar_month', module: 'tidsbokning' },
      // Offerten är säljdokumentet som kommer före arbetsordern (som Sales Quote i ett affärssystem).
      {
        path: '/quotes',
        label: 'Offert',
        icon: 'request_quote',
        module: 'arbetsorder',
        hidden: !environment.workOrders,
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
  VAROR_NAV,
  {
    title: 'Kunder',
    items: [
      { path: '/customers', label: 'Kunder', icon: 'groups' },
      { path: '/vehicles', label: 'Kundbilar', icon: 'directions_car' },
    ],
  },
  {
    // Det verkstaden ställer in: vem som jobbar, vilka platser som finns och vad man utför och tar betalt för.
    title: 'Personal och tjänster',
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
  // Bara ägaren; bolagets pengar, inte det dagliga arbetet.
  { title: 'Ekonomi', items: [FINANCE_NAV] },
];

/**
 * Däck (däckhotellet): kundernas däckset, med samma varor, kunder och ekonomi som Verkstad. Inlämningar,
 * Översikt och Inventering är flikar under Däckhotell.
 */
export const NAV_DACK: NavSection[] = [
  {
    title: '',
    items: [
      { path: '/storage/home', label: 'Hem', icon: 'home', exact: true, module: 'dackhotell' },
    ],
  },
  {
    title: 'Däckhotell',
    items: [
      {
        path: '/storage',
        label: 'Inlämningar',
        icon: 'warehouse',
        module: 'dackhotell',
        match: ['/storage'],
        exclude: ['/storage/home'],
      },
    ],
  },
  VAROR_NAV,
  {
    title: 'Kunder',
    items: [
      { path: '/customers', label: 'Kunder', icon: 'groups' },
      { path: '/vehicles', label: 'Kundbilar', icon: 'directions_car' },
    ],
  },
  { title: 'Ekonomi', items: [FINANCE_NAV] },
];

/**
 * Halls ekonomi: egen översikt (vinst per bil, lager, moms på bilarna), medan Fakturor och Moms och
 * bokföring är samma sidor som i Axle, med Hall förvalt (`app-product-filter`); de är flikar på
 * sidan (`FinanceTabs`), inte en undermeny. Fakturanummer, moms
 * och bokföring gäller bolaget, inte en produkt.
 */
const HALL_FINANCE_NAV: NavItem = {
  path: '/dealership/finance',
  label: 'Ekonomi',
  icon: 'account_balance_wallet',
  module: 'bilhandel',
  adminOnly: true,
  match: ['/dealership/finance', '/finance', '/bookkeeping'],
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
      // Till salu, Inköpta och Sålda är undermenyn här; bilens kort hör också hit.
      {
        path: '/dealership/cars',
        label: 'Bilar',
        icon: 'directions_car',
        module: 'bilhandel',
        match: ['/dealership/cars'],
        children: [
          {
            path: '/dealership/cars/all',
            label: 'Alla',
            icon: 'directions_car',
            badge: 'none',
          },
          {
            path: '/dealership/cars',
            label: 'Till salu',
            icon: 'sell',
            exact: true,
            badge: 'cars-for-sale',
          },
          { path: '/dealership/cars/purchases', label: 'Inköpta', icon: 'shopping_cart' },
          { path: '/dealership/cars/sold', label: 'Sålda', icon: 'task_alt' },
        ],
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

/**
 * Bärgning (bärgning och vägassistans) är en egen produkt bredvid Verkstad och Bilhandel, för
 * verkstäder som kör ut och hämtar bilar. Än så länge bara uppdragen och kunderna.
 */
export const NAV_TOWING: NavSection[] = [
  {
    title: '',
    items: [{ path: '/towing/home', label: 'Hem', icon: 'home', exact: true, module: 'bargning' }],
  },
  {
    title: 'Bärgning',
    items: [
      {
        path: '/towing',
        label: 'Uppdrag',
        icon: 'local_shipping',
        module: 'bargning',
        match: ['/towing'],
        exclude: ['/towing/home'],
      },
    ],
  },
  { title: 'Kunder', items: [{ path: '/customers', label: 'Kunder', icon: 'groups' }] },
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
  { path: '/inventory', label: 'Lager', icon: 'inventory_2', match: ['/inventory', '/reports'] },
];

/** Mobilens flikar i Däck: hitta ett däckset, kolla lagret, ringa kunden. */
export const MOBILE_TABS_DACK: NavItem[] = [
  { path: '/storage/home', label: 'Hem', icon: 'home', exact: true, module: 'dackhotell' },
  {
    path: '/storage',
    label: 'Hotell',
    icon: 'warehouse',
    module: 'dackhotell',
    exclude: ['/storage/home'],
  },
  { path: '/inventory', label: 'Lager', icon: 'inventory_2', match: ['/inventory', '/reports'] },
  { path: '/customers', label: 'Kunder', icon: 'groups' },
];

/** "Mer" i Däck. */
export const MOBILE_MORE_DACK: NavItem[] = [
  { path: '/sales', label: 'Försäljning', icon: 'point_of_sale' },
  { path: '/purchases', label: 'Inköp', icon: 'shopping_cart_checkout' },
  {
    path: '/finance',
    label: 'Ekonomi',
    icon: 'account_balance_wallet',
    adminOnly: true,
    match: ['/finance', '/bookkeeping'],
  },
  {
    path: '/register',
    label: 'Register',
    icon: 'dataset',
    match: ['/register', '/article-types', '/warehouses', '/suppliers', '/activity'],
  },
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

/** Mobilens flikar i Bärgning: uppdragen och kunderna att ringa. */
export const MOBILE_TABS_TOWING: NavItem[] = [
  { path: '/towing/home', label: 'Hem', icon: 'home', exact: true, module: 'bargning' },
  {
    path: '/towing',
    label: 'Uppdrag',
    icon: 'local_shipping',
    module: 'bargning',
    exclude: ['/towing/home'],
  },
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
  { path: '/resources', label: 'Mekaniker och platser', icon: 'engineering' },
  { path: '/service-types', label: 'Åtgärder', icon: 'build' },
  {
    path: '/register',
    label: 'Register',
    icon: 'dataset',
    match: ['/register', '/article-types', '/warehouses', '/suppliers', '/activity'],
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
  /** Hopfällda sektionskort i sidomenyn (rubriken → sant = hopfälld). Valet sparas per webbläsare. */
  private readonly closedSections = signal<Record<string, boolean>>(this.storedSections());

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
    return this.navOf(this.product())
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
    this.auth.isMechanic() || !['axle', 'dack'].includes(this.product())
      ? []
      : FOOTER_NAV.filter((i) => this.visible(i, false)),
  );

  /** Mobilens flikar och "Mer". Mekanikern har bara sina order. */
  readonly tabs = computed<NavItem[]>(() =>
    this.auth.isMechanic()
      ? [{ path: '/workorders/mine', label: 'Order', icon: 'handyman' }]
      : this.tabsOf(this.product()).filter((i) => this.billing.allows(i.module)),
  );
  readonly more = computed<NavItem[]>(() =>
    this.auth.isMechanic() ? [] : this.moreOf(this.product()).filter((i) => this.visible(i, true)),
  );

  constructor() {
    const done$ = this.router.events.pipe(filter((e) => e instanceof NavigationEnd));
    done$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((e) => {
      const url = toInternal(e.urlAfterRedirects).split(/[?#]/)[0];
      this.url.set(url);
      const product = productOf(url);
      if (product && product !== this.product()) this.setProduct(product);
      // Kommer man in i en grupp (t.ex. via en länk på Hem) fälls den ut, även om man stängt den förut.
      for (const s of [...NAV_AXLE, ...NAV_DACK, ...NAV_HALL, ...NAV_TOWING]) {
        for (const i of s.items) {
          if (i.children && this.matches(i) && this.groups()[i.path] === false) {
            this.setGroup(i.path, true);
          }
        }
        // Kommer man in i en hopfälld sektion (en länk någon annanstans) fälls den ut.
        const here = s.items.some(
          (i) => this.matches(i) || i.children?.some((c) => this.matches(c)),
        );
        if (s.title && here && !this.isSectionOpen(s.title)) this.setSection(s.title, true);
      }
    });
    // Vad garaget får använda hämtas när garaget byts (banderollen gör det bara för vanliga användare).
    const garageId$ = toObservable(computed(() => this.auth.garage()?.id));
    garageId$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((id) => id && !this.auth.isSuperAdmin() && this.billing.refresh());
    // Siffrorna är ett anrop (`Todo`). Ett nytt garage hämtas direkt; vid sidbyte bara om listan är
    // gammal, och efter en ändring härifrån räknar `Todo` om själv.
    garageId$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((id) => id && this.todo.refresh());
    done$
      .pipe(debounceTime(400), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.todo.refreshIfStale());
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
    const stored = this.stored('garagestock.product');
    return stored === 'hall' || stored === 'dack' || stored === 'towing' ? stored : 'axle';
  }

  private navOf(p: Product): NavSection[] {
    return { axle: NAV_AXLE, dack: NAV_DACK, hall: NAV_HALL, towing: NAV_TOWING }[p];
  }

  private tabsOf(p: Product): NavItem[] {
    return {
      axle: MOBILE_TABS,
      dack: MOBILE_TABS_DACK,
      hall: MOBILE_TABS_HALL,
      towing: MOBILE_TABS_TOWING,
    }[p];
  }

  private moreOf(p: Product): NavItem[] {
    return { axle: MOBILE_MORE, dack: MOBILE_MORE_DACK, hall: MOBILE_MORE_HALL, towing: [] }[p];
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
  /** Sektionskortet är utfällt. Alla är det från början. */
  isSectionOpen(title: string): boolean {
    return !this.closedSections()[title];
  }

  toggleSection(title: string) {
    this.setSection(title, !this.isSectionOpen(title));
  }

  private setSection(title: string, open: boolean) {
    this.closedSections.update((c) => ({ ...c, [title]: !open }));
    try {
      localStorage.setItem('garagestock.navSections', JSON.stringify(this.closedSections()));
    } catch {
      /* sparas bara som bekvämlighet */
    }
  }

  private storedSections(): Record<string, boolean> {
    try {
      const raw = JSON.parse(this.stored('garagestock.navSections') ?? '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

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
    if (item.exclude?.some(hit)) return false;
    return (item.match ?? [item.path]).some(hit);
  }
}
