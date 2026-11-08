import { Component, input } from '@angular/core';

/**
 * Byggstenarna för alla inställningssidor, så att samma sorts val alltid ser likadana ut:
 *  - av/på: `mat-slide-toggle` i en rad
 *  - val mellan få alternativ: `mat-button-toggle-group` (segmenterat) i en rad
 *  - siffra eller kort text: litet fält med enhet (`matTextSuffix`) i en rad
 *  - många alternativ: `mat-select` i en rad
 *  - uppgifter som skrivs (namn, adress): `form`-grupp med fält som har etikett
 * Knappar: fylld = sidans huvudhandling, kantad = vanlig handling, text = liten handling i en rad.
 */

/** Ett kort med rubrik. Rader (`app-setting-row`) skiljs av linjer; `form` ger ett luftigt kort för fält med etikett. */
@Component({
  selector: 'app-setting-group',
  standalone: false,
  host: { class: 'mb-5 block' },
  template: `
    <section class="rounded-xl border border-gray-200 bg-white">
      @if (title()) {
        <header class="border-b border-gray-100 px-4 py-3">
          <h3 class="m-0 text-[15px] font-semibold">{{ title() }}</h3>
          @if (text()) {
            <p class="m-0 mt-0.5 text-sm text-gray-500">{{ text() }}</p>
          }
        </header>
      }
      <div [class]="form() ? 'p-4' : 'divide-y divide-gray-100 px-4'">
        <ng-content />
      </div>
    </section>
  `,
})
export class SettingGroup {
  readonly title = input('');
  readonly text = input('');
  readonly form = input(false);
}

/** En inställning: namn och förklaring till vänster, kontrollen till höger (under på mobil). */
@Component({
  selector: 'app-setting-row',
  standalone: false,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-6">
      <div class="min-w-0 flex-1">
        <div class="text-[15px] font-medium">{{ label() }}</div>
        @if (hint()) {
          <div class="mt-0.5 text-sm text-gray-500">{{ hint() }}</div>
        }
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        <ng-content />
      </div>
    </div>
  `,
})
export class SettingRow {
  readonly label = input.required<string>();
  readonly hint = input('');
}
