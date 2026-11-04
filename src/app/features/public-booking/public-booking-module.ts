import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { PublicBooking } from './public-booking';

@NgModule({
  declarations: [PublicBooking],
  imports: [
    SharedModule,
    RouterModule.forChild([{ path: '', title: 'Boka tid', component: PublicBooking }]),
  ],
})
export class PublicBookingModule {}
