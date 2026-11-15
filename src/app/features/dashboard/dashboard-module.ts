import { NgModule } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { Dashboard } from './dashboard';
import { DayTimeline } from './day-timeline';
import { HomeDesktop } from './home-desktop';
import { HomeMobile } from './home-mobile';
import { OrderBoard } from './order-board';

@NgModule({
  declarations: [Dashboard, HomeDesktop, HomeMobile, DayTimeline, OrderBoard],
  imports: [
    SharedModule,
    DragDropModule,
    RouterModule.forChild([{ path: '', component: Dashboard, data: { reuse: true } }]),
  ],
})
export class DashboardModule {}
