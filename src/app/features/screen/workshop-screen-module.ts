import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { AutoScroll } from './auto-scroll';
import { ScreenPlate } from './plate';
import { ScreenBoardStyle } from './styles/board-style';
import { ScreenLightStyle } from './styles/light-style';
import { ScreenListStyle } from './styles/list-style';
import { ScreenMechanicsStyle } from './styles/mechanics-style';
import { WorkshopScreen } from './workshop-screen';

@NgModule({
  declarations: [
    WorkshopScreen,
    AutoScroll,
    ScreenPlate,
    ScreenBoardStyle,
    ScreenLightStyle,
    ScreenListStyle,
    ScreenMechanicsStyle,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild([{ path: '', title: 'Verkstadsskärm', component: WorkshopScreen }]),
  ],
})
export class WorkshopScreenModule {}
