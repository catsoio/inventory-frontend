import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FullCalendarModule } from '@fullcalendar/angular';
import { SharedModule } from '../../shared/shared-module';
import { BookingCalendar } from './booking-calendar/booking-calendar';
import { BookingDialog } from './booking-dialog/booking-dialog';

@NgModule({
  declarations: [BookingCalendar, BookingDialog],
  imports: [
    SharedModule,
    FullCalendarModule,
    RouterModule.forChild([{ path: '', component: BookingCalendar }]),
  ],
})
export class BookingsModule {}
