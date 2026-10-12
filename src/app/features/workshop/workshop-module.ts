import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { WorkshopItemDialog } from './workshop-item-dialog';
import { WorkshopSetup } from './workshop-setup';

@NgModule({
  declarations: [WorkshopSetup, WorkshopItemDialog],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: WorkshopSetup }])],
})
export class WorkshopModule {}
