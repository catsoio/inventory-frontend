import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { ArticleDetail } from './article-detail/article-detail';
import { ArticleForm } from './article-form/article-form';
import { ArticleList } from './article-list/article-list';
import { StockActionDialog } from './stock-action-dialog/stock-action-dialog';
import { StockOverview } from './stock-overview/stock-overview';

@NgModule({
  declarations: [ArticleList, StockOverview, ArticleDetail, ArticleForm, StockActionDialog],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: ArticleList },
      { path: 'overview', title: 'Lager: översikt', component: StockOverview },
      { path: 'new', title: 'Ny artikel', component: ArticleForm },
      { path: ':id', title: 'Artikel', component: ArticleDetail },
      { path: ':id/edit', title: 'Ändra artikel', component: ArticleForm },
    ]),
  ],
})
export class InventoryModule {}
