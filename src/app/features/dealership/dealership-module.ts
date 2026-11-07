import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { adminGuard } from '../../core/auth/auth-guard';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SalesList } from '../sales/sales-list';
import { SharedModule } from '../../shared/shared-module';
import { CarCard } from './car-card';
import { CarList } from './car-list';
import { CarQuick } from './car-quick';
import { HallFinance } from './hall-finance';
import { HallHome, HallHomeDesktop, HallHomeMobile } from './hall-home';
import { SitePage } from './site-page';

@NgModule({
  declarations: [
    CarList,
    CarQuick,
    CarCard,
    HallFinance,
    SitePage,
    HallHome,
    HallHomeDesktop,
    HallHomeMobile,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', title: 'Bilhandel', component: HallHome },
      { path: 'cars', title: 'Bilar till salu', component: CarList, data: { stage: 'sales' } },
      { path: 'cars/all', title: 'Alla bilar', component: CarList, data: { stage: 'all' } },
      {
        path: 'cars/purchases',
        title: 'Inköpta bilar',
        component: CarList,
        data: { stage: 'purchases' },
      },
      { path: 'cars/sold', title: 'Sålda bilar', component: CarList, data: { stage: 'sold' } },
      { path: 'cars/new', title: 'Ny bil', component: CarCard },
      {
        path: 'cars/:id',
        title: 'Bil',
        component: CarCard,
        canDeactivate: [unsavedGuard],
      },
      // Bilaffärerna är säljkort med en bil: samma lista som Axles försäljning, filtrerad på Hall.
      { path: 'deals', title: 'Affärer', component: SalesList, data: { product: 'hall' } },
      { path: 'site', title: 'Webbplats', component: SitePage, canDeactivate: [unsavedGuard] },
      { path: 'finance', title: 'Ekonomi', component: HallFinance, canActivate: [adminGuard] },
    ]),
  ],
})
export class DealershipModule {}
