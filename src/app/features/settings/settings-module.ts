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
  GummigrossenConnectionDialog,
  SettingsConnections,
} from './sections/connections-section';
import { SettingsHotel, SettingsPricing, SettingsStock } from './sections/workflow-sections';
import { SettingsPage } from './settings';
import { SettingsSection } from './settings-section';
import { SettingGroup, SettingRow } from './settings-ui';

export { SettingsPage };

/** Inställningarna är en popup (`openSettings`); modulen laddas först när den öppnas. */
@NgModule({
  declarations: [
    SettingsPage,
    SettingsSection,
    SettingGroup,
    SettingRow,
    SettingsView,
    SettingsPassword,
    SettingsCompany,
    SettingsStaff,
    SettingsCompanies,
    SettingsWebsite,
    SettingsPricing,
    SettingsStock,
    SettingsHotel,
    SettingsPayments,
    SettingsRegister,
    SettingsConnections,
    CarInfoConnectionDialog,
    GummigrossenConnectionDialog,
    BlocketConnectionDialog,
    ResetPasswordDialog,
    FeaturesDialog,
  ],
  imports: [SharedModule],
})
export class SettingsModule {}
