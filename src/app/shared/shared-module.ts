import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { ConfirmDialog } from './confirm-dialog/confirm-dialog';
import { CustomerVehiclePicker } from './customer-vehicle-picker/customer-vehicle-picker';
import { BookingDialog } from './booking-dialog/booking-dialog';
import { CardPage } from './card-page/card-page';
import { CustomerSelect } from './customer-select/customer-select';
import { ListPage } from './list-page/list-page';
import { RegNoInput } from './reg-no-input/reg-no-input';
import { CustomerDialog } from './customer-dialog/customer-dialog';
import { VehicleDialog } from './vehicle-dialog/vehicle-dialog';
import { DateField } from './date-field/date-field';
import { TimeField } from './time-field/time-field';
import { DataTable } from './data-table/data-table';
import { ItemIcon } from './item-icon/item-icon';
import { KrPipe } from './kr-pipe';
import { MovementList } from './movement-list/movement-list';
import { Pill } from './pill/pill';
import { RegPlate, SvFlag } from './reg-plate/reg-plate';
import { ResetPasswordDialog } from '../features/settings/reset-password-dialog/reset-password-dialog';
import { SettingsPage } from '../features/settings/settings';
import { SupplierDialog } from './supplier-dialog/supplier-dialog';
import { SupplierSelect } from './supplier-select/supplier-select';
import { TradeDocumentDialog } from './trade-document-dialog/trade-document-dialog';
import { TradeHistory } from './trade-history/trade-history';
import { StockBadge } from './stock-badge/stock-badge';

const MATERIAL = [
  MatAutocompleteModule,
  MatButtonModule,
  MatButtonToggleModule,
  MatCardModule,
  MatChipsModule,
  MatDatepickerModule,
  MatDialogModule,
  MatNativeDateModule,
  MatFormFieldModule,
  MatIconModule,
  MatInputModule,
  MatMenuModule,
  MatProgressBarModule,
  MatSelectModule,
  MatSlideToggleModule,
  MatSnackBarModule,
  MatTabsModule,
  MatToolbarModule,
  MatTooltipModule,
];

@NgModule({
  declarations: [
    ConfirmDialog,
    DataTable,
    DateField,
    TimeField,
    CustomerDialog,
    CustomerVehiclePicker,
    RegNoInput,
    ListPage,
    CardPage,
    BookingDialog,
    CustomerSelect,
    VehicleDialog,
    KrPipe,
    StockBadge,
    MovementList,
    Pill,
    ItemIcon,
    RegPlate,
    SvFlag,
    SettingsPage,
    ResetPasswordDialog,
    SupplierDialog,
    SupplierSelect,
    TradeDocumentDialog,
    TradeHistory,
  ],
  imports: [CommonModule, ReactiveFormsModule, RouterModule, ...MATERIAL],
  exports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    ...MATERIAL,
    DataTable,
    DateField,
    TimeField,
    CustomerDialog,
    CustomerVehiclePicker,
    RegNoInput,
    ListPage,
    CardPage,
    BookingDialog,
    CustomerSelect,
    VehicleDialog,
    KrPipe,
    StockBadge,
    MovementList,
    Pill,
    ItemIcon,
    RegPlate,
    SvFlag,
    SupplierDialog,
    SupplierSelect,
    TradeDocumentDialog,
    TradeHistory,
  ],
})
export class SharedModule {}
