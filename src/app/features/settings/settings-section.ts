import { Component, input, output } from '@angular/core';

/**
 * Innehållet på en inställningssida. Har sidan något att spara visas en stapel längst ned så fort
 * något ändrats ("osparade ändringar" med Ångra och Spara), i stället för en Spara-knapp som alltid
 * står där. Sidans rubrik och förklaring kommer från popupen (`settings.ts`).
 */
@Component({
  selector: 'app-settings-section',
  standalone: false,
  host: { class: 'block' },
  template: `
    <ng-content />
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
  readonly dirty = input(false);
  readonly valid = input(true);
  readonly busy = input(false);
  readonly saveText = input('Spara');
  readonly save = output<void>();
  readonly discard = output<void>();
}
