import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { RegisterHub } from './register-hub';

@NgModule({
  declarations: [RegisterHub],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: RegisterHub }])],
})
export class RegisterModule {}
