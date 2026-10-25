import { Component, input, output } from '@angular/core';

/**
 * En flik i inställningspopupen: förklaring och innehåll. Har avsnittet något att
 * spara visas en stapel längst ned så fort något ändrats ("osparade ändringar" med Ångra och
 * Spara), i stället för en Spara-knapp som alltid står där.
 */
@Component({
  selector: 'app-settings-section',
  standalone: false,
  host: { class: 'block' },
  template: `
    <section>
      <h2 class="sr-only">{{ title() }}</h2>
      @if (text()) {
        <p class="mb-5 max-w-2xl text-sm text-gray-600">{{ text() }}</p>
      }
      <ng-content />
    </section>
    @if (dirty()) {
      <div
        class="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-gray-800 py-2.5 pr-2.5 pl-4 text-white shadow-lg"
        role="status"
      >
        <mat-icon class="!h-5 !w-5 !text-xl text-amber-300">edit_note</mat-icon>
        <span class="min-w-0 flex-1 text-sm">Du har osparade ändringar</span>
        <button
          type="button"
          class="h-10 rounded-lg px-3 text-sm font-medium hover:bg-white/10"
          (click)="discard.emit()"
        >
          Ångra
        </button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="!valid() || busy()"
          (click)="save.emit()"
        >
          {{ saveText() }}
        </button>
      </div>
    }
  `,
})
export class SettingsSection {
  readonly title = input.required<string>();
  readonly text = input('');
  readonly dirty = input(false);
  readonly valid = input(true);
  readonly busy = input(false);
  readonly saveText = input('Spara');
  readonly save = output<void>();
  readonly discard = output<void>();
}
