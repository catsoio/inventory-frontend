import { Component, Input } from '@angular/core';

/**
 * Kortet för en post (som ett kort i Business Central): tillbaka till listan, postens nummer,
 * åtgärder uppe till höger och fälten under. Knappar läggs i `<div actions>`.
 */
@Component({
  selector: 'app-card-page',
  standalone: false,
  template: `
    <div class="mx-auto flex max-w-4xl flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <a mat-icon-button [routerLink]="listLink" [attr.aria-label]="'Tillbaka till ' + listLabel">
          <mat-icon>arrow_back</mat-icon>
        </a>
        <div>
          <div class="text-xs tracking-wide text-gray-500 uppercase">{{ listLabel }}</div>
          <h1 class="text-2xl leading-tight font-semibold">{{ title || newTitle }}</h1>
        </div>
        @if (code) {
          <span class="ml-1 rounded-full bg-gray-200 px-3 py-0.5 text-sm font-medium tabular-nums">
            {{ code }}
          </span>
        } @else {
          <span class="ml-1 text-sm text-gray-500">Nytt kort · nummer tilldelas när du sparar</span>
        }
        @if (archived) {
          <app-pill>Arkiverad</app-pill>
        }
        <span class="flex-1"></span>
        <ng-content select="[actions]" />
      </div>
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
