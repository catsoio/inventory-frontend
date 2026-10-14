import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { NavigationEnd, Router } from '@angular/router';
import { catchError, debounceTime, filter, merge, of } from 'rxjs';
import { InventoryApi } from '../../api/inventory-api';
import { StorageApi } from '../../api/storage-api';
import { Report, StorageSummary, Summary } from '../../models';
import { Auth } from '../../auth/auth';
import { PageTitle } from '../../page-title';
import { SettingsPage } from '../../../features/settings/settings';
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
    pages: ['dashboard', 'customers', 'vehicles', 'suppliers', 'resources', 'service-types'],
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
      { path: '/suppliers', label: 'Leverantörer', icon: 'local_shipping', exact: false },
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
        { path: '/sales', label: 'Försäljning', icon: 'point_of_sale', exact: false },
        { path: '/purchases', label: 'Inköp', icon: 'shopping_cart_checkout', exact: false },
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

const MOBILE: { path: string; label: string; icon: string; exact: boolean }[] = [
  { path: '/dashboard', label: 'Hem', icon: 'home', exact: true },
  { path: '/inventory', label: 'Lager', icon: 'inventory_2', exact: false },
  { path: '/storage', label: 'Hotell', icon: 'warehouse', exact: false },
  { path: '/sales', label: 'Sälj', icon: 'point_of_sale', exact: false },
  { path: '/bookings', label: 'Tider', icon: 'calendar_month', exact: false },
];

const today = () => new Date().toLocaleDateString('sv-SE');

