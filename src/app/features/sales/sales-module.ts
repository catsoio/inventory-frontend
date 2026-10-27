import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { SalesCardPage } from './sales-card';
import { SalesInvoicePage } from './sales-invoice';
import { SalesList } from './sales-list';

@NgModule({
  declarations: [SalesList, SalesCardPage, SalesInvoicePage],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: SalesList },
      { path: 'new', title: 'Ny försäljning', component: SalesCardPage, canDeactivate: [unsavedGuard] },
      { path: ':id/invoice', title: 'Faktura', component: SalesInvoicePage },
      { path: ':id', title: 'Säljkort', component: SalesCardPage, canDeactivate: [unsavedGuard] },
    ]),
  ],
})
export class SalesModule {}
