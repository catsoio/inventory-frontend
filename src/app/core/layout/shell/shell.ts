import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { catchError, debounceTime, filter, merge, of } from 'rxjs';
import { InventoryApi } from '../../api/inventory-api';
import { StorageApi } from '../../api/storage-api';
import { Report, StorageSummary, Summary } from '../../models';
import { Auth } from '../../auth/auth';
import { environment } from '../../../../environments/environment';
import pkg from '../../../../../package.json';

interface Badge {
  text: string;
  /** Pillens färger. */
  tone: string;
  /** Prick på ikonen när menyn är hopfälld. */
  dot: string;
  hint: string;
}

type AppId = 'overview' | 'stock' | 'booking' | 'workorder';

interface AppTab {
  id: AppId;
  label: string;
  /** Kort namn som ryms under ikonen på en smal skärm. */
  short: string;
  icon: string;
  /** Dit fliken leder. */
  home: string;
  /** Sidor som hör till fliken, första delen av adressen. */
  pages: string[];
  /** Dold tills funktionen är byggd. */
  hidden?: boolean;
}

const TABS: AppTab[] = [
  {
    id: 'overview',
    label: 'Hem',
    short: 'Hem',
    icon: 'home',
    home: '/dashboard',
    // Registren nås från Hem, så deras sidor hör hit.
    pages: ['dashboard', 'customers', 'vehicles', 'resources', 'service-types'],
  },
  {
    id: 'stock',
    label: 'Lager och däckhotell',
    short: 'Lager',
    icon: 'inventory_2',
    home: '/inventory',
    pages: ['inventory', 'storage', 'sales', 'purchases', 'reports', 'bookkeeping', 'settings'],
  },
  {
    id: 'booking',
    label: 'Tidsbokning',
    short: 'Tider',
    icon: 'calendar_month',
    home: '/bookings',
    pages: ['bookings'],
  },
  {
    id: 'workorder',
    label: 'Arbetsorder',
    short: 'Order',
    icon: 'assignment',
    home: '/workorders',
    pages: ['workorders'],
    hidden: !environment.workOrders,
  },
];

