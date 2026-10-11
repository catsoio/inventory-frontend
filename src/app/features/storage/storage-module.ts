import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { StorageActionDialog } from './storage-action-dialog/storage-action-dialog';
import { StorageDetail } from './storage-detail/storage-detail';
import { StorageForm } from './storage-form/storage-form';
import { StorageList } from './storage-list/storage-list';

@NgModule({
  declarations: [StorageList, StorageForm, StorageDetail, StorageActionDialog],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: '', component: StorageList },
      { path: 'new', title: 'Ny inlämning', component: StorageForm },
      { path: ':id', title: 'Inlämning', component: StorageDetail },
      { path: ':id/edit', title: 'Ändra inlämning', component: StorageForm },
    ]),
  ],
})
export class StorageModule {}
