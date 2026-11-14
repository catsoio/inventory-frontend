import { Component, input, output } from '@angular/core';

/**
 * "Filter": allt utöver sidans huvudval (ett segmenterat val i verktygsraden) ligger bakom den här
 * knappen, med en siffra för hur många filter som är påslagna. Innehållet är fritt (rubrik `.sec`
 * och `app-segmented [fill]` per grupp, kryssrutor); panelen stängs inte av klick inuti den.
 * Sidan räknar själv `count` och nollar filtren i `(clear)`.
 *
 * Är något filter på syns det även utanför panelen: knappen får primärfärg och siffra, och
 * sammanfattningen under verktygsraden kan lista dem.
 */
@Component({
  selector: 'app-filter-button',
  standalone: false,
  host: { class: 'inline-block' },
  template: `
    <button
      mat-stroked-button
      type="button"
      [class.is-on]="count() > 0"
      [matMenuTriggerFor]="panel"
      aria-haspopup="dialog"
    >
      <mat-icon>filter_list</mat-icon>
      {{ label() }}
      @if (count() > 0) {
        <span
          class="bg-brand ml-2 grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs leading-none font-semibold text-white"
          >{{ count() }}</span
        >
      }
    </button>
    <mat-menu #panel="matMenu">
      <div
        class="flex w-96 max-w-[85vw] flex-col gap-4 p-4"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()"
      >
        <ng-content />
        @if (count() > 0) {
          <button mat-button type="button" class="self-start" (click)="clear.emit()">
            Rensa filter
          </button>
        }
      </div>
    </mat-menu>
  `,
})
export class FilterButton {
  /** Hur många filter som är påslagna just nu. */
  readonly count = input(0);
  readonly label = input('Filter');
  readonly clear = output<void>();
}
