import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { Onboarding } from './onboarding';

@NgModule({
  declarations: [Onboarding],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: Onboarding }])],
})
export class OnboardingModule {}
