import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FullCalendarModule } from '@fullcalendar/angular';
import { SharedModule } from '../../shared/shared-module';
import { BookingCalendar } from './booking-calendar/booking-calendar';
import { BookingBoard } from './booking-board/booking-board';
import { BookingList } from './booking-list/booking-list';

@NgModule({
  declarations: [BookingCalendar, BookingBoard, BookingList],
  imports: [
    SharedModule,
    FullCalendarModule,
    RouterModule.forChild([
      // Vyerna ligger i sidomenyn; samma sida, olika startvy.
      { path: '', component: BookingCalendar, data: { view: 'board' } },
      {
        path: 'day',
        title: 'Tidsbokning',
        component: BookingCalendar,
        data: { view: 'timeGridDay' },
      },
      {
        path: 'week',
        title: 'Tidsbokning',
        component: BookingCalendar,
        data: { view: 'timeGridWeek' },
      },
      {
        path: 'month',
        title: 'Tidsbokning',
        component: BookingCalendar,
        data: { view: 'dayGridMonth' },
      },
      { path: 'list', title: 'Bokningar', component: BookingList },
    ]),
  ],
})
export class BookingsModule {}
