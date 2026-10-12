import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { VehicleCard } from './vehicle-card/vehicle-card';
import { VehicleList } from './vehicle-list/vehicle-list';

@NgModule({
  declarations: [VehicleList, VehicleCard],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: VehicleList },
      { path: 'new', title: 'Ny bil', component: VehicleCard },
      { path: ':id', title: 'Bil', component: VehicleCard },
    ]),
  ],
})
export class VehiclesModule {}
