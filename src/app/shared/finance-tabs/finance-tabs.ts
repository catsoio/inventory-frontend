import { Component, inject } from '@angular/core';
import { Auth } from '../../core/auth/auth';

/**
 * Flikraden för Ekonomi (bara dator), samma val som undermenyn i sidomenyn. Ligger överst på
 * Ekonomis sidor så att man hoppar mellan dem utan att gå via menyn.
 */
@Component({
  selector: 'app-finance-tabs',
  standalone: false,
  host: { class: 'block max-md:hidden' },
  template: `
    <nav class="mb-4 flex gap-1 border-b border-gray-200" aria-label="Ekonomi">
      @for (t of tabs; track t.path) {
        <a
          [routerLink]="t.path"
          [routerLinkActiveOptions]="{ exact: !!t.exact }"
          routerLinkActive="is-active"
          class="tab -mb-px border-b-2 border-transparent px-4 py-2.5 text-[15px] font-medium text-gray-600 hover:text-gray-900"
          >{{ t.label }}</a
        >
      }
    </nav>
  `,
  styles: `
    .tab.is-active {
      border-color: var(--mat-sys-primary);
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
  `,
})
export class FinanceTabs {
  private readonly auth = inject(Auth);
  private readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  /** Hela Ekonomi är för ägaren. */
  readonly tabs = [
    { path: '/finance', label: 'Översikt', exact: true, admin: true },
    { path: '/finance/invoices', label: 'Fakturor', exact: true, admin: true },
    { path: '/bookkeeping', label: 'Moms och bokföring', admin: true },
  ].filter((t) => this.admin || !t.admin);
}
