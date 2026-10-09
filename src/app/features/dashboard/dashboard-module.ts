import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { Dashboard } from './dashboard';

@NgModule({
  declarations: [Dashboard],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: Dashboard }])],
})
export class DashboardModule {}
