import { Component, inject } from '@angular/core';
import { Auth } from '../../core/auth/auth';
import type { SectionTab } from '../section-tabs/section-tabs';

/**
 * Flikraden för Ekonomi. Sidomenyn har bara "Ekonomi"; Fakturor och Moms och bokföring ligger
 * här som flikar, inte som egna menyval.
 */
@Component({
  selector: 'app-finance-tabs',
  standalone: false,
  host: { class: 'block' },
  template: `<app-section-tabs [tabs]="tabs" label="Ekonomi" />`,
})
export class FinanceTabs {
  private readonly auth = inject(Auth);
  private readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  /** Hela Ekonomi är för ägaren. */
  readonly tabs: SectionTab[] = [
    { path: '/finance', label: 'Översikt', exact: true },
    { path: '/finance/invoices', label: 'Fakturor' },
    { path: '/bookkeeping', label: 'Moms och bokföring' },
  ].filter(() => this.admin);
}
