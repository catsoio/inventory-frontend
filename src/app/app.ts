import { Component, inject } from '@angular/core';
import { I18n } from './core/i18n/i18n';

@Component({
  selector: 'app-root',
  standalone: false,
  template: '<router-outlet />',
})
export class App {
  // Startar språkbytet (översätter sidan när engelska är valt).
  protected readonly i18n = inject(I18n);
}
