import { Component, Input, signal } from '@angular/core';

/** Samma uppgifter som diagrammet, som tabell (diagrammets tvilling för den som inte ser färger). */
export interface PanelTable {
  head: string[];
  rows: (string | number)[][];
}

/**
 * Ett kort på en översiktssida: rubrik, förklarande rad och innehållet under. Har kortet en
 * `table` får det en knapp som byter diagrammet mot en tabell med samma värden. Medan data
 * laddas om dämpas kortet i stället för att byggas om, så inget hoppar.
 */
@Component({
  selector: 'app-panel',
  standalone: false,
  host: { class: 'block min-w-0' },
  template: `
    <section
      class="flex h-full min-w-0 flex-col rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition-opacity"
      [class.opacity-60]="loading"
    >
      @if (title) {
        <header class="mb-3 flex items-start gap-2">
          <div class="min-w-0 flex-1">
            <h2 class="flex items-center gap-2 text-sm font-semibold">
              @if (icon) {
                <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-gray-400">{{ icon }}</mat-icon>
              }
              <span class="truncate">{{ title }}</span>
            </h2>
            @if (subtitle) {
              <p class="mt-0.5 text-xs text-gray-500">{{ subtitle }}</p>
            }
          </div>
          <ng-content select="[actions]" />
          @if (table && !empty) {
            <button
              type="button"
              class="-my-1 -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 max-md:hidden"
              [class.text-brand]="asTable()"
              [attr.aria-pressed]="asTable()"
              [attr.aria-label]="asTable() ? 'Visa diagram' : 'Visa som tabell'"
              [title]="asTable() ? 'Visa diagram' : 'Visa som tabell'"
              (click)="asTable.set(!asTable())"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{
                asTable() ? 'bar_chart' : 'table_rows'
              }}</mat-icon>
            </button>
          }
        </header>
      }
      @if (empty) {
        <p class="py-8 text-center text-sm text-gray-500">{{ emptyText }}</p>
      }
      <div class="min-h-0 flex-1" [class.hidden]="empty || (asTable() && table)">
        <ng-content />
      </div>
      @if (asTable() && table && !empty) {
        <div class="max-h-72 overflow-auto">
          <table class="w-full border-collapse text-sm">
            <thead class="sticky top-0 bg-white text-xs text-gray-500">
              <tr>
                @for (h of table.head; track $index) {
                  <th
                    class="border-b border-gray-200 px-2 py-1.5 font-medium"
                    [class]="align($index)"
                  >
                    {{ h }}
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of table.rows; track $index) {
                <tr class="border-b border-gray-100 last:border-0">
                  @for (c of r; track $index) {
                    <td class="px-2 py-1.5 tabular-nums" [class]="align($index)">{{ c }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class Panel {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() icon = '';
  @Input() loading = false;
  /** Inget att visa än: texten ersätter innehållet i stället för ett tomt diagram. */
  @Input() empty = false;
  @Input() emptyText = 'Inget att visa än.';
  @Input() table: PanelTable | null = null;
  readonly asTable = signal(false);

  /** Första kolumnen är etiketten, resten är tal. */
  align(i: number) {
    return i === 0 ? 'text-left' : 'text-right';
  }
}
