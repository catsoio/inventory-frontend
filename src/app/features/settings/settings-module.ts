import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { SettingsPage } from './settings';

@NgModule({
  declarations: [SettingsPage],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: SettingsPage }])],
})
export class SettingsModule {}
