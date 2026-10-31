import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared-module';
import { ResetPasswordDialog } from './reset-password-dialog/reset-password-dialog';
import { SettingsCompanies, SettingsCompany, SettingsStaff } from './sections/company-sections';
import { SettingsPassword, SettingsView } from './sections/personal-sections';
import {
  SettingsCustomers,
  SettingsHotel,
  SettingsPricing,
  SettingsStock,
} from './sections/workflow-sections';
import { SettingsPage } from './settings';
import { SettingsSection } from './settings-section';

export { SettingsPage };

/** Inställningarna är en popup (`openSettings`); modulen laddas först när den öppnas. */
@NgModule({
  declarations: [
    SettingsPage,
    SettingsSection,
    SettingsView,
    SettingsPassword,
    SettingsCompany,
    SettingsStaff,
    SettingsCompanies,
    SettingsPricing,
    SettingsStock,
    SettingsCustomers,
    SettingsHotel,
    ResetPasswordDialog,
  ],
  imports: [SharedModule],
})
export class SettingsModule {}
