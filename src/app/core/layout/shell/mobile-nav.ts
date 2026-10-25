import { MatDialog } from '@angular/material/dialog';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { Auth } from '../../auth/auth';
import { GARAGE_ROLE_LABELS } from '../../models';
import { Nav } from '../nav';

/**
 * Mobilens bottenfält med det som görs i farten (Hem, Tider, Hotell, Lager) och "Mer", som öppnar
 * ett blad underifrån med resten: kunder, bilar, försäljning, inköp, ekonomi, inställningar.
 */
@Component({
  selector: 'app-mobile-nav',
  standalone: false,
  host: { class: 'block md:hidden' },
  styles: `
    .mtab.is-active {
      color: var(--mat-sys-primary);
      font-weight: 700;
    }
    .mtab.is-active .mpill {
      background: color-mix(in srgb, var(--mat-sys-primary) 16%, white);
    }
    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 84px;
      padding: 10px 6px;
      border-radius: 14px;
      background: #f3f4f6;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      text-align: center;
    }
    .tile:active {
      background: #e5e7eb;
    }
    .tile.is-active {
      background: var(--color-brand-soft);
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      min-height: 48px;
      padding: 0 14px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 500;
      color: #374151;
      text-align: left;
    }
    .row:active {
      background: #f3f4f6;
    }
  `,
  template: `
    <app-garage-menu #gm="garageMenu" />

    <nav
      class="flex shrink-0 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_4px_rgba(0,0,0,0.06)]"
      aria-label="Genvägar"
    >
      @for (t of nav.tabs(); track t.path) {
        @let b = nav.badges()[t.path];
        <a
          [routerLink]="t.path"
          class="mtab flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-medium text-gray-600"
          [class.is-active]="nav.matches(t)"
          [attr.aria-current]="nav.matches(t) ? 'page' : null"
        >
          <span
            class="mpill relative grid h-8 w-16 place-items-center rounded-full transition-colors"
          >
            <mat-icon>{{ t.icon }}</mat-icon>
            @if (b && b.dot !== 'bg-gray-400') {
              <span
                class="absolute top-0.5 right-3 h-2.5 w-2.5 rounded-full ring-2 ring-white"
                [class]="b.dot"
                [attr.title]="b.hint"
              ></span>
            }
          </span>
          {{ t.label }}
        </a>
      }
      <button
        type="button"
        class="mtab flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-medium text-gray-600"
        [class.is-active]="moreActive()"
        aria-haspopup="dialog"
        (click)="open.set(true)"
      >
        <span
          class="mpill relative grid h-8 w-16 place-items-center rounded-full transition-colors"
        >
          <mat-icon>menu</mat-icon>
          @if (moreAttention()) {
            <span
              class="absolute top-0.5 right-3 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white"
            ></span>
          }
        </span>
        Mer
      </button>
    </nav>

    @if (open()) {
      <div class="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-label="Mer">
        <button
          type="button"
          class="absolute inset-0 bg-black/40"
          (click)="open.set(false)"
          aria-label="Stäng"
        ></button>
        <section
          class="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
        >
          <div class="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-300"></div>
          <div class="flex items-center gap-3 px-4 pt-3 pb-4">
            <span
              class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand font-semibold text-white uppercase"
              >{{ initial() }}</span
            >
            <div class="min-w-0 flex-1 leading-tight">
              <div class="truncate text-sm font-semibold">
                {{ auth.companyName() || 'Däcklager' }}
              </div>
              <div class="truncate text-xs text-gray-500">{{ who() }} · {{ role() }}</div>
            </div>
            <button mat-icon-button (click)="open.set(false)" aria-label="Stäng">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="grid grid-cols-3 gap-2 px-4">
            @if (nav.more().length) {
              @for (l of nav.more(); track l.path) {
                @let b = nav.badges()[l.path];
                <a
                  [routerLink]="l.path"
                  class="tile relative"
                  [class.is-active]="nav.matches(l)"
                  (click)="open.set(false)"
                >
                  <mat-icon>{{ l.icon }}</mat-icon>
                  {{ l.label }}
                  @if (b) {
                    <span
                      class="absolute top-2 right-2 h-2.5 w-2.5 rounded-full ring-2 ring-[#f3f4f6]"
                      [class]="b.dot"
                      [attr.title]="b.hint"
                    ></span>
                  }
                </a>
              }
            }
            <button type="button" class="tile" (click)="openSettings()">
              <mat-icon>settings</mat-icon>
              Inställningar
            </button>
          </div>

          <div class="mt-3 border-t border-gray-100 px-2 pt-2">
            @if (auth.isSuperAdmin()) {
              <button type="button" class="row" [matMenuTriggerFor]="gm.menu">
                <mat-icon class="text-gray-500">business</mat-icon>
                <span class="flex-1">Byt garage</span>
                <mat-icon class="text-gray-400">unfold_more</mat-icon>
              </button>
            }
            <button type="button" class="row" (click)="auth.logout()">
              <mat-icon class="text-gray-500">logout</mat-icon> Logga ut
            </button>
          </div>
        </section>
      </div>
    }
  `,
})
export class MobileNav {
  readonly auth = inject(Auth);
  readonly nav = inject(Nav);
  private readonly dialog = inject(MatDialog);

  openSettings(): void {
    this.open.set(false);
    void import('../../../features/settings/settings').then((m) => m.openSettings(this.dialog));
  }
  readonly open = signal(false);

  /** "Mer" är markerad när en sida därifrån är öppen. */
  readonly moreActive = computed(
    () =>
      !this.nav.tabs().some((t) => this.nav.matches(t)) &&
      this.nav.more().some((m) => this.nav.matches(m)),
  );

  /** Något under "Mer" väntar på någon (gul eller röd prick), så att det syns utan att öppna bladet. */
  readonly moreAttention = computed(() =>
    this.nav.more().some((m) => {
      const dot = this.nav.badges()[m.path]?.dot;
      return dot === 'bg-amber-500' || dot === 'bg-red-500';
    }),
  );

  readonly who = computed(() => {
    const u = this.auth.user();
    return `${u?.name ?? u?.email ?? u?.phone ?? ''}`;
  });
  readonly initial = computed(() => this.who()[0] ?? '?');
  readonly role = computed(() =>
    this.auth.isSuperAdmin()
      ? 'Superadmin'
      : GARAGE_ROLE_LABELS[this.auth.garage()?.role ?? 'staff'],
  );

  constructor() {
    // Bladet stängs när man har valt en sida.
    effect(() => {
      this.nav.url();
      this.open.set(false);
    });
  }
}
