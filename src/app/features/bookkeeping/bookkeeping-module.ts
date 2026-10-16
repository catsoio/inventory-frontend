import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { BookDialog } from './book-dialog/book-dialog';
import { Bookkeeping } from './bookkeeping';
import { ClosingDetail } from './closing-detail/closing-detail';
import { ClosingEntries } from './closing-entries/closing-entries';
import { ClosingSummaryView } from './closing-summary/closing-summary';
import { ResetDialog } from './reset-dialog/reset-dialog';
import { VatReportPanel } from './vat-report/vat-report';

@NgModule({
  declarations: [
    Bookkeeping,
    ClosingDetail,
    ClosingEntries,
    ClosingSummaryView,
    BookDialog,
    ResetDialog,
    VatReportPanel,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: Bookkeeping },
      { path: ':id', title: 'Bokföring', component: ClosingDetail },
    ]),
  ],
})
export class BookkeepingModule {}
