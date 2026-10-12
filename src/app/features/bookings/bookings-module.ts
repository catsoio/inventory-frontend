import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FullCalendarModule } from '@fullcalendar/angular';
import { SharedModule } from '../../shared/shared-module';
import { BookingCalendar } from './booking-calendar/booking-calendar';
import { BookingList } from './booking-list/booking-list';

@NgModule({
  declarations: [BookingCalendar, BookingList],
  imports: [
    SharedModule,
    FullCalendarModule,
    RouterModule.forChild([
      { path: '', component: BookingCalendar },
      { path: 'list', title: 'Bokningar', component: BookingList },
    ]),
  ],
})
export class BookingsModule {}
