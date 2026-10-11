import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { ResetPasswordDialog } from './reset-password-dialog/reset-password-dialog';
import { SettingsPage } from './settings';

@NgModule({
  declarations: [SettingsPage, ResetPasswordDialog],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: SettingsPage }])],
})
export class SettingsModule {}
