import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { Reports } from './reports';

@NgModule({
  declarations: [Reports],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: Reports }])],
})
export class ReportsModule {}
