import { Component, computed, inject } from '@angular/core';
import { Auth } from '../../auth/auth';

@Component({
  selector: 'app-shell',
  standalone: false,
  host: { class: 'flex h-dvh flex-col bg-gray-50' },
  template: `
    <header class="flex h-14 shrink-0 items-center gap-4 bg-brand px-4 text-white">
      <span class="text-lg font-semibold">Däcklager</span>
      <span class="flex-1"></span>
      <span class="hidden text-sm lg:inline">{{ who() }}</span>
      <a mat-icon-button routerLink="/settings" aria-label="Inställningar"
        ><mat-icon>settings</mat-icon></a
      >
      <button mat-icon-button (click)="auth.logout()" aria-label="Logga ut">
        <mat-icon>logout</mat-icon>
      </button>
    </header>

    <div class="flex min-h-0 flex-1">
      <nav
        class="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-white p-3 md:flex"
      >
        @for (g of groups; track g.title) {
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
              class="flex items-center gap-3 rounded px-3 py-2 text-gray-700 hover:bg-gray-100"
            >
              <mat-icon>{{ l.icon }}</mat-icon
              >{{ l.label }}
            </a>
          }
        }
      </nav>

      <main class="min-w-0 flex-1 overflow-y-auto p-3 md:p-5 xl:p-6">
        <router-outlet />
      </main>
    </div>

    <nav class="flex shrink-0 border-t bg-white md:hidden">
      @for (l of mobileLinks; track l.path) {
        <a
          [routerLink]="l.path"
          routerLinkActive="text-brand font-semibold"
          class="flex flex-1 flex-col items-center py-2 text-sm"
        >
          <mat-icon>{{ l.icon }}</mat-icon
          >{{ l.label }}
        </a>
      }
    </nav>
  `,
})
export class Shell {
  readonly auth = inject(Auth);

  readonly groups = [
    {
      title: 'Start',
      links: [{ path: '/dashboard', label: 'Översikt', icon: 'dashboard', exact: true }],
    },
    {
      title: 'Lager',
      links: [
        { path: '/inventory', label: 'Artiklar', icon: 'inventory_2', exact: true },
        { path: '/inventory/new', label: 'Ny artikel', icon: 'add_circle', exact: true },
      ],
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
      links: [{ path: '/reports', label: 'Logg och rapport', icon: 'bar_chart', exact: true }],
    },
    {
      title: 'System',
      links: [{ path: '/settings', label: 'Inställningar', icon: 'settings', exact: true }],
    },
  ];
  readonly mobileLinks = [
    { path: '/dashboard', label: 'Översikt', icon: 'dashboard' },
    { path: '/inventory', label: 'Lager', icon: 'inventory_2' },
    { path: '/sales', label: 'Sälj', icon: 'point_of_sale' },
    { path: '/purchases', label: 'Inköp', icon: 'local_shipping' },
    { path: '/reports', label: 'Rapport', icon: 'bar_chart' },
  ];

  readonly who = computed(() => {
    const u = this.auth.user();
    return `${u?.name ?? u?.email ?? u?.phone ?? ''}${this.auth.isAdmin() ? ' (admin)' : ''}`;
  });
}
