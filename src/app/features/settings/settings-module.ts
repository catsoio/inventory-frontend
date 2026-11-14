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
import {
  SettingsCounterSales,
  SettingsPayments,
  SettingsRegister,
} from './sections/payment-sections';
import {
  BlocketConnectionDialog,
  CarInfoConnectionDialog,
  GummigrossenConnectionDialog,
  SettingsConnections,
  ZettleConnectionDialog,
} from './sections/connections-section';
import { SettingsHotel, SettingsPricing, SettingsStock } from './sections/workflow-sections';
import { SettingsScreen } from './sections/screen-setting';
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
    SettingsScreen,
    SettingsStock,
    SettingsHotel,
    SettingsCounterSales,
    SettingsPayments,
    SettingsRegister,
    SettingsConnections,
    CarInfoConnectionDialog,
    GummigrossenConnectionDialog,
    BlocketConnectionDialog,
    ZettleConnectionDialog,
    ResetPasswordDialog,
    FeaturesDialog,
  ],
  imports: [SharedModule],
})
export class SettingsModule {}
