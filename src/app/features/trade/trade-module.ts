import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { Trade } from './trade';

@NgModule({
  declarations: [Trade],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: Trade }])],
})
export class TradeModule {}
