import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
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
import { WhenFields } from './when/when';
import { DayPlan } from './day-plan/day-plan';
import { DataTable } from './data-table/data-table';
import { ItemIcon } from './item-icon/item-icon';
import { KrPipe } from './kr-pipe';
import { VatPartPipe } from './vat-part-pipe';
import { InvoiceDocument } from './invoice-document/invoice-document';
import { Callout } from './callout/callout';
import { CompanyLookupStatus } from './company-lookup/company-lookup';
import { QuoteHistory } from './quote-history/quote-history';
import { SalesCardHistory } from './sales-card-history/sales-card-history';
import { MovementList } from './movement-list/movement-list';
import { Pill } from './pill/pill';
import { PhotoGallery } from './photo-gallery/photo-gallery';
import { ChartView } from './chart/chart';
import { FinanceTabs } from './finance-tabs/finance-tabs';
import { MixBar } from './mix-bar/mix-bar';
import { Panel } from './panel/panel';
import { ProductFilter } from './product-filter/product-filter';
import { PageHeader } from './page-header/page-header';
import { Spark } from './spark/spark';
import { Stat } from './stat/stat';
import { RegPlate, SvFlag } from './reg-plate/reg-plate';
import { CatalogHitRow } from './catalog-picker/catalog-picker';
import { QuickArticleDialog } from './quick-article-dialog/quick-article-dialog';
import { SupplierDialog } from './supplier-dialog/supplier-dialog';
import { SupplierSelect } from './supplier-select/supplier-select';
import { TradeDocumentDialog } from './trade-document-dialog/trade-document-dialog';
import { TradeHistory } from './trade-history/trade-history';
import { StockBadge } from './stock-badge/stock-badge';
import { ConnectPrompt } from './toolbar/connect-prompt';
import { FilterButton } from './toolbar/filter-button';
import { SearchField } from './toolbar/search-field';
import { Segmented } from './toolbar/segmented';
import { Summary } from './toolbar/summary';

const MATERIAL = [
  MatAutocompleteModule,
  MatButtonModule,
  MatButtonToggleModule,
  MatCardModule,
  MatCheckboxModule,
  MatChipsModule,
  MatDatepickerModule,
  MatDialogModule,
  MatNativeDateModule,
  MatFormFieldModule,
  MatIconModule,
  MatInputModule,
  MatMenuModule,
  MatProgressBarModule,
  MatRadioModule,
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
    WhenFields,
    DayPlan,
    CustomerDialog,
    CustomerVehiclePicker,
    RegNoInput,
    ListPage,
    CardPage,
    BookingDialog,
    CustomerSelect,
    VehicleDialog,
    KrPipe,
    VatPartPipe,
    InvoiceDocument,
    Callout,
    QuoteHistory,
    SalesCardHistory,
    StockBadge,
    MovementList,
    Pill,
    PhotoGallery,
    ChartView,
    FinanceTabs,
    MixBar,
    Panel,
    ProductFilter,
    PageHeader,
    SearchField,
    Segmented,
    FilterButton,
    Summary,
    ConnectPrompt,
    Spark,
    Stat,
    ItemIcon,
    RegPlate,
    SvFlag,
    CatalogHitRow,
    QuickArticleDialog,
    SupplierDialog,
    SupplierSelect,
    TradeDocumentDialog,
    TradeHistory,
  ],
  imports: [CommonModule, ReactiveFormsModule, RouterModule, ...MATERIAL, CompanyLookupStatus],
  exports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    ...MATERIAL,
    DataTable,
    DateField,
    TimeField,
    WhenFields,
    DayPlan,
    CustomerDialog,
    CustomerVehiclePicker,
    RegNoInput,
    ListPage,
    CardPage,
    BookingDialog,
    CustomerSelect,
    VehicleDialog,
    KrPipe,
    VatPartPipe,
    InvoiceDocument,
    Callout,
    CompanyLookupStatus,
    QuoteHistory,
    SalesCardHistory,
    StockBadge,
    MovementList,
    Pill,
    PhotoGallery,
    ChartView,
    FinanceTabs,
    MixBar,
    Panel,
    ProductFilter,
    PageHeader,
    SearchField,
    Segmented,
    FilterButton,
    Summary,
    ConnectPrompt,
    Spark,
    Stat,
    ItemIcon,
    RegPlate,
    SvFlag,
    SupplierDialog,
    CatalogHitRow,
    SupplierSelect,
    TradeDocumentDialog,
    TradeHistory,
  ],
})
export class SharedModule {}
