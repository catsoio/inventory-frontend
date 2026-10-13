import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: false,
  template: '<router-outlet /><app-billing-banner />',
})
export class App {}
