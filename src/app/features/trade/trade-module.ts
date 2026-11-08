import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { PurchaseCardPage } from './purchase-card';
import { PurchaseList } from './purchase-list';
import { TradeLedger } from './trade-ledger';

@NgModule({
  declarations: [PurchaseCardPage, TradeLedger],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: PurchaseList },
      { path: 'documents', title: 'Äldre inköp', component: TradeLedger },
      {
        path: 'new',
        title: 'Nytt inköp',
        component: PurchaseCardPage,
        canDeactivate: [unsavedGuard],
      },
      {
        path: ':id',
        title: 'Inköpskort',
        component: PurchaseCardPage,
        canDeactivate: [unsavedGuard],
      },
    ]),
  ],
})
export class TradeModule {}
