import { Component, inject } from '@angular/core';
import { Auth } from '../../core/auth/auth';
import { Nav } from '../../core/layout/nav';
import type { SectionTab } from '../page-header/page-header';

/**
 * Flikraden för Ekonomi, bara på mobil. På dator är Översikt, Fakturor och Moms och bokföring
 * undermenyn till Ekonomi i sidomenyn, och en flikrad vore en dubblett. Mobilen har ingen sidomeny
 * och öppnar Ekonomi från "Mer".
 */
@Component({
  selector: 'app-finance-tabs',
  standalone: false,
  host: { class: 'block' },
  template: `<app-page-header [tabs]="tabs" label="Ekonomi" [mobileOnly]="true" />`,
})
export class FinanceTabs {
  private readonly auth = inject(Auth);
  private readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly hall = inject(Nav).product() === 'hall';
  /**
   * Hela Ekonomi är för ägaren. Hall har sin egen översikt och ingen kassa; fakturorna och
   * bokföringen är samma sidor i båda.
   */
  readonly tabs: SectionTab[] = (this.hall
    ? [
        { path: '/dealership/finance', label: 'Översikt', exact: true },
        { path: '/finance/invoices', label: 'Fakturor' },
        { path: '/bookkeeping', label: 'Moms och bokföring' },
      ]
    : [
        { path: '/finance', label: 'Översikt', exact: true },
        { path: '/finance/invoices', label: 'Fakturor' },
        { path: '/finance/receipts', label: 'Kvitton' },
        { path: '/finance/register', label: 'Kassa' },
        { path: '/bookkeeping', label: 'Moms och bokföring' },
      ]
  ).filter(() => this.admin);
}
