import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { PublicQuote } from './public-quote';

@NgModule({
  declarations: [PublicQuote],
  imports: [
    SharedModule,
    RouterModule.forChild([{ path: '', title: 'Kostnadsförslag', component: PublicQuote }]),
  ],
})
export class PublicQuoteModule {}
