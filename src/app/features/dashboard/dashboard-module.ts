import { NgModule } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { Dashboard } from './dashboard';

@NgModule({
  declarations: [Dashboard],
  imports: [
    SharedModule,
    DragDropModule,
    RouterModule.forChild([{ path: '', component: Dashboard }]),
  ],
})
export class DashboardModule {}
