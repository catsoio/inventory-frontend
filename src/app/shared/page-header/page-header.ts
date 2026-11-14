import { Component, input } from '@angular/core';
import type { IsActiveMatchOptions } from '@angular/router';

export interface SectionTab {
  path: string;
  label: string;
  /** Markeras bara på exakt den adressen (annars också på undersidor). */
  exact?: boolean;
}

/** Flikens markering ska inte tappas av filter i adressen (`?category=tyre`). */
const IGNORE = { queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' } as const;

/**
 * Sidhuvudet överst på varje sida som inte är ett kort: vad sidan är (en rubrik, eller flikar när
 * avsnittet har flera vyer) till vänster och vad man kan göra här till höger, med den primära
 * knappen (Ny …) längst till höger. Samma höjd och samma linje på alla sidor, så att knapparna
 * aldrig flyttar sig när man byter flik. Kortsidorna har samma uppbyggnad i `CardPage`.
 *
 * Det som hjälper en att hitta poster (sök, filter, vy) ligger inte här utan i verktygsraden under,
 * se `docs/axle/design.md` i backend-repot. Flikarna är vyer i samma avsnitt; sidomenyn har ett val
 * per avsnitt. På mobil rullar flikraden i sidled, rubriken visas inte (den står i topbaren) och
 * åtgärdsknapparna bestämmer själva om de visas (`max-md:!hidden`).
 */
@Component({
  selector: 'app-page-header',
  standalone: false,
  host: {
    '[class]': 'hostClass()',
  },
  styles: `
    .bar {
      position: relative;
    }
    /* Linjen ligger bakom flikarna, så att den aktiva flikens understreck lägger sig över den. */
    .bar::after {
      content: '';
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      height: 1px;
      background: #e5e7eb;
    }
    nav,
    h1 {
      position: relative;
      z-index: 1;
    }
    .tab.is-active {
      border-color: var(--mat-sys-primary);
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
    nav {
      scrollbar-width: none;
    }
    nav::-webkit-scrollbar {
      display: none;
    }
  `,
  template: `
    <div class="bar mb-4 flex min-h-12 items-stretch gap-3">
      @if (tabs().length) {
        <nav
          class="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto whitespace-nowrap"
          [attr.aria-label]="label()"
        >
          @for (t of tabs(); track t.path) {
            <a
              [routerLink]="t.path"
              [routerLinkActiveOptions]="t.exact ? exactPath : subPath"
              routerLinkActive="is-active"
              class="tab inline-flex shrink-0 items-center border-b-2 border-transparent px-3 text-[15px] font-medium text-gray-600 hover:text-gray-900 md:px-4"
              >{{ t.label }}</a
            >
          }
        </nav>
      } @else {
        <h1 class="flex min-w-0 flex-1 items-center truncate text-xl font-semibold">
          {{ title() }}
        </h1>
      }
      <div class="relative z-[1] flex shrink-0 items-center gap-2 pb-px">
        <ng-content select="[actions]" />
      </div>
    </div>
  `,
})
export class PageHeader {
  readonly exactPath: IsActiveMatchOptions = { ...IGNORE, paths: 'exact' };
  readonly subPath: IsActiveMatchOptions = { ...IGNORE, paths: 'subset' };
  /** Sidans rubrik. Används när avsnittet inte har flera vyer (annars står flikarna här). */
  readonly title = input('');
  readonly tabs = input<SectionTab[]>([]);
  readonly label = input('Avsnitt');
  /** Bara på dator: vyer som är för uppföljning, inte för snabba slag i mobilen. */
  readonly desktopOnly = input(false);
  /** Bara på mobil: på dator ligger sidorna som undermeny i sidomenyn, så flikarna vore en dubblett. */
  readonly mobileOnly = input(false);

  hostClass() {
    if (this.desktopOnly()) return 'block max-md:hidden';
    if (this.mobileOnly()) return 'block md:hidden';
    // En rubrik visas inte på mobil: sidans namn står redan i topbaren.
    return this.tabs().length ? 'block' : 'block max-md:hidden';
  }
}
