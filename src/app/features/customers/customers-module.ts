import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { CustomerDetailPage } from './customer-detail/customer-detail';
import { CustomerList } from './customer-list/customer-list';

@NgModule({
  declarations: [CustomerList, CustomerDetailPage],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: CustomerList },
      { path: ':id', title: 'Kund', component: CustomerDetailPage },
    ]),
  ],
})
export class CustomersModule {}
