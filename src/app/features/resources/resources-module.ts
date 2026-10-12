import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { ResourceCard } from './resource-card/resource-card';
import { ResourceList } from './resource-list/resource-list';

@NgModule({
  declarations: [ResourceList, ResourceCard],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: ResourceList },
      { path: 'new', title: 'Ny mekaniker eller plats', component: ResourceCard },
      { path: ':id', title: 'Mekaniker eller plats', component: ResourceCard },
    ]),
  ],
})
export class ResourcesModule {}
