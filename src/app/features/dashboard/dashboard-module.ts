import { NgModule } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { AttentionList } from './attention-list';
import { Dashboard } from './dashboard';
import { DayTimeline } from './day-timeline';
import { HomeDesktop } from './home-desktop';
import { HomeMobile } from './home-mobile';
import { OrderBoard } from './order-board';

@NgModule({
  declarations: [Dashboard, HomeDesktop, HomeMobile, AttentionList, DayTimeline, OrderBoard],
  imports: [
    SharedModule,
    DragDropModule,
    RouterModule.forChild([{ path: '', component: Dashboard }]),
  ],
})
export class DashboardModule {}
