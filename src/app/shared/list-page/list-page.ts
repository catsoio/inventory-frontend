import {
  Component,
  ContentChild,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  TemplateRef,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { debounceTime } from 'rxjs';
import type { DtCol } from '../data-table/data-table';

/**
 * Listsidan för en tabell (som en lista i Business Central): rubrik, sökruta, "Ny"-knapp mot
 * tabellens kort och själva tabellen. Sidan som använder den hämtar data och lyssnar på `search`.
 */
@Component({
  selector: 'app-list-page',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      @if (title) {
        <h1 class="mr-2 hidden text-2xl font-semibold md:block">{{ title }}</h1>
      }
      <div class="relative min-w-0 flex-1 md:max-w-md md:min-w-56">
        <mat-icon class="pointer-events-none absolute top-2 left-2 text-gray-400">search</mat-icon>
        <input
          type="search"
          [formControl]="query"
          [placeholder]="searchPlaceholder"
          class="focus:ring-brand h-10 w-full rounded-xl border-0 bg-white pr-3 pl-10 shadow-sm ring-1 ring-gray-200 outline-none focus:ring-2"
        />
      </div>
      @if (archivable) {
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            [checked]="archived"
            (change)="archived = !archived; archivedChange.emit(archived)"
          />
          Visa arkiverade
        </label>
      }
      <span class="flex-1 max-md:hidden"></span>
      @if (newLink) {
        <a
          mat-flat-button
          color="primary"
          [routerLink]="newLink"
          [queryParams]="newQuery"
          class="max-md:!hidden"
        >
          <mat-icon>add</mat-icon> {{ newLabel }}
        </a>
        @if (newFab) {
          <a
            mat-fab
            color="primary"
            [routerLink]="newLink"
            [queryParams]="newQuery"
            [attr.aria-label]="newLabel"
            class="!fixed right-4 bottom-20 z-10 md:!hidden"
            ><mat-icon>add</mat-icon></a
          >
        }
      }
    </div>
    <ng-content />
    <div class="flex min-h-0 flex-1 gap-4">
      <app-data-table
        class="min-h-0 min-w-0 flex-1"
        [columns]="columns"
        [rows]="rows"
        [clickable]="true"
        [accent]="accent"
        [defaultSort]="defaultSort"
        [highlight]="highlight"
        [card]="cardTpl"
        [emptyText]="loading ? 'Laddar…' : emptyText"
        (rowClick)="rowClick.emit($event)"
        (rowDblClick)="rowDblClick.emit($event)"
      >
        <ng-template #cell let-row="row" let-col="col" let-text="text">
          @if (cellTpl) {
            <ng-container
              [ngTemplateOutlet]="cellTpl"
              [ngTemplateOutletContext]="{ row: row, col: col, text: text }"
            />
          } @else {
            {{ text }}
          }
        </ng-template>
      </app-data-table>
      <ng-content select="[detail]" />
    </div>
  `,
})
export class ListPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  /** Sidans rubrik på dator; tom när sidan redan har flikar eller en rubrik i topbaren. */
  @Input() title = '';
  @Input({ required: true }) columns: DtCol[] = [];
  @Input() rows: unknown[] | null = [];
  @Input() loading = false;
  @Input() newLink: string | null = null;
  /** Adressparametrar till "Ny"-knappen, t.ex. `{ kind: 'invoice' }` för en ny faktura. */
  @Input() newQuery: Record<string, string> | null = null;
  @Input() newLabel = 'Ny';
  /** Rund flytande knapp på mobil. Av för listor där det som skapas inte görs i farten. */
  @Input() newFab = true;
  @Input() emptyText = 'Inget hittades.';
  /** Klasser per rad, t.ex. för att markera den valda raden. */
  @Input() accent?: (row: any) => string | null;
  /** Markerar hela raden, t.ex. den som visas i panelen bredvid. */
  @Input() highlight?: (row: any) => boolean;
  @Input() searchPlaceholder = 'Sök…';
  /** Se `DataTable.defaultSort`: standard är nyast först (högsta numret). */
  @Input() defaultSort?: { key: string; dir: 1 | -1 } | null;
  /** Visa kryssrutan "Visa arkiverade". */
  @Input() archivable = false;
  @Output() search = new EventEmitter<string>();
  @Output() archivedChange = new EventEmitter<boolean>();
  @Output() rowClick = new EventEmitter<any>();
  @Output() rowDblClick = new EventEmitter<any>();
  /** Valfri mall för egna celler: `<ng-template #cell let-row="row" let-col="col" let-text="text">`. */
  @ContentChild('cell') cellTpl?: TemplateRef<unknown>;
  /** Valfritt eget kort för mobilen: `<ng-template #card let-row="row">`. */
  @ContentChild('card') cardTpl?: TemplateRef<unknown>;

  readonly query = new FormControl('', { nonNullable: true });
  archived = false;

  ngOnInit() {
    // Första sökningen direkt, därefter när man slutat skriva en stund.
    this.search.emit('');
    this.query.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => this.search.emit(q.trim()));
  }
}
