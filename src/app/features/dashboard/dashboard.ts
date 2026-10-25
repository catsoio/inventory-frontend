import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { HomeData } from './home-data';

const MOBILE = '(max-width: 767.98px)';

/**
 * Hem. Dator och mobil är två olika sidor, inte samma sida i olika storlek: dator visar dagen,
 * orderflödet och diagram för uppföljning; mobil visar det man gör i farten. Båda delar samma
 * data (`HomeData`), så ett byte av fönsterstorlek hämtar inget på nytt.
 */
@Component({
  selector: 'app-dashboard',
  standalone: false,
  providers: [HomeData],
  host: { class: 'block' },
  template: `
    @if (mobile()) {
      <app-home-mobile />
    } @else {
      <app-home-desktop />
    }
  `,
})
export class Dashboard {
  readonly mobile = toSignal(
    inject(BreakpointObserver)
      .observe(MOBILE)
      .pipe(map((r) => r.matches)),
    { initialValue: window.matchMedia(MOBILE).matches },
  );
}
