import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { CustomerCard } from './customer-card/customer-card';
import { CustomerList } from './customer-list/customer-list';

@NgModule({
  declarations: [CustomerList, CustomerCard],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: CustomerList },
      { path: 'new', title: 'Ny kund', component: CustomerCard },
      { path: ':id', title: 'Kund', component: CustomerCard },
    ]),
  ],
})
export class CustomersModule {}
