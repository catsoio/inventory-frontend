import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { NavigationEnd, Router } from '@angular/router';
import { catchError, debounceTime, filter, merge, of } from 'rxjs';
import { InventoryApi } from '../../api/inventory-api';
import { StorageApi } from '../../api/storage-api';
import { SalesCardApi } from '../../api/sales-card-api';
import { WorkOrderApi } from '../../api/work-order-api';
import { GARAGE_ROLE_LABELS, Report, StorageSummary, Summary } from '../../models';
import { Auth } from '../../auth/auth';
import { PageTitle } from '../../page-title';
import { Settings } from '../../settings';
import { SettingsPage } from '../../../features/settings/settings';
import { environment } from '../../../../environments/environment';

interface Badge {
  text: string;
  /** Pillens färger. */
  tone: string;
  /** Prick på ikonen när menyn är hopfälld. */
  dot: string;
  hint: string;
}

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
  adminOnly?: boolean;
  /** Dold tills funktionen är påslagen. */
  hidden?: boolean;
  /** Visas bara på dator eller bara på mobil. */
  only?: 'desktop' | 'mobile';
  /** Markeras också när någon av dessa adresser är öppen. */
  match?: string[];
  /** Markeras inte när någon av dessa adresser är öppen (de har en egen länk). */
  except?: string[];
  /** Undermeny: föräldern fälls ut och markeras när en av barnen är öppen. */
  children?: NavItem[];
}
interface NavSection {
  title: string;
  items: NavItem[];
}

/** En enda meny för hela appen, grupperad efter hur verkstaden arbetar. */
const NAV: NavSection[] = [
  {
    title: '',
    items: [{ path: '/dashboard', label: 'Hem', icon: 'home', exact: true }],
  },
  {
    title: 'Schema',
    items: [
      { path: '/bookings', label: 'Tidsbokning', icon: 'calendar_month' },
      {
        path: '/workorders',
        label: 'Arbetsorder',
        icon: 'handyman',
        hidden: !environment.workOrders,
      },
    ],
  },
  {
    title: 'Kunder',
    items: [
      { path: '/customers', label: 'Kunder', icon: 'groups' },
      { path: '/vehicles', label: 'Bilar', icon: 'directions_car' },
      {
        path: '/finance/invoices',
        label: 'Fakturor',
        icon: 'receipt_long',
        adminOnly: true,
      },
    ],
  },
  {
    title: 'Lager',
    items: [
      { path: '/inventory', label: 'Artiklar', icon: 'inventory_2' },
      { path: '/purchases', label: 'Inköp', icon: 'shopping_cart_checkout' },
      { path: '/sales', label: 'Försäljning', icon: 'point_of_sale' },
      { path: '/suppliers', label: 'Leverantörer', icon: 'local_shipping' },
    ],
  },
  {
    title: 'Förvaring',
    items: [{ path: '/storage', label: 'Däckhotell', icon: 'warehouse' }],
  },
  {
    title: 'Register',
    items: [
      { path: '/resources', label: 'Mekaniker och platser', icon: 'engineering' },
      { path: '/service-types', label: 'Åtgärder', icon: 'build' },
    ],
  },
  {
    title: 'Uppföljning',
    items: [
      {
        path: '/finance',
        label: 'Ekonomi',
        icon: 'account_balance_wallet',
        adminOnly: true,
        only: 'desktop',
        match: ['/finance', '/bookkeeping'],
        except: ['/finance/invoices'],
      },
      { path: '/reports', label: 'Logg och rapport', icon: 'bar_chart', exact: true },
      {
        path: '/bookkeeping',
        label: 'Bokföring',
        icon: 'menu_book',
        adminOnly: true,
        only: 'mobile',
      },
      { path: '/activity', label: 'Aktivitetslogg', icon: 'history', adminOnly: true },
    ],
  },
];

