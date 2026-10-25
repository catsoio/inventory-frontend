import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { StorageActionDialog } from './storage-action-dialog/storage-action-dialog';
import { StorageDetail } from './storage-detail/storage-detail';
import { StorageForm } from './storage-form/storage-form';
import { StorageList } from './storage-list/storage-list';
import { StorageOverview } from './storage-overview/storage-overview';
import { StorageRecallDialog } from './storage-recall-dialog/storage-recall-dialog';

@NgModule({
  declarations: [
    StorageList,
    StorageOverview,
    StorageForm,
    StorageDetail,
    StorageActionDialog,
    StorageRecallDialog,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: StorageList },
      { path: 'overview', title: 'Däckhotell: översikt', component: StorageOverview },
      { path: 'new', title: 'Ny inlämning', component: StorageForm },
      { path: ':id', title: 'Inlämning', component: StorageDetail },
      { path: ':id/edit', title: 'Ändra inlämning', component: StorageForm },
    ]),
  ],
})
export class StorageModule {}
