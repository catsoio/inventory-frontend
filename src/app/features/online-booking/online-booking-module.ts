import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { OnlineBookingPage } from './online-booking-page';

@NgModule({
  declarations: [OnlineBookingPage],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', title: 'Webbsida', component: OnlineBookingPage, canDeactivate: [unsavedGuard] },
    ]),
  ],
})
export class OnlineBookingModule {}
