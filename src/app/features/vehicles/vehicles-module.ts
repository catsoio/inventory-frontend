import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { VehicleCard } from './vehicle-card/vehicle-card';
import { VehicleList } from './vehicle-list/vehicle-list';
import { VehicleTech } from './vehicle-tech/vehicle-tech';

@NgModule({
  declarations: [VehicleList, VehicleCard, VehicleTech],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: VehicleList },
      { path: 'new', title: 'Ny bil', component: VehicleCard, canDeactivate: [unsavedGuard] },
      { path: ':id', title: 'Bil', component: VehicleCard, canDeactivate: [unsavedGuard] },
    ]),
  ],
})
export class VehiclesModule {}
