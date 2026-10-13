import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { Trade } from './trade';
import { TradeLedger } from './trade-ledger';

@NgModule({
  declarations: [Trade, TradeLedger],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: TradeLedger },
      { path: 'new', component: Trade },
    ]),
  ],
})
export class TradeModule {}
