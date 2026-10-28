import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { FinanceOverview } from './finance-overview';
import { InvoiceNew } from './invoice-new';
import { InvoiceCard } from './invoice-card';
import { InvoiceList } from './invoice-list';
import { ReceiptList } from './receipt-list';

@NgModule({
  declarations: [FinanceOverview, InvoiceList, ReceiptList, InvoiceCard, InvoiceNew],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: FinanceOverview },
      { path: 'invoices', title: 'Fakturor', component: InvoiceList },
      { path: 'receipts', title: 'Kvitton', component: ReceiptList },
      {
        path: 'invoices/new',
        title: 'Lägg till gammal faktura',
        component: InvoiceNew,
        canDeactivate: [unsavedGuard],
      },
      { path: 'invoices/:id', title: 'Faktura', component: InvoiceCard },
    ]),
  ],
})
export class FinanceModule {}
