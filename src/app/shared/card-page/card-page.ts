import { Component, Input } from '@angular/core';

/**
 * Kortet för en post (som ett kort i Business Central): tillbaka till listan, postens nummer,
 * åtgärder uppe till höger och fälten under. Knappar läggs i `<div actions>`.
 */
@Component({
  selector: 'app-card-page',
  standalone: false,
  host: { class: 'block' },
  template: `
    <!-- Headern följer med vid scroll, så att Spara alltid är nåbar. -->
    <header
      class="sticky top-0 z-10 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-gray-50 before:content-[''] -mx-3 -mt-3 mb-4 border-b border-gray-200 bg-gray-50 px-3 py-2 md:-mx-5 md:-mt-5 md:px-5 xl:-mx-6 xl:-mt-6 xl:px-6"
    >
      <div class="mx-auto flex max-w-4xl items-center gap-2">
        <a
          mat-icon-button
          class="shrink-0"
          [routerLink]="listLink"
          [attr.aria-label]="'Tillbaka till ' + listLabel"
        >
          <mat-icon>arrow_back</mat-icon>
        </a>
        <div class="min-w-0 flex-1">
          <div class="truncate text-xs leading-none tracking-wide text-gray-500 uppercase">
            {{ listLabel }}
            @if (code) {
              <span class="ml-1 normal-case tabular-nums">· {{ code }}</span>
            } @else {
              <span class="ml-1 normal-case">· Nytt, nummer tilldelas när du sparar</span>
            }
            @if (archived) {
              <app-pill class="ml-1">Arkiverad</app-pill>
            }
          </div>
          <h1 class="truncate text-xl leading-tight font-semibold md:text-2xl">
            {{ title || newTitle }}
          </h1>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <ng-content select="[actions]" />
        </div>
      </div>
    </header>
    <div class="mx-auto flex max-w-4xl flex-col gap-4 pt-6">
      <ng-content />
    </div>
  `,
})
export class CardPage {
  /** Listan kortet hör till, dit pilen leder. */
  @Input({ required: true }) listLink = '';
  @Input({ required: true }) listLabel = '';
  @Input() title = '';
  /** Rubrik medan kortet är nytt och inte har någon titel än. */
  @Input() newTitle = 'Nytt kort';
  @Input() code: string | null = null;
  @Input() archived = false;
}
