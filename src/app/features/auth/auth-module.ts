import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { Login } from './login';

@NgModule({
  declarations: [Login],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: Login }])],
})
export class AuthModule {}