const MECHANIC_NAV: NavSection[] = [
  { title: '', items: [{ path: '/workorders/mine', label: 'Mina order', icon: 'handyman' }] },
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
      width: 40px;
      height: 40px;
      border-radius: 10px;
      color: #fff;
      transition: background-color 0.15s;
    }
    .hdr-btn:hover {
      background: rgb(255 255 255 / 0.18);
    }
    .nav-link {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 40px;
      padding: 0 12px;
      border-radius: 10px;
      font-size: 14.5px;
      font-weight: 500;
      white-space: nowrap;
      color: #374151;
      transition:
        background-color 0.15s,
        color 0.15s;
    }
    .nav-link:hover {
      background: #f3f4f6;
    }
    .nav-link mat-icon {
      flex: none;
      color: #6b7280;
    }
    .nav-link.is-active,
    .nav-link.is-parent {
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
    .nav-link.is-active {
      background: var(--color-brand-soft);
    }
    .nav-link.is-active mat-icon,
    .nav-link.is-parent mat-icon {
      color: var(--mat-sys-primary);
    }
    .nav-link.is-active::before {
      content: '';
      position: absolute;
      left: -12px;
      top: 8px;
      bottom: 8px;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: var(--mat-sys-primary);
    }
    .nav-sub {
      min-height: 36px;
      padding-left: 12px;
      font-size: 14px;
    }
    .nav-sub::after {
      content: none;
    }
    .nav-tree {
      margin: 2px 0 4px 21px;
      padding-left: 10px;
      border-left: 1px solid #e5e7eb;
    }
    .nav-title {
      margin: 18px 0 4px;
      padding: 0 12px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #9ca3af;
    }
    .mtab.is-active {
      color: var(--mat-sys-primary);
      font-weight: 700;
    }
    .mtab.is-active .mpill {
      background: color-mix(in srgb, var(--mat-sys-primary) 16%, white);
    }
  `,
  template: `
    <ng-template #items let-sections let-c="collapsed">
      @for (sec of sections; track sec.title) {
        @if (sec.title) {
          @if (c) {
            <div class="mx-3 my-3 h-px bg-gray-100"></div>
          } @else {
            <div class="nav-title">{{ sec.title }}</div>
          }
        }
        @for (l of sec.items; track l.path) {
          @if (l.children && !c) {
            <button
              type="button"
              class="nav-link w-full text-left"
              [class.is-parent]="isUnder(l)"
              (click)="toggleGroup(l.path)"
              [attr.aria-expanded]="isOpen(l)"
            >
              <mat-icon>{{ l.icon }}</mat-icon>
              <span class="flex-1">{{ l.label }}</span>
              <mat-icon
                class="!h-5 !w-5 !text-[20px] transition-transform"
                [class.rotate-180]="isOpen(l)"
                >expand_more</mat-icon
              >
            </button>
            @if (isOpen(l)) {
              <div class="nav-tree">
                @for (ch of l.children; track ch.path) {
                  <a
                    [routerLink]="ch.path"
                    [routerLinkActiveOptions]="{ exact: !!ch.exact }"
                    routerLinkActive="is-active"
                    class="nav-link nav-sub"
                  >
                    <span class="flex-1">{{ ch.label }}</span>
                  </a>
                }
              </div>
            }
          } @else {
            <a
              [routerLink]="l.children ? l.children[0].path : l.path"
              [routerLinkActiveOptions]="{ exact: !!l.exact }"
              [routerLinkActive]="l.children || l.match ? '' : 'is-active'"
              [class.is-active]="!!l.match && matches(l)"
              class="nav-link"
              [class.is-parent]="l.children && isUnder(l)"
              [class.justify-center]="c"
              [class.!px-0]="c"
              [matTooltip]="
                c ? l.label + (badges()[l.path] ? ' – ' + badges()[l.path]!.hint : '') : ''
              "
              matTooltipPosition="right"
              [attr.aria-label]="l.label"
            >
              <span class="relative inline-flex">
                <mat-icon>{{ l.icon }}</mat-icon>
                @if (c && badges()[l.path]; as b) {
                  <span
                    class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white"
                    [class]="b.dot"
                  ></span>
                }
              </span>
              @if (!c) {
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
      }
    </ng-template>

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

    <!-- Mobilens meny -->
    @if (drawer()) {
      <div
        class="fixed inset-0 z-[1000] md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Meny"
      >
        <button
          type="button"
          class="absolute inset-0 bg-black/40"
          (click)="drawer.set(false)"
          aria-label="Stäng menyn"
        ></button>
        <aside class="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
          <div
            class="flex items-center gap-3 px-4 py-4 text-white"
            [class]="auth.viewingOther() ? 'bg-amber-700' : 'bg-brand'"
          >
            <span
              class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 font-semibold uppercase"
              >{{ initial() }}</span
            >
            <div class="min-w-0 flex-1 leading-tight">
              <div class="truncate text-sm font-semibold">
                {{ (auth.companyName() || 'Däcklager') }}
              </div>
              <div class="truncate text-xs text-white/80">
                {{ who() }} ·
                {{
                  auth.isSuperAdmin() ? 'Superadmin' : roleLabels[auth.garage()?.role ?? 'staff']
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

          @if (auth.isSuperAdmin()) {
            <button
              type="button"
              class="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm"
              [matMenuTriggerFor]="garageMenu"
            >
              <mat-icon>business</mat-icon>
              <span class="flex-1">Byt garage</span>
              <mat-icon>unfold_more</mat-icon>
            </button>
          }

          <nav class="flex-1 overflow-y-auto p-3">
            <ng-container
              *ngTemplateOutlet="items; context: { $implicit: mobileSections(), collapsed: false }"
            />
          </nav>

          <div
            class="flex flex-col gap-1 border-t border-gray-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <button type="button" class="nav-link" (click)="drawer.set(false); openSettings()">
              <mat-icon>settings</mat-icon> Inställningar
            </button>
            <button type="button" class="nav-link" (click)="auth.logout()">
              <mat-icon>logout</mat-icon> Logga ut
            </button>
          </div>
        </aside>
      </div>
    }

    <header
      class="flex h-14 shrink-0 items-center text-white shadow-sm"
      [class]="auth.viewingOther() ? 'bg-amber-700' : 'bg-brand'"
    >
      <!-- Loggan och garaget, lika brett som sidomenyn under. -->
      <div
        class="hidden h-full shrink-0 items-center gap-2 px-3 transition-[width] duration-200 md:flex"
        [class]="collapsed() ? 'w-[72px] justify-center' : 'w-64'"
      >
        <a routerLink="/dashboard" class="shrink-0 rounded-lg bg-white p-1" aria-label="Hem">
          <img src="catso-logo.png" alt="Catso" class="h-7 w-7 object-contain" />
        </a>
        @if (!collapsed()) {
          @if (auth.isSuperAdmin()) {
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-1 rounded-lg px-2 py-1 text-left hover:bg-white/15"
              [matMenuTriggerFor]="garageMenu"
              aria-label="Byt garage"
            >
              <span class="truncate text-sm font-semibold">{{
                (auth.companyName() || 'Däcklager')
              }}</span>
              <mat-icon class="!h-5 !w-5 shrink-0 !text-[20px] opacity-80">unfold_more</mat-icon>
            </button>
          } @else {
            <a routerLink="/dashboard" class="min-w-0 flex-1 truncate text-sm font-semibold">{{
              (auth.companyName() || 'Däcklager')
            }}</a>
          }
        }
      </div>

      <div class="flex min-w-0 flex-1 items-center gap-2 px-2 md:gap-3 md:px-6">
        <button
          type="button"
          class="hdr-btn grid place-items-center md:hidden"
          (click)="drawer.set(true)"
          aria-label="Öppna menyn"
        >
          <mat-icon>menu</mat-icon>
        </button>

        <h1 class="min-w-0 flex-1 truncate text-lg font-semibold">{{ pageName() ?? '' }}</h1>

        <app-billing-banner />

        @for (q of quick; track q.path) {
          <a
            [routerLink]="q.path"
            class="hdr-btn grid place-items-center md:hidden"
            [attr.aria-label]="q.label"
          >
            <mat-icon>{{ q.icon }}</mat-icon>
          </a>
        }

        <span
          class="grid h-10 w-10 place-items-center text-white/80 max-md:hidden"
          [matTooltip]="
            who() +
            ' · ' +
            (auth.isSuperAdmin() ? 'Superadmin' : roleLabels[auth.garage()?.role ?? 'staff'])
          "
        >
          <mat-icon>person</mat-icon>
        </span>
        <button
          type="button"
          class="hdr-btn grid place-items-center"
          matTooltip="Inställningar"
          aria-label="Inställningar"
          (click)="openSettings()"
        >
          <mat-icon>settings</mat-icon>
        </button>
        <button
          type="button"
          class="hdr-btn grid place-items-center max-md:hidden"
          matTooltip="Logga ut"
          aria-label="Logga ut"
          (click)="auth.logout()"
        >
          <mat-icon>logout</mat-icon>
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <!-- Sidomenyn (dator) -->
      <aside
        class="hidden shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-200 md:flex"
        [class]="collapsed() ? 'w-[72px]' : 'w-64'"
      >
        <nav class="flex-1 overflow-x-hidden overflow-y-auto p-3" aria-label="Huvudmeny">
          <ng-container
            *ngTemplateOutlet="items; context: { $implicit: sections(), collapsed: collapsed() }"
          />
        </nav>

        <div class="border-t border-gray-100 p-3" [class.text-center]="collapsed()">
          <button
            type="button"
            class="nav-link w-full"
            [class.justify-center]="collapsed()"
            [class.!px-0]="collapsed()"
            (click)="toggle()"
            [matTooltip]="collapsed() ? 'Visa menyn' : ''"
            matTooltipPosition="right"
            [attr.aria-label]="collapsed() ? 'Visa menyn' : 'Dölj menyn'"
            [attr.aria-expanded]="!collapsed()"
          >
            <mat-icon>{{
              collapsed() ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'
            }}</mat-icon>
            @if (!collapsed()) {
              <span>Dölj menyn</span>
            }
          </button>
        </div>
      </aside>
      <div class="flex min-w-0 flex-1 flex-col">
        <main class="relative z-0 min-h-0 min-w-0 flex-1 overflow-y-auto p-3 md:p-5 xl:p-6">
          <router-outlet />
        </main>

        <nav
          class="flex shrink-0 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_4px_rgba(0,0,0,0.06)] md:hidden"
          aria-label="Genvägar"
        >
          @for (l of mobileLinks(); track l.path) {
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
      </div>
    </div>
  `,
})
export class Shell {
  readonly auth = inject(Auth);
  readonly roleLabels = GARAGE_ROLE_LABELS;
  /** Sidans namn i topbaren. */
  readonly pageName = inject(PageTitle).page;
  private readonly api = inject(InventoryApi);
  private readonly storage = inject(StorageApi);
  private readonly orders = inject(WorkOrderApi);
  private readonly cards = inject(SalesCardApi);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  /** Menyn som glider in på mobilen. */
  readonly drawer = signal(false);
  /** Genvägar i mobilens topbar (registren som används mest). */
  readonly quick = this.auth.isMechanic()
    ? []
    : [
        { path: '/customers', label: 'Kunder', icon: 'groups' },
        { path: '/vehicles', label: 'Bilar', icon: 'directions_car' },
      ];
  /** Nuvarande adress (utan query), för att veta vilken grupp som ska vara öppen. */
  private readonly url = signal(this.router.url.split(/[?#]/)[0]);
  /** Grupper användaren själv fällt ut eller in; annars styr aktuell sida. */
  private readonly toggled = signal<Record<string, boolean>>({});
  private readonly stock = signal<Summary | null>(null);
  private readonly hotel = signal<StorageSummary | null>(null);
  private readonly soldToday = signal<Report | null>(null);
  /** Antal nya order, order med del som saknas, utkast på säljkort och obetalda fakturor. */
  private readonly openOrders = signal(0);
  private readonly missingOrders = signal(0);
  private readonly draftCards = signal(0);
  private readonly unpaidInvoices = signal(0);

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
      out['/finance/invoices'] = {
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

  constructor() {
    // Bolagsnamnet överst följer Fakturauppgifter för det bolag man är i.
    effect(() => {
      const id = this.auth.garage()?.id;
      this.auth.sellerName.set('');
      if (id && this.auth.isAdmin()) {
        this.api.seller().subscribe({
          next: (s) => this.auth.sellerName.set(s.name),
          error: () => {},
        });
      }
    });
    inject(Settings).loadCompany();
    // Uppdateras vid start och efter varje sidbyte (t.ex. efter en försäljning).
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((e) => {
        this.url.set(e.urlAfterRedirects.split(/[?#]/)[0]);
        this.drawer.set(false);
      });
    merge(of(null), this.router.events.pipe(filter((e) => e instanceof NavigationEnd)))
      .pipe(debounceTime(400), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.refresh());
  }

  openSettings() {
    this.dialog.open(SettingsPage, {
      width: '1040px',
      height: '720px',
      maxWidth: '96vw',
      maxHeight: '92vh',
      panelClass: 'dialog-sheet',
    });
  }

  private refresh() {
    // Mekanikern har inga lager- eller hotellsiffror att visa (och skulle få 403).
    if (this.auth.isMechanic()) return;
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
    if (!this.auth.isAdmin() && !this.auth.isSuperAdmin()) return;
    this.api
      .report(today(), today())
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.soldToday.set(x));
    this.cards
      .list({ status: 'posted', paid: false, limit: 1 })
      .pipe(catchError(() => of(null)))
      .subscribe((x) => this.unpaidInvoices.set(x?.pagination.total ?? 0));
  }

  /** Hopfälld meny (bara ikoner); valet sparas per webbläsare. */
  readonly collapsed = signal(localStorage.getItem('garagestock.sidebar') === 'collapsed');

  toggle() {
    this.collapsed.update((c) => !c);
    localStorage.setItem('garagestock.sidebar', this.collapsed() ? 'collapsed' : 'open');
  }

  /** Sidan ligger under gruppen (någon av dess undersidor är öppen). */
  isUnder(item: NavItem): boolean {
    const u = this.url();
    return (item.match ?? [item.path]).some((p) => u === p || u.startsWith(p + '/'));
  }

  isOpen(item: NavItem): boolean {
    return this.toggled()[item.path] ?? this.isUnder(item);
  }

  toggleGroup(path: string) {
    const item = this.sections()
      .flatMap((s) => s.items)
      .find((i) => i.path === path);
    if (!item) return;
    this.toggled.update((t) => ({ ...t, [path]: !this.isOpen(item) }));
  }

  /** Menyn för en bredd: filtrerad efter roll, påslagna funktioner och dator/mobil. */
  private menu(mobile: boolean): NavSection[] {
    if (this.auth.isMechanic()) return MECHANIC_NAV;
    const admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
    return NAV.map((s) => ({
      ...s,
      items: s.items.filter(
        (i) =>
          !i.hidden &&
          (!i.adminOnly || admin) &&
          (!i.only || i.only === (mobile ? 'mobile' : 'desktop')),
      ),
    })).filter((s) => s.items.length);
  }
  readonly sections = computed<NavSection[]>(() => this.menu(false));
  readonly mobileSections = computed<NavSection[]>(() => this.menu(true));

  /** Någon av länkens adresser är öppen (t.ex. Ekonomi över flera sidor). */
  matches(item: NavItem): boolean {
    const u = this.url();
    const hit = (p: string) => u === p || u.startsWith(p + '/');
    return !!item.match?.some(hit) && !item.except?.some(hit);
  }

  /** Mobilens bottenfält är alltid detsamma: det som används mest i verkstaden. */
  /** Mekanikern har bara sina arbetsorder i bottenmenyn. */
  readonly mobileLinks = computed(() =>
    this.auth.isMechanic()
      ? [{ path: '/workorders/mine', label: 'Order', icon: 'handyman', exact: false }]
      : MOBILE,
  );

  readonly initial = computed(() => this.who()[0] ?? '?');
  readonly who = computed(() => {
    const u = this.auth.user();
    return `${u?.name ?? u?.email ?? u?.phone ?? ''}`;
  });
}
