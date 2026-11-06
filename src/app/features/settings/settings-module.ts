import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared-module';
import { FeaturesDialog } from './features-dialog/features-dialog';
import { ResetPasswordDialog } from './reset-password-dialog/reset-password-dialog';
import {
  SettingsCompanies,
  SettingsCompany,
  SettingsStaff,
  SettingsWebsite,
} from './sections/company-sections';
import { SettingsPassword, SettingsView } from './sections/personal-sections';
import { SettingsPayments, SettingsRegister } from './sections/payment-sections';
import {
  BlocketConnectionDialog,
  CarInfoConnectionDialog,
  SettingsConnections,
} from './sections/connections-section';
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
    SettingsWebsite,
    SettingsPricing,
    SettingsStock,
    SettingsCustomers,
    SettingsHotel,
    SettingsPayments,
    SettingsRegister,
    SettingsConnections,
    CarInfoConnectionDialog,
    BlocketConnectionDialog,
    ResetPasswordDialog,
    FeaturesDialog,
  ],
  imports: [SharedModule],
})
export class SettingsModule {}
