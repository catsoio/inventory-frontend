import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { PublicDocumentPage } from './public-document';

@NgModule({
  declarations: [PublicDocumentPage],
  imports: [
    SharedModule,
    RouterModule.forChild([{ path: '', title: 'Dokument', component: PublicDocumentPage }]),
  ],
})
export class PublicDocumentModule {}
