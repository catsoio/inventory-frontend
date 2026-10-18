import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { FinanceOverview } from './finance-overview';
import { InvoiceList } from './invoice-list';

@NgModule({
  declarations: [FinanceOverview, InvoiceList],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: FinanceOverview },
      { path: 'invoices', title: 'Fakturor', component: InvoiceList },
    ]),
  ],
})
export class FinanceModule {}
