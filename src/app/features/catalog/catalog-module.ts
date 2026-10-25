import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { ArticleTypeCard } from './article-type-card';
import { ArticleTypeList } from './article-type-list';
import { WarehouseCard } from './warehouse-card';
import { WarehouseList } from './warehouse-list';

/** Artikeltyper och lager: två register som artikelkortet pekar på. */
@NgModule({
  declarations: [ArticleTypeList, ArticleTypeCard, WarehouseList, WarehouseCard],
  imports: [
    SharedModule,
    MatButtonToggleModule,
    RouterModule.forChild([
      { path: 'article-types', title: 'Artikeltyper', component: ArticleTypeList },
      {
        path: 'article-types/new',
        title: 'Ny artikeltyp',
        component: ArticleTypeCard,
        canDeactivate: [unsavedGuard],
      },
      {
        path: 'article-types/:id',
        title: 'Artikeltyp',
        component: ArticleTypeCard,
        canDeactivate: [unsavedGuard],
      },
      { path: 'warehouses', title: 'Lager', component: WarehouseList },
      {
        path: 'warehouses/new',
        title: 'Nytt lager',
        component: WarehouseCard,
        canDeactivate: [unsavedGuard],
      },
      {
        path: 'warehouses/:id',
        title: 'Lager',
        component: WarehouseCard,
        canDeactivate: [unsavedGuard],
      },
    ]),
  ],
})
export class CatalogModule {}
