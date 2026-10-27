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
 * Flikraden överst i ett avsnitt: vyerna i samma avsnitt (Arbetsorder och Kostnadsförslag,
 * Översikt och Fakturor under Ekonomi). Sidomenyn har ett val per avsnitt; det som hör ihop ligger
 * här i stället för som ännu en menypost. På mobil rullar raden i sidled.
 */
@Component({
  selector: 'app-section-tabs',
  standalone: false,
  host: {
    '[class]': "desktopOnly() ? 'block max-md:hidden' : mobileOnly() ? 'block md:hidden' : 'block'",
  },
  styles: `
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
    <nav
      class="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200 whitespace-nowrap"
      [attr.aria-label]="label()"
    >
      @for (t of tabs(); track t.path) {
        <a
          [routerLink]="t.path"
          [routerLinkActiveOptions]="t.exact ? exactPath : subPath"
          routerLinkActive="is-active"
          class="tab -mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-[15px] font-medium text-gray-600 hover:text-gray-900 md:px-4"
          >{{ t.label }}</a
        >
      }
    </nav>
  `,
})
export class SectionTabs {
  readonly exactPath: IsActiveMatchOptions = { ...IGNORE, paths: 'exact' };
  readonly subPath: IsActiveMatchOptions = { ...IGNORE, paths: 'subset' };
  readonly tabs = input.required<SectionTab[]>();
  readonly label = input('Avsnitt');
  /** Bara på dator: vyer som är för uppföljning, inte för snabba slag i mobilen. */
  readonly desktopOnly = input(false);
  /** Bara på mobil: på dator ligger sidorna som undermeny i sidomenyn, så flikarna vore en dubblett. */
  readonly mobileOnly = input(false);
}
