import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { PublicCarList, PublicCarPage, PublicSite } from './public-site';

/**
 * Verkstadens publika webbplats (bilarna till salu). Når man den på plattformen (`/bilhandel/<slug>`)
 * eller på en egen domän (`/`), utan inloggning.
 */
@NgModule({
  declarations: [PublicSite, PublicCarList, PublicCarPage],
  imports: [
    SharedModule,
    RouterModule.forChild([
      {
        path: '',
        component: PublicSite,
        children: [
          { path: '', title: 'Bilar till salu', component: PublicCarList },
          { path: 'bil/:id', title: 'Bil till salu', component: PublicCarPage },
        ],
      },
    ]),
  ],
})
export class PublicSiteModule {}
