import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { CarCard } from './car-card';
import { CarList } from './car-list';
import { SitePage } from './site-page';

@NgModule({
  declarations: [CarList, CarCard, SitePage],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: CarList },
      { path: 'site', title: 'Webbplats', component: SitePage, canDeactivate: [unsavedGuard] },
      { path: 'new', title: 'Ny bil', component: CarCard },
      { path: ':id', title: 'Bil till salu', component: CarCard, canDeactivate: [unsavedGuard] },
    ]),
  ],
})
export class DealershipModule {}
