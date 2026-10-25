import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { QuoteCard } from './quote-card';
import { QuoteList } from './quote-list';
import { QuotePrint } from './quote-print';

@NgModule({
  declarations: [QuoteList, QuoteCard, QuotePrint],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: QuoteList },
      {
        path: 'new',
        title: 'Nytt kostnadsförslag',
        component: QuoteCard,
        canDeactivate: [unsavedGuard],
      },
      { path: ':id/print', title: 'Kostnadsförslag', component: QuotePrint },
      {
        path: ':id',
        title: 'Kostnadsförslag',
        component: QuoteCard,
        canDeactivate: [unsavedGuard],
      },
    ]),
  ],
})
export class QuotesModule {}
