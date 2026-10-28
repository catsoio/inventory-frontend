import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Component, HostListener, effect, inject, untracked } from '@angular/core';
import { InventoryApi } from '../../api/inventory-api';
import { Auth } from '../../auth/auth';
import { GARAGE_ROLE_LABELS } from '../../models';
import { PageTitle } from '../../page-title';
import { Pricing } from '../../pricing';
import { QUICK_GROUPS, type QuickAction } from '../../search/quick-actions';
import { GlobalSearch } from '../../search/global-search';
import { Settings } from '../../settings';
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

    <header
      class="flex h-14 shrink-0 items-center text-white shadow-sm"
      [class]="auth.viewingOther() ? 'bg-amber-700' : 'bg-brand'"
    >
      <!-- Loggan och garaget, lika brett som sidomenyn under (288 px: ett långt bolagsnamn ska få plats). -->
      <div
        class="hidden h-full shrink-0 items-center gap-2 px-3 transition-[width] duration-200 md:flex"
        [class]="nav.collapsed() ? 'w-[72px] justify-center' : 'w-72'"
      >
        <a routerLink="/dashboard" class="shrink-0 rounded-lg bg-white p-1" aria-label="Hem">
          <img src="catso-logo.png" alt="Catso" class="h-7 w-7 object-contain" />
        </a>
        @if (!nav.collapsed()) {
          @if (auth.isSuperAdmin()) {
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-1 rounded-lg px-2 py-1 text-left hover:bg-white/15"
              [matMenuTriggerFor]="gm.menu"
              aria-label="Byt garage"
            >
              <span class="truncate text-sm font-semibold">{{
                auth.companyName() || 'Däcklager'
              }}</span>
              <mat-icon class="!h-5 !w-5 shrink-0 !text-[20px] opacity-80">unfold_more</mat-icon>
            </button>
          } @else {
            <a routerLink="/dashboard" class="min-w-0 flex-1 truncate text-sm font-semibold">{{
              auth.companyName() || 'Däcklager'
            }}</a>
          }
        }
      </div>

      <div class="flex min-w-0 flex-1 items-center gap-2 pr-2 pl-4 md:gap-3 md:px-6">
        <h1 class="min-w-0 flex-1 truncate text-lg font-semibold">{{ pageName() ?? '' }}</h1>

        <app-billing-banner />

        @if (!auth.isMechanic()) {
          <!-- Genvägar för att skapa något (dator), i grupper som sidomenyns avsnitt: samma som under sökrutan. -->
          <div class="hidden items-center gap-2 lg:flex xl:gap-3">
            @for (g of quickGroups; track g.title) {
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
            class="hidden h-10 w-72 items-center gap-2 rounded-xl bg-white/15 px-3 text-left text-sm text-white/90 transition-colors hover:bg-white/25 lg:flex xl:w-96"
            (click)="search.open()"
            aria-label="Sök"
          >
            <mat-icon class="!h-5 !w-5 !text-xl opacity-90">search</mat-icon>
            <span class="min-w-0 flex-1 truncate">Sök regnr, kund eller plats…</span>
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

        <span
          class="grid h-10 w-10 place-items-center text-white/80 max-md:hidden"
          [matTooltip]="who() + ' · ' + role()"
        >
          <mat-icon>person</mat-icon>
        </span>
        <button
          type="button"
          class="hdr-btn grid place-items-center max-md:hidden"
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
export class Shell {
  readonly auth = inject(Auth);
  readonly nav = inject(Nav);
  readonly search = inject(GlobalSearch);
  readonly quickGroups = QUICK_GROUPS;
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

  openSettings(): void {
    void import('../../../features/settings/settings').then((m) => m.openSettings(this.dialog));
  }
  /** Sidans namn i topbaren. */
  readonly pageName = inject(PageTitle).page;
  private readonly api = inject(InventoryApi);

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
    // Prissättningen gäller bolaget man är i (ägare och personal; mekaniker har ingen åtkomst).
    const pricing = inject(Pricing);
    effect(() => {
      const id = this.auth.garage()?.id;
      if (id && !this.auth.isMechanic()) untracked(() => pricing.load());
    });
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