const appOf = (url: string): AppId => {
  const first = url.split(/[?#]/)[0].split('/')[1] ?? '';
  return TABS.find((t) => t.pages.includes(first))?.id ?? 'overview';
};

interface MenuLink {
  path: string;
  label: string;
  icon: string;
  exact: boolean;
  adminOnly?: boolean;
}
interface MenuGroup {
  title: string;
  links: MenuLink[];
}

/** Registren: kunder, bilar och det som bokningar och arbetsorder pekar på. Nås från Hem. */
const REGISTER_MENU: MenuGroup[] = [
  {
    title: 'Register',
    links: [
      { path: '/customers', label: 'Kunder', icon: 'groups', exact: false },
      { path: '/vehicles', label: 'Bilar', icon: 'directions_car', exact: false },
      { path: '/resources', label: 'Mekaniker och platser', icon: 'engineering', exact: false },
      { path: '/service-types', label: 'Åtgärder', icon: 'build', exact: false },
    ],
  },
];

/**
 * Sidomenyn per flik: en länk per tabell, till dess lista. "Ny …" ligger som knapp på själva
 * listan och kortet öppnas därifrån, så menyn visar bara var man kan gå.
 */
const MENUS: Record<AppId, MenuGroup[]> = {
  overview: [],
  stock: [
    {
      title: 'Lager',
      links: [{ path: '/inventory', label: 'Artiklar', icon: 'inventory_2', exact: false }],
    },
    {
      title: 'Däckhotell',
      links: [{ path: '/storage', label: 'Förvaring', icon: 'warehouse', exact: false }],
    },
    {
      title: 'Transaktioner',
      links: [
        { path: '/sales', label: 'Sälj', icon: 'point_of_sale', exact: true },
        { path: '/purchases', label: 'Inköp', icon: 'local_shipping', exact: true },
      ],
    },
    {
      title: 'Uppföljning',
      links: [
        { path: '/reports', label: 'Logg och rapport', icon: 'bar_chart', exact: true },
        {
          path: '/bookkeeping',
          label: 'Bokföring',
          icon: 'menu_book',
          exact: false,
          adminOnly: true,
        },
      ],
    },
  ],
  booking: [
    {
      title: 'Tidsbokning',
      links: [
        { path: '/bookings', label: 'Kalender', icon: 'calendar_month', exact: true },
        { path: '/bookings/list', label: 'Bokningslista', icon: 'view_list', exact: true },
      ],
    },
  ],
  workorder: [
    {
      title: 'Arbetsorder',
      links: [{ path: '/workorders', label: 'Arbetsorder', icon: 'assignment', exact: false }],
    },
  ],
};

/** Hem är startsidan till allt: menyn där samlar de andra flikarnas menyer. */
MENUS.overview = [
  ...MENUS.booking,
  ...REGISTER_MENU,
  ...MENUS.stock,
  ...(environment.workOrders ? MENUS.workorder : []),
];

const MOBILE: Record<AppId, { path: string; label: string; icon: string }[]> = {
  overview: [
    { path: '/bookings', label: 'Kalender', icon: 'calendar_month' },
    { path: '/customers', label: 'Kunder', icon: 'groups' },
    { path: '/inventory', label: 'Lager', icon: 'inventory_2' },
    { path: '/storage', label: 'Hotell', icon: 'warehouse' },
  ],
  stock: [
    { path: '/inventory', label: 'Lager', icon: 'inventory_2' },
    { path: '/storage', label: 'Hotell', icon: 'warehouse' },
    { path: '/sales', label: 'Sälj', icon: 'point_of_sale' },
    { path: '/purchases', label: 'Inköp', icon: 'local_shipping' },
    { path: '/reports', label: 'Rapport', icon: 'bar_chart' },
  ],
  booking: [
    { path: '/bookings', label: 'Kalender', icon: 'calendar_month' },
    { path: '/bookings/list', label: 'Lista', icon: 'view_list' },
  ],
  workorder: [{ path: '/workorders', label: 'Arbetsorder', icon: 'assignment' }],
};

const today = () => new Date().toLocaleDateString('sv-SE');

@Component({
  selector: 'app-shell',
  standalone: false,
  host: { class: 'flex h-dvh flex-col bg-gray-50' },
  template: `
    <header
      class="flex h-14 shrink-0 items-center gap-1 px-2 text-white transition-colors md:gap-4 md:px-4"
      [class]="auth.viewingOther() ? 'bg-amber-700' : 'bg-brand'"
    >
      <button
        mat-icon-button
        class="md:!hidden !text-white"
        (click)="drawer.set(true)"
        aria-label="Öppna menyn"
      >
        <mat-icon>menu</mat-icon>
      </button>
      @if (auth.isSuperAdmin()) {
        <button
          mat-button
          class="!text-lg !font-semibold !text-white"
          [matMenuTriggerFor]="garageMenu"
          aria-label="Byt garage"
        >
          <mat-icon class="md:!hidden">business</mat-icon>
          <span class="max-md:hidden">{{ auth.garage()?.name ?? 'Däcklager' }}</span>
          <mat-icon iconPositionEnd class="max-md:!hidden">arrow_drop_down</mat-icon>
        </button>
        <mat-menu #garageMenu="matMenu">
          <div class="px-4 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Alla garage ({{ auth.garages().length }})
          </div>
          @for (g of auth.garages(); track g.id) {
            <button mat-menu-item (click)="auth.switchGarage(g.id)">
              <mat-icon>{{ g.id === auth.garage()?.id ? 'check' : '' }}</mat-icon>
              <span>{{ g.name }}</span>
              <span class="ml-2 text-xs text-gray-500">
                {{ g.id === auth.ownGarage()?.id ? 'ditt garage · ' : '' }}{{ g.memberCount }} anv.
              </span>
            </button>
          }
        </mat-menu>
      } @else {
        <span class="text-lg font-semibold max-md:hidden">{{
          auth.garage()?.name ?? 'Däcklager'
        }}</span>
      }
      <nav
        class="flex h-full items-stretch gap-0 self-stretch md:ml-4 md:gap-1"
        aria-label="Avdelning"
      >
        @for (t of tabs; track t.id) {
          <a
            [routerLink]="t.home"
            class="relative flex flex-col items-center justify-center gap-0.5 px-3 text-sm whitespace-nowrap transition-colors md:flex-row md:gap-2 md:px-4"
            [attr.aria-label]="t.label"
            [class]="app() === t.id ? 'font-semibold text-white' : 'text-white/70 hover:text-white'"
            [attr.aria-current]="app() === t.id ? 'page' : null"
          >
            <mat-icon class="!h-5 !w-5 !text-xl">{{ t.icon }}</mat-icon>
            <span class="text-[10px] leading-none md:hidden">{{ t.short }}</span>
            <span class="hidden md:inline">{{ t.label }}</span>
            @if (app() === t.id) {
              <span class="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-white"></span>
            }
          </a>
        }
      </nav>
      <span class="flex-1"></span>
      <span class="text-xs text-white/60 tabular-nums max-lg:hidden" title="Version"
        >v{{ version }}</span
      >
      <div class="hidden items-center gap-3 lg:flex">
        <span
          class="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-sm font-semibold uppercase"
          >{{ initial() }}</span
        >
        <div class="leading-tight">
          <div class="text-sm font-medium">{{ who() }}</div>
          <div class="text-xs text-white/70">
            {{
              auth.isSuperAdmin()
                ? 'Superadmin'
                : auth.garage()?.role === 'owner'
                  ? 'Ägare'
                  : 'Personal'
            }}
          </div>
        </div>
      </div>
      <span class="mx-1 hidden h-6 w-px bg-white/25 lg:block"></span>
      <a
        mat-icon-button
        routerLink="/settings"
        class="!text-white hover:!bg-white/15 max-md:!hidden"
        matTooltip="Inställningar"
        aria-label="Inställningar"
        ><mat-icon>settings</mat-icon></a
      >
      <button
        mat-icon-button
        class="!text-white hover:!bg-white/15 max-md:!hidden"
        matTooltip="Logga ut"
        aria-label="Logga ut"
        (click)="auth.logout()"
      >
        <mat-icon>logout</mat-icon>
      </button>
    </header>

    @if (drawer()) {
      <div class="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Meny">
        <button
          type="button"
          class="absolute inset-0 bg-black/40"
          (click)="drawer.set(false)"
          aria-label="Stäng menyn"
        ></button>
        <aside
          class="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-xl"
        >
          <div
            class="flex items-center gap-3 px-4 py-4 text-white"
            [class]="auth.viewingOther() ? 'bg-amber-700' : 'bg-brand'"
          >
            <span
              class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 font-semibold uppercase"
              >{{ initial() }}</span
            >
            <div class="min-w-0 flex-1 leading-tight">
              <div class="truncate font-semibold">{{ auth.garage()?.name ?? 'Däcklager' }}</div>
              <div class="truncate text-xs text-white/80">
                {{ who() }} ·
                {{
                  auth.isSuperAdmin()
                    ? 'Superadmin'
                    : auth.garage()?.role === 'owner'
                      ? 'Ägare'
                      : 'Personal'
                }}
              </div>
            </div>
            <button
              mat-icon-button
              class="!text-white"
              (click)="drawer.set(false)"
              aria-label="Stäng menyn"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <nav class="flex flex-1 flex-col gap-1 p-3">
            @for (g of groups(); track g.title) {
              <div
                class="mt-3 px-3 text-xs font-semibold tracking-wide text-gray-500 uppercase first:mt-0"
              >
                {{ g.title }}
              </div>
              @for (l of g.links; track l.label) {
                <a
                  [routerLink]="l.path"
                  [routerLinkActiveOptions]="{ exact: !!l.exact }"
                  routerLinkActive="!bg-brand-soft !text-brand font-semibold"
                  class="flex items-center gap-3 rounded-lg px-3 py-3 text-gray-700"
                >
                  <mat-icon>{{ l.icon }}</mat-icon>
                  <span class="flex-1">{{ l.label }}</span>
                  @if (badges()[l.path]; as b) {
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="b.tone">{{
                      b.text
                    }}</span>
                  }
                </a>
              }
            }
          </nav>

          <div
            class="flex flex-col gap-1 border-t border-gray-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <a
              routerLink="/settings"
              class="flex items-center gap-3 rounded-lg px-3 py-3 text-gray-700"
              ><mat-icon>settings</mat-icon> Inställningar</a
            >
            <button
              type="button"
              class="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-gray-700"
              (click)="auth.logout()"
            >
              <mat-icon>logout</mat-icon> Logga ut
            </button>
            <span class="px-3 pt-1 text-xs text-gray-400">v{{ version }}</span>
          </div>
        </aside>
      </div>
    }

    <div class="flex min-h-0 flex-1">
      @if (groups().length) {
        <nav
          class="hidden shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto bg-white p-3 shadow-[1px_0_3px_rgba(0,0,0,0.04)] transition-[width] duration-200 md:flex"
          [class]="collapsed() ? 'w-[76px]' : 'w-60'"
        >
          <div
            class="mb-1 flex items-center"
            [class]="collapsed() ? 'justify-center' : 'justify-between pl-3'"
          >
            @if (!collapsed()) {
              <span class="text-xs font-semibold tracking-wide text-gray-400 uppercase">Meny</span>
            }
            <button
              mat-icon-button
              class="!text-gray-500"
              (click)="toggle()"
              [matTooltip]="collapsed() ? 'Visa menyn' : 'Dölj menyn'"
              matTooltipPosition="right"
              [attr.aria-label]="collapsed() ? 'Visa menyn' : 'Dölj menyn'"
              [attr.aria-expanded]="!collapsed()"
            >
              <mat-icon>{{ collapsed() ? 'menu' : 'menu_open' }}</mat-icon>
            </button>
          </div>

          @for (g of groups(); track g.title) {
            @if (collapsed()) {
              <div class="mx-3 my-2 h-px bg-gray-100 first:hidden"></div>
            } @else {
              <div
                class="mt-3 px-3 text-xs font-semibold tracking-wide text-gray-500 uppercase first:mt-0"
              >
                {{ g.title }}
              </div>
            }
            @for (l of g.links; track l.label) {
              <a
                [routerLink]="l.path"
                [routerLinkActiveOptions]="{ exact: !!l.exact }"
                routerLinkActive="!bg-brand-soft !text-brand font-semibold"
                class="flex items-center gap-3 rounded-lg px-3 py-2 whitespace-nowrap text-gray-700 hover:bg-gray-100"
                [class.justify-center]="collapsed()"
                [matTooltip]="
                  collapsed()
                    ? l.label + (badges()[l.path] ? ' – ' + badges()[l.path]!.hint : '')
                    : ''
                "
                matTooltipPosition="right"
                [attr.aria-label]="l.label"
              >
                <span class="relative inline-flex">
                  <mat-icon>{{ l.icon }}</mat-icon>
                  @if (collapsed() && badges()[l.path]; as b) {
                    <span
                      class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white"
                      [class]="b.dot"
                    ></span>
                  }
                </span>
                @if (!collapsed()) {
                  <span class="flex-1">{{ l.label }}</span>
                  @if (badges()[l.path]; as b) {
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-medium"
                      [class]="b.tone"
                      [attr.title]="b.hint"
                      >{{ b.text }}</span
                    >
                  }
                }
              </a>
            }
          }

          <a
            href="https://catso.io"
            target="_blank"
            rel="noopener"
            class="mt-auto flex items-center gap-3 rounded-lg px-3 pt-4 pb-1 text-gray-500 hover:text-gray-900"
            [class.justify-center]="collapsed()"
            [matTooltip]="collapsed() ? 'catso.io' : ''"
            matTooltipPosition="right"
            aria-label="Catso, catso.io"
          >
            <img src="catso-logo.png" alt="Catso" class="h-8 w-8 shrink-0 object-contain" />
            @if (!collapsed()) {
              <span class="leading-tight">
                <span class="block text-sm font-semibold tracking-tight text-gray-900">Catso</span>
                <span class="block text-xs">catso.io</span>
              </span>
            }
          </a>
        </nav>
      }

      <main class="min-w-0 flex-1 overflow-y-auto p-3 md:p-5 xl:p-6">
        <router-outlet />
      </main>
    </div>

    @if (mobileLinks().length) {
      <nav
        class="flex shrink-0 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_4px_rgba(0,0,0,0.06)] md:hidden"
      >
        @for (l of mobileLinks(); track l.path) {
          <a
            [routerLink]="l.path"
            routerLinkActive="text-brand font-semibold"
            class="flex flex-1 flex-col items-center py-2 text-xs"
          >
            <mat-icon>{{ l.icon }}</mat-icon
            >{{ l.label }}
          </a>
        }
      </nav>
    }
  `,
})
export class Shell {
  protected readonly version = pkg.version;

  readonly auth = inject(Auth);
  private readonly api = inject(InventoryApi);
  private readonly storage = inject(StorageApi);
  private readonly router = inject(Router);
  /** Flikarna i toppbalken. Arbetsorder tänds här när den är byggd. */
  readonly tabs = TABS.filter((t) => !t.hidden);
  /** Vilken flik sidan hör till, utifrån adressen. */
  readonly app = signal<AppId>(appOf(this.router.url));
  /** Menyn som glider in på mobilen. */
  readonly drawer = signal(false);
  private readonly stock = signal<Summary | null>(null);
  private readonly hotel = signal<StorageSummary | null>(null);
  private readonly soldToday = signal<Report | null>(null);

  /** Siffror bredvid menyvalen så att man ser läget utan att öppna sidan. */
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
    const r = this.soldToday();
    if (r && r.soldUnits > 0) {
      out['/sales'] = {
        text: `${r.soldUnits} idag`,
        tone: 'bg-green-100 text-green-800',
        dot: 'bg-green-500',
        hint: `${r.soldUnits} sålda enheter idag`,
      };
    }
    return out;
  });

  constructor() {
    // Uppdateras vid start och efter varje sidbyte (t.ex. efter en försäljning).
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((e) => {
        this.app.set(appOf(e.urlAfterRedirects));
        this.drawer.set(false);
      });
    merge(of(null), this.router.events.pipe(filter((e) => e instanceof NavigationEnd)))
      .pipe(debounceTime(400), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.refresh());
  }

  private refresh() {
    this.api
      .summary()
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.stock.set(x));
    this.storage
      .summary()
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.hotel.set(x));
    this.api
      .report(today(), today())
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.soldToday.set(x));
  }

  /** Hopfälld meny (bara ikoner); valet sparas per webbläsare. */
  readonly collapsed = signal(localStorage.getItem('garagestock.sidebar') === 'collapsed');

  toggle() {
    this.collapsed.update((c) => !c);
    localStorage.setItem('garagestock.sidebar', this.collapsed() ? 'collapsed' : 'open');
  }

  /** Sidomenyn för den flik som är öppen. */
  readonly groups = computed(() => {
    const admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
    return MENUS[this.app()].map((g) => ({
      ...g,
      links: g.links.filter((l) => !('adminOnly' in l && l.adminOnly) || admin),
    }));
  });
  readonly mobileLinks = computed(() => MOBILE[this.app()]);

  readonly initial = computed(() => this.who()[0] ?? '?');
  readonly who = computed(() => {
    const u = this.auth.user();
    return `${u?.name ?? u?.email ?? u?.phone ?? ''}`;
  });
}
