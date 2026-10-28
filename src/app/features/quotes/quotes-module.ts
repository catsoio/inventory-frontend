import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { QuoteCard } from './quote-card';
import { QuoteList } from './quote-list';
import { QuotePrint } from './quote-print';
import { QuoteSendDialog } from './quote-send-dialog';

@NgModule({
  declarations: [QuoteList, QuoteCard, QuotePrint, QuoteSendDialog],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: QuoteList },
      {
        path: 'new',
        title: 'Ny offert',
        component: QuoteCard,
        canDeactivate: [unsavedGuard],
      },
      { path: ':id/print', title: 'Offert', component: QuotePrint },
      {
        path: ':id',
        title: 'Offert',
        component: QuoteCard,
        canDeactivate: [unsavedGuard],
      },
    ]),
  ],
})
export class QuotesModule {}
