import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { TowCard } from './tow-card';
import { TowHome } from './tow-home';
import { TowList } from './tow-list';

@NgModule({
  declarations: [TowHome, TowList, TowCard],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: TowList },
      { path: 'home', title: 'Bärgning: hem', component: TowHome, data: { reuse: true } },
      { path: 'new', title: 'Nytt uppdrag', component: TowCard, canDeactivate: [unsavedGuard] },
      { path: ':id', title: 'Bärgning', component: TowCard, canDeactivate: [unsavedGuard] },
    ]),
  ],
})
export class TowingModule {}
