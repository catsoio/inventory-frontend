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
import { CustomerDialog } from './customer-dialog/customer-dialog';
import { VehicleDialog } from './vehicle-dialog/vehicle-dialog';
import { DateField } from './date-field/date-field';
import { DataTable } from './data-table/data-table';
import { ItemIcon } from './item-icon/item-icon';
import { KrPipe } from './kr-pipe';
import { MovementList } from './movement-list/movement-list';
import { Pill } from './pill/pill';
import { RegPlate, SvFlag } from './reg-plate/reg-plate';
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
    CustomerDialog,
    CustomerVehiclePicker,
    VehicleDialog,
    KrPipe,
    StockBadge,
    MovementList,
    Pill,
    ItemIcon,
    RegPlate,
    SvFlag,
  ],
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL],
  exports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    ...MATERIAL,
    DataTable,
    DateField,
    CustomerDialog,
    CustomerVehiclePicker,
    VehicleDialog,
    KrPipe,
    StockBadge,
    MovementList,
    Pill,
    ItemIcon,
    RegPlate,
    SvFlag,
  ],
})
export class SharedModule {}
