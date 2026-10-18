import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { WorkOrderCard } from './work-order-card/work-order-card';
import { WorkOrderQuick } from './work-order-quick/work-order-quick';
import { WorkOrderMine } from './work-order-mine/work-order-mine';
import { WorkOrderList } from './work-order-list/work-order-list';
import { WorkOrderPrint } from './work-order-print/work-order-print';
import { QuickArticleDialog } from './quick-article-dialog/quick-article-dialog';
import { WorkOrderInvoicePage } from './work-order-invoice/work-order-invoice';

@NgModule({
  declarations: [
    WorkOrderList,
    WorkOrderCard,
    WorkOrderPrint,
    WorkOrderMine,
    WorkOrderQuick,
    WorkOrderInvoicePage,
    QuickArticleDialog,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: WorkOrderList },
      { path: 'mine', title: 'Mina arbetsorder', component: WorkOrderMine },
      {
        path: 'new',
        title: 'Ny arbetsorder',
        component: WorkOrderCard,
        canDeactivate: [unsavedGuard],
      },
      {
        path: ':id',
        title: 'Arbetsorder',
        component: WorkOrderCard,
        canDeactivate: [unsavedGuard],
      },
      { path: ':id/print', title: 'Arbetsorder', component: WorkOrderPrint },
      { path: ':id/invoice', title: 'Faktura', component: WorkOrderInvoicePage },
    ]),
  ],
})
export class WorkOrdersModule {}