@Component({
  selector: 'app-shell',
  standalone: false,
  host: { class: 'flex h-dvh flex-col bg-gray-50' },
  styles: `
    .hdr-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-ui);
      color: #fff;
      transition: background-color 0.15s;
    }
    .hdr-btn:hover {
      background: rgb(255 255 255 / 0.15);
    }
    .hdr-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 10px;
      border-radius: var(--radius-ui);
      font-size: 14px;
      font-weight: 500;
      line-height: 1;
      color: rgb(255 255 255 / 0.92);
      transition: background-color 0.15s;
    }
    .mtab.is-active {
      color: var(--mat-sys-primary);
      font-weight: 700;
    }
    .mtab.is-active .mpill {
      background: color-mix(in srgb, var(--mat-sys-primary) 16%, white);
    }
    .hdr-btn mat-icon,
    .hdr-chip mat-icon {
      flex: none;
    }
  `,
  template: `
    <header
      class="flex h-14 shrink-0 items-center gap-2 px-2 text-white transition-colors md:gap-3 md:px-4"
      [class]="auth.viewingOther() ? 'bg-amber-700' : 'bg-brand'"
    >
      <button
        type="button"
        class="hdr-btn md:!hidden"
        (click)="drawer.set(true)"
        aria-label="Öppna menyn"
      >
        <mat-icon>menu</mat-icon>
      </button>

      @if (auth.isSuperAdmin()) {
        <button
          type="button"
          class="hdr-chip hover:bg-white/15"
          [matMenuTriggerFor]="garageMenu"
          aria-label="Byt garage"
        >
          <mat-icon class="!h-5 !w-5 !text-[20px]">business</mat-icon>
          <span class="max-w-[14rem] truncate max-md:hidden">{{
            auth.garage()?.name ?? 'Däcklager'
          }}</span>
          <mat-icon class="!h-5 !w-5 !text-[20px] opacity-80">expand_more</mat-icon>
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
        <span class="hdr-chip max-md:hidden">
          <mat-icon class="!h-5 !w-5 !text-[20px]">business</mat-icon>
          <span class="max-w-[14rem] truncate">{{ auth.garage()?.name ?? 'Däcklager' }}</span>
        </span>
      }

      <span class="mx-1 h-6 w-px bg-white/25 max-md:hidden"></span>

      <span class="min-w-0 flex-1 truncate text-lg font-semibold md:hidden">{{
        pageName() ?? auth.garage()?.name ?? 'Däcklager'
      }}</span>
      <a routerLink="/customers" class="hdr-btn md:!hidden" aria-label="Kunder">
        <mat-icon>groups</mat-icon>
      </a>
      <a routerLink="/vehicles" class="hdr-btn md:!hidden" aria-label="Bilar">
        <mat-icon>directions_car</mat-icon>
      </a>
      <a routerLink="/service-types" class="hdr-btn md:!hidden" aria-label="Åtgärder">
        <mat-icon>build</mat-icon>
      </a>

      <nav
        class="flex h-full items-stretch gap-1 self-stretch max-md:hidden"
        aria-label="Avdelning"
      >
        @for (t of tabs; track t.id) {
          <a
            [routerLink]="t.home"
            class="relative flex flex-col items-center justify-center gap-0.5 px-3 whitespace-nowrap transition-colors md:flex-row md:gap-2 md:px-4"
            [attr.aria-label]="t.label"
            [class]="
              app() === t.id
                ? 'font-semibold text-white'
                : 'font-medium text-white/75 hover:bg-white/10 hover:text-white'
            "
            [attr.aria-current]="app() === t.id ? 'page' : null"
          >
            <mat-icon class="!h-6 !w-6 !text-[24px]">{{ t.icon }}</mat-icon>
            <span class="text-[11px] leading-none md:hidden">{{ t.short }}</span>
            <span class="hidden text-base leading-none md:inline">{{ t.label }}</span>
            @if (app() === t.id) {
              <span class="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-white"></span>
            }
          </a>
        }
      </nav>

      <span class="flex-1 max-md:hidden"></span>
      <span class="text-xs text-white/70 tabular-nums max-lg:hidden" title="Version"
        >v{{ version }}</span
      >
      <div class="hidden items-center gap-3 lg:flex">
        <span
          class="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-sm leading-none font-semibold uppercase"
          >{{ initial() }}</span
        >
        <div class="leading-tight">
          <div class="text-sm font-medium">{{ who() }}</div>
          <div class="text-xs text-white/80">
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
      <span class="mx-1 h-6 w-px bg-white/25 max-lg:hidden"></span>
      <button
        type="button"
        class="hdr-btn max-md:!hidden"
        matTooltip="Inställningar"
        aria-label="Inställningar"
        (click)="openSettings()"
      >
        <mat-icon>settings</mat-icon>
      </button>
      <button
        type="button"
        class="hdr-btn max-md:!hidden"
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
            <button
              type="button"
              class="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-gray-700"
              (click)="drawer.set(false); openSettings()"
            >
              <mat-icon>settings</mat-icon> Inställningar
            </button>
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

    <nav
      class="flex shrink-0 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_4px_rgba(0,0,0,0.06)] md:hidden"
      aria-label="Huvudmeny"
    >
      @for (l of mobileLinks; track l.path) {
        <a
          [routerLink]="l.path"
          routerLinkActive="is-active"
          [routerLinkActiveOptions]="{ exact: l.exact }"
          class="mtab flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-medium text-gray-600"
        >
          <span class="mpill grid h-8 w-16 place-items-center rounded-lg transition-colors">
            <mat-icon>{{ l.icon }}</mat-icon>
          </span>
          {{ l.label }}
        </a>
      }
    </nav>
  `,
})
export class Shell {
  protected readonly version = pkg.version;

  readonly auth = inject(Auth);
  /** Sidans namn i mobilens topp (garaget syns i menyn). */
  readonly pageName = inject(PageTitle).page;
  private readonly api = inject(InventoryApi);
  private readonly storage = inject(StorageApi);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
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

  openSettings() {
    this.dialog.open(SettingsPage, { width: '960px', maxWidth: '95vw', maxHeight: '90vh' });
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
  /** Mobilens bottenfält är alltid detsamma: det som används mest i verkstaden. */
  readonly mobileLinks = MOBILE;

  readonly initial = computed(() => this.who()[0] ?? '?');
  readonly who = computed(() => {
    const u = this.auth.user();
    return `${u?.name ?? u?.email ?? u?.phone ?? ''}`;
  });
}
