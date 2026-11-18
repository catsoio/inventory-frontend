import { Component, inject } from '@angular/core';
import { Auth } from '../../core/auth/auth';
import { Nav } from '../../core/layout/nav';
import type { SectionTab } from '../page-header/page-header';

/**
 * Sidhuvudet för Ekonomi, på dator och mobil: Översikt, Fakturor, Kvitton, Utlägg, Kassaregister och Moms
 * och bokföring är flikar här, och Ekonomi är ett enda menyval i sidomenyn. Sidans åtgärd (en
 * "Ny …"-knapp) läggs i `[actions]` och hamnar till höger i samma rad.
 */
@Component({
  selector: 'app-finance-tabs',
  standalone: false,
  host: { class: 'block' },
  template: `
    <app-page-header [tabs]="tabs" label="Ekonomi">
      <div actions class="contents"><ng-content select="[actions]" /></div>
    </app-page-header>
  `,
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
        { path: '/finance/expenses', label: 'Utlägg' },
        { path: '/bookkeeping', label: 'Moms och bokföring' },
      ]
    : [
        { path: '/finance', label: 'Översikt', exact: true },
        { path: '/finance/invoices', label: 'Fakturor' },
        { path: '/finance/receipts', label: 'Kvitton' },
        { path: '/finance/expenses', label: 'Utlägg' },
        { path: '/finance/register', label: 'Kassaregister' },
        { path: '/bookkeeping', label: 'Moms och bokföring' },
      ]
  ).filter(() => this.admin);
}
