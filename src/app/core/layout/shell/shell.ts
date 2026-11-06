import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import {
  Component,
  HostListener,
  OnDestroy,
  effect,
  inject,
  untracked,
  computed,
} from '@angular/core';
import { AxleApi } from '../../api/axle-api';
import { Auth } from '../../auth/auth';
import { GARAGE_ROLE_LABELS } from '../../models';
import { Pricing } from '../../pricing';
import { Billing } from '../../billing/billing';
import { quickGroupsOf, type QuickAction } from '../../search/quick-actions';
import { GlobalSearch } from '../../search/global-search';
import { Settings } from '../../settings';
import { Todo } from '../../todo';
import { Nav } from '../nav';

/**
 * Skalet: topbar, sidomenyn på dator och flikfältet på mobil. På dator är sökningen alltid
 * en klick (eller `/`) bort; på mobil är den en ikon i topbaren och ett stort fält på Hem.
 */
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
  `,
  template: `
    <app-garage-menu #gm="garageMenu" />

    <!-- Överst (dator): loggan, Catso Garage med flikarna Axle och Hall, och garaget och kontot till höger. -->
    <nav
      class="hidden h-14 shrink-0 items-center gap-2 border-b border-white/15 bg-brand px-4 text-white md:flex"
      aria-label="Produkt"
    >
      <a
        [routerLink]="home()"
        class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white"
        aria-label="Hem"
      >
        <img src="catso-logo.png" alt="Catso" class="h-6 w-6 object-contain" />
      </a>
      <span class="mr-3 ml-1 text-[15px] font-semibold tracking-tight">Catso Garage</span>
      @if (!auth.isMechanic()) {
        <div class="flex items-center gap-1 rounded-xl bg-black/20 p-1">
          @for (p of products(); track p.id) {
            <a
              [routerLink]="p.link"
              class="product-tab flex h-9 items-center relative w-36 justify-center gap-2 rounded-lg px-6 text-sm font-medium transition-colors"
              [class]="
                nav.product() === p.id
                  ? 'bg-white/20 text-white'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              "
              [attr.aria-current]="nav.product() === p.id ? 'page' : null"
            >
              <mat-icon class="!h-5 !w-5 !text-[20px] !leading-5">{{ p.icon }}</mat-icon>
              {{ p.label }}
              @if (nav.product() !== p.id && waiting()[p.id]; as u) {
                <!-- Något väntar i den andra produkten: röd = brådskande, gul = väntar på dig. -->
                <span
                  class="absolute top-1.5 right-2 h-2.5 w-2.5 rounded-full ring-2 ring-white/40"
                  [class]="u === 'urgent' ? 'bg-red-400' : 'bg-amber-300'"
                  [matTooltip]="u === 'urgent' ? 'Något är försenat här' : 'Något väntar här'"
                  role="img"
                  [attr.aria-label]="u === 'urgent' ? 'Något är försenat' : 'Något väntar'"
                ></span>
              }
            </a>
          }
        </div>
      }
      <div class="min-w-0 flex-1"></div>
      @if (auth.isSuperAdmin()) {
        <button
          type="button"
          class="flex h-9 min-w-0 items-center gap-1 rounded-lg px-3 text-sm font-medium text-white/90 hover:bg-white/10"
          [matMenuTriggerFor]="gm.menu"
          aria-label="Byt garage"
        >
          <span class="truncate">{{ auth.companyName() || 'Catso Garage' }}</span>
          <mat-icon class="!h-5 !w-5 shrink-0 !text-[20px]">unfold_more</mat-icon>
        </button>
      } @else {
        <span class="truncate px-3 text-sm font-medium text-white/90">{{
          auth.companyName() || 'Catso Garage'
        }}</span>
      }
      <span class="mx-1 h-6 w-px bg-white/25" aria-hidden="true"></span>
      <span
        class="hdr-btn grid place-items-center text-white/80"
        [matTooltip]="who() + ' · ' + role()"
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
        class="hdr-btn grid place-items-center"
        matTooltip="Logga ut"
        aria-label="Logga ut"
        (click)="auth.logout()"
      >
        <mat-icon>logout</mat-icon>
      </button>
    </nav>

    <header class="flex h-14 shrink-0 items-center bg-brand text-white shadow-sm">
      <div class="flex min-w-0 flex-1 items-center gap-2 pr-2 pl-4 md:gap-3 md:px-6">
        <!-- Mobil: produktbytet sitter i toppen, eftersom produktfältet bara finns på dator. -->
        @if (!auth.isMechanic() && products().length > 1) {
          <div
            class="flex shrink-0 rounded-xl bg-black/15 p-0.5 md:hidden"
            role="tablist"
            aria-label="Produkt"
          >
            @for (p of products(); track p.id) {
              <a
                [routerLink]="p.link"
                role="tab"
                class="relative flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold transition-colors"
                [class]="
                  nav.product() === p.id
                    ? 'bg-white text-brand'
                    : 'text-white/85 active:bg-white/15'
                "
                [attr.aria-selected]="nav.product() === p.id"
              >
                <mat-icon class="!h-[18px] !w-[18px] !text-[18px] !leading-[18px]">{{
                  p.icon
                }}</mat-icon>
                {{ p.label }}
                @if (nav.product() !== p.id && waiting()[p.id]; as u) {
                  <span
                    class="absolute top-1 right-1 h-2 w-2 rounded-full"
                    [class]="u === 'urgent' ? 'bg-red-400' : 'bg-amber-300'"
                  ></span>
                }
              </a>
            }
          </div>
        }
        <div class="min-w-0 flex-1"></div>

        <app-billing-banner />

        @if (!auth.isMechanic()) {
          <!-- Genvägar för att skapa något (dator), i grupper som sidomenyns avsnitt: samma som under sökrutan. -->
          <div class="hidden items-center gap-2 lg:flex xl:gap-3">
            @for (g of quickGroups(); track g.title) {
              <div class="flex items-center gap-1" role="group" [attr.aria-label]="g.title">
                @for (a of g.actions; track a.label) {
                  <button
                    type="button"
                    class="flex h-10 items-center gap-2 rounded-xl px-2.5 text-sm font-medium text-white/90 transition-colors bg-white/10 hover:bg-white/20 xl:px-3"
                    [matTooltip]="a.label"
                    [attr.aria-label]="a.label"
                    (click)="run(a)"
                  >
                    <mat-icon class="!h-5 !w-5 shrink-0 !text-xl !leading-5">{{ a.icon }}</mat-icon>
                    <span class="leading-5 max-2xl:hidden">{{ a.label }}</span>
                  </button>
                }
              </div>
              @if (!$last) {
                <span class="h-6 w-px bg-white/30" aria-hidden="true"></span>
              }
            }
          </div>
          <!-- Dator: ett fält att klicka i; mobil: bara en ikon. -->
          <button
            type="button"
            class="hidden h-10 w-[26rem] max-w-full order-first items-center gap-2 rounded-xl bg-white/15 px-3 text-left text-sm text-white/90 transition-colors hover:bg-white/25 lg:flex xl:w-96"
            (click)="search.open()"
            aria-label="Sök"
          >
            <mat-icon class="!h-5 !w-5 !text-xl opacity-90">search</mat-icon>
            <span class="min-w-0 flex-1 truncate">{{
              nav.product() === 'hall'
                ? 'Sök regnr, bil eller kund…'
                : 'Sök regnr, kund eller plats…'
            }}</span>
            <kbd class="rounded bg-white/20 px-1.5 py-0.5 text-xs">/</kbd>
          </button>
          <button
            type="button"
            class="hdr-btn grid place-items-center lg:hidden"
            (click)="search.open()"
            aria-label="Sök"
          >
            <mat-icon>search</mat-icon>
          </button>
        }
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <app-sidebar />
      <div class="flex min-w-0 flex-1 flex-col">
        <main class="relative z-0 min-h-0 min-w-0 flex-1 overflow-y-auto p-3 md:p-5 xl:p-6">
          <router-outlet />
        </main>
        <app-mobile-nav />
      </div>
    </div>
  `,
})
export class Shell implements OnDestroy {
  readonly auth = inject(Auth);
  readonly nav = inject(Nav);
  readonly search = inject(GlobalSearch);
  private readonly billing = inject(Billing);
  private readonly todo = inject(Todo);
  /** Det mest brådskande som väntar i varje produkt, för pricken på produktfliken. */
  readonly waiting = this.todo.urgencyOf;
  /** Genvägarna, bara för det garaget har påslaget. */
  readonly quickGroups = computed(() =>
    quickGroupsOf(this.nav.product())
      .map((g) => ({
        ...g,
        actions: g.actions.filter((a) => this.billing.allows(a.module)),
      }))
      .filter((g) => g.actions.length),
  );
  /** Produkterna man kan växla mellan; Hall bara när garaget har bilhandel. */
  readonly products = computed(() =>
    [
      { id: 'axle' as const, label: 'Axle', icon: 'build', link: '/dashboard' },
      { id: 'hall' as const, label: 'Hall', icon: 'directions_car', link: '/dealership' },
    ].filter((p) => p.id === 'axle' || this.billing.allows('bilhandel')),
  );
  /** Startsidan i produkten man är i. */
  readonly home = computed(() => (this.nav.product() === 'hall' ? '/dealership' : '/dashboard'));
  run(a: QuickAction) {
    if (a.go) void this.router.navigate(a.go);
    else {
      // Dialogen laddas först när den behövs, så att den inte väger i första paketet.
      void import('../../../shared/booking-dialog/open-booking').then((m) =>
        m.openBooking(this.dialog, null).subscribe(),
      );
    }
  }
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  openSettings(tab?: string): void {
    void import('../../../features/settings/settings').then((m) =>
      m.openSettings(this.dialog, tab),
    );
  }
  private readonly api = inject(AxleApi);

  constructor() {
    // Produkten färgar appen (Hall är blå, Axle är teal). Attributet sitter på <html> eftersom
    // dialoger och menyer ritas utanför skalet.
    effect(() => {
      document.documentElement.dataset['product'] = this.nav.product();
    });
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
    // Stripe skickar ägaren tillbaka hit efter registreringen (`/?payments=return`): visa Betalningar.
    if (new URLSearchParams(window.location.search).has('payments')) {
      history.replaceState(null, '', window.location.pathname + window.location.hash);
      queueMicrotask(() => this.openSettings('betalningar'));
    }
    // Prissättningen gäller bolaget man är i (ägare och personal; mekaniker har ingen åtkomst).
    const pricing = inject(Pricing);
    effect(() => {
      const id = this.auth.garage()?.id;
      if (id && !this.auth.isMechanic()) untracked(() => pricing.load());
    });
  }

  ngOnDestroy(): void {
    delete document.documentElement.dataset['product'];
  }

  who(): string {
    const u = this.auth.user();
    return `${u?.name ?? u?.email ?? u?.phone ?? ''}`;
  }

  role(): string {
    return this.auth.isSuperAdmin()
      ? 'Superadmin'
      : GARAGE_ROLE_LABELS[this.auth.garage()?.role ?? 'staff'];
  }

  /** `/` eller Ctrl/Cmd+K öppnar sökningen, om man inte redan skriver i ett fält. */
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
    if (
      (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) ||
      (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))
    ) {
      e.preventDefault();
      this.search.open();
    }
  }
}
