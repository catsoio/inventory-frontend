import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { WorkshopScreen } from './workshop-screen';

@NgModule({
  declarations: [WorkshopScreen],
  imports: [
    SharedModule,
    RouterModule.forChild([{ path: '', title: 'Verkstadsskärm', component: WorkshopScreen }]),
  ],
})
export class WorkshopScreenModule {}
