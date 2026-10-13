import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { SupplierCard } from './supplier-card/supplier-card';
import { SupplierList } from './supplier-list/supplier-list';

@NgModule({
  declarations: [SupplierList, SupplierCard],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: SupplierList },
      { path: 'new', title: 'Ny leverantör', component: SupplierCard },
      { path: ':id', title: 'Leverantör', component: SupplierCard },
    ]),
  ],
})
export class SuppliersModule {}
