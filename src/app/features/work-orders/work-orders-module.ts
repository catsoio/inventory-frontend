import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { WorkOrderCard } from './work-order-card/work-order-card';
import { WorkOrderList } from './work-order-list/work-order-list';
import { WorkOrderPrint } from './work-order-print/work-order-print';

@NgModule({
  declarations: [WorkOrderList, WorkOrderCard, WorkOrderPrint],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: WorkOrderList },
      { path: 'new', title: 'Ny arbetsorder', component: WorkOrderCard },
      { path: ':id', title: 'Arbetsorder', component: WorkOrderCard },
      { path: ':id/print', title: 'Arbetsorder', component: WorkOrderPrint },
    ]),
  ],
})
export class WorkOrdersModule {}
