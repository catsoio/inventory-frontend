import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { adminGuard, moduleGuard } from '../../core/auth/auth-guard';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { OnlineBookingPage } from './online-booking-page';
import { ServiceTypeCard } from './service-type-card/service-type-card';
import { ServiceTypeList } from './service-type-list/service-type-list';

@NgModule({
  declarations: [ServiceTypeList, ServiceTypeCard, OnlineBookingPage],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: ServiceTypeList },
      {
        path: 'online',
        title: 'Onlinebokning',
        component: OnlineBookingPage,
        canActivate: [adminGuard, moduleGuard('onlinebokning')],
        canDeactivate: [unsavedGuard],
      },
      {
        path: 'new',
        title: 'Ny åtgärd',
        component: ServiceTypeCard,
        canDeactivate: [unsavedGuard],
      },
      { path: ':id', title: 'Åtgärd', component: ServiceTypeCard, canDeactivate: [unsavedGuard] },
    ]),
  ],
})
export class ServiceTypesModule {}
