import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CalendarComponent } from '@schedule-x/angular';
import { SharedModule } from '../../shared/shared-module';
import { BookingCalendar } from './booking-calendar/booking-calendar';
import { BookingBoard } from './booking-board/booking-board';
import { BookingList } from './booking-list/booking-list';
import { BookingViews } from './booking-views/booking-views';
import { BookingInbox } from './booking-inbox/booking-inbox';

@NgModule({
  declarations: [BookingCalendar, BookingBoard, BookingList, BookingViews, BookingInbox],
  imports: [
    SharedModule,
    CalendarComponent,
    RouterModule.forChild([
      // Vyn (Dag/Vecka/Månad/Lista) väljs i kalenderns verktygsfält via ?view=.
      { path: '', title: 'Tidsbokning', component: BookingCalendar },
      // Gamla adressen: listan är nu en vy i kalendern (?view=list).
      { path: 'list', redirectTo: '', pathMatch: 'full' },
    ]),
  ],
})
export class BookingsModule {}
