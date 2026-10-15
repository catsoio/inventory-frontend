import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { Activity } from './activity';

@NgModule({
  declarations: [Activity],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: Activity }])],
})
export class ActivityModule {}
