import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { ServiceTypeCard } from './service-type-card/service-type-card';
import { ServiceTypeList } from './service-type-list/service-type-list';

@NgModule({
  declarations: [ServiceTypeList, ServiceTypeCard],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: ServiceTypeList },
      { path: 'new', title: 'Ny åtgärd', component: ServiceTypeCard },
      { path: ':id', title: 'Åtgärd', component: ServiceTypeCard },
    ]),
  ],
})
export class ServiceTypesModule {}
