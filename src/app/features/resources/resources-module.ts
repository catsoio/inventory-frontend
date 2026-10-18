import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { unsavedGuard } from '../../core/unsaved-guard';
import { SharedModule } from '../../shared/shared-module';
import { ResourceCard } from './resource-card/resource-card';
import { ResourceList } from './resource-list/resource-list';

@NgModule({
  declarations: [ResourceList, ResourceCard],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: ResourceList },
      {
        path: 'new',
        title: 'Ny mekaniker eller plats',
        component: ResourceCard,
        canDeactivate: [unsavedGuard],
      },
      {
        path: ':id',
        title: 'Mekaniker eller plats',
        component: ResourceCard,
        canDeactivate: [unsavedGuard],
      },
    ]),
  ],
})
export class ResourcesModule {}
