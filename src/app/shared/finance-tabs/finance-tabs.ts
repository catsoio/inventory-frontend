import { Component, inject } from '@angular/core';
import { Auth } from '../../core/auth/auth';
import type { SectionTab } from '../section-tabs/section-tabs';

/**
 * Flikraden för Ekonomi, bara på mobil. På dator är Översikt, Fakturor och Moms och bokföring
 * undermenyn till Ekonomi i sidomenyn, och en flikrad vore en dubblett. Mobilen har ingen sidomeny
 * och öppnar Ekonomi från "Mer".
 */
@Component({
  selector: 'app-finance-tabs',
  standalone: false,
  host: { class: 'block' },
  template: `<app-section-tabs [tabs]="tabs" label="Ekonomi" [mobileOnly]="true" />`,
})
export class FinanceTabs {
  private readonly auth = inject(Auth);
  private readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  /** Hela Ekonomi är för ägaren. */
  readonly tabs: SectionTab[] = [
    { path: '/finance', label: 'Översikt', exact: true },
    { path: '/finance/invoices', label: 'Fakturor' },
    { path: '/finance/receipts', label: 'Kvitton' },
    { path: '/bookkeeping', label: 'Moms och bokföring' },
  ].filter(() => this.admin);
}
