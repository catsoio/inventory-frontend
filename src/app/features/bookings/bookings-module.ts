import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CalendarComponent } from '@schedule-x/angular';
import { SharedModule } from '../../shared/shared-module';
import { BookingCalendar } from './booking-calendar/booking-calendar';
import { BookingBoard } from './booking-board/booking-board';
import { BookingList } from './booking-list/booking-list';
import { BookingViews } from './booking-views/booking-views';

@NgModule({
  declarations: [BookingCalendar, BookingBoard, BookingList, BookingViews],
  imports: [
    SharedModule,
    CalendarComponent,
    RouterModule.forChild([
      // Vyn (Resurser/Dag/Vecka/Månad) väljs i kalenderns verktygsfält via ?view=.
      { path: '', title: 'Tidsbokning', component: BookingCalendar },
      { path: 'list', title: 'Bokningar', component: BookingList },
    ]),
  ],
})
export class BookingsModule {}
