import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { CustomerCard } from './customer-card/customer-card';
import { CustomerList } from './customer-list/customer-list';

@NgModule({
  declarations: [CustomerList, CustomerCard],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: CustomerList },
      { path: 'new', title: 'Ny kund', component: CustomerCard, canDeactivate: [unsavedGuard] },
      { path: ':id', title: 'Kund', component: CustomerCard, canDeactivate: [unsavedGuard] },
    ]),
  ],
})
export class CustomersModule {}
