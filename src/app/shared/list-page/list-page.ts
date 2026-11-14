import {
  Component,
  ContentChild,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  TemplateRef,
  contentChild,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { debounceTime } from 'rxjs';
import { DataTable, type DtCol } from '../data-table/data-table';
import type { SectionTab } from '../page-header/page-header';
import { Summary } from '../toolbar/summary';

/**
 * Listsidan för en tabell (som en lista i Business Central). Uppbyggnaden är samma på alla listor,
 * se `docs/axle/design.md`:
 *
 * 1. Sidhuvud (`app-page-header`): rubrik eller flikar, sekundära knappar (`[actions]`) och den
 *    primära "Ny …"-knappen längst till höger.
 * 2. Verktygsrad: sökrutan, sidans filter (`[filters]`: ett segmenterat val och `app-filter-button`),
 *    och längst till höger tabellens verktyg (`[tools]`, kolumnfilter).
 * 3. Sammanfattning (`app-summary`): vad man tittar på. Saknas den visas antalet rader.
 * 4. Tabellen, och en detaljpanel bredvid den (`[detail]`).
 *
 * Det som inte hör hemma i någon av dem (en varning, `app-callout`) läggs som vanligt innehåll och
 * hamnar mellan sammanfattningen och tabellen. Sidan som använder den hämtar data och lyssnar på `search`.
 */
@Component({
  selector: 'app-list-page',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    @if (hasHeader()) {
      <app-page-header
        [title]="title"
        [tabs]="tabs"
        [label]="tabsLabel"
        [desktopOnly]="tabs.length > 0 && tabsDesktopOnly"
      >
        <div actions class="contents">
          <ng-content select="[actions]" />
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
          } @else if (newButton) {
            <button
              mat-flat-button
              color="primary"
              type="button"
              class="max-md:!hidden"
              (click)="newClick.emit()"
            >
              <mat-icon>add</mat-icon> {{ newLabel }}
            </button>
          }
        </div>
      </app-page-header>
    }
    @if (newLink && newFab) {
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
    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      <app-search-field
        class="w-full md:w-80"
        [control]="query"
        [placeholder]="searchPlaceholder"
      />
      <ng-content select="[filters]" />
      @if (archivable) {
        <button
          mat-stroked-button
          type="button"
          [class.is-on]="archived"
          (click)="toggleArchived()"
        >
          <mat-icon>{{ archived ? 'check' : 'inventory_2' }}</mat-icon> Visa arkiverade
        </button>
      }
      <span class="flex-1 max-md:hidden"></span>
      <ng-content select="[tools]" />
      <button
        mat-stroked-button
        type="button"
        class="btn-icon max-md:!hidden"
        title="Filtrera per kolumn"
        aria-label="Filtrera per kolumn"
        [class.is-on]="table()?.showFilters()"
        (click)="table()?.showFilters.set(!table()?.showFilters())"
      >
        <mat-icon>filter_alt</mat-icon>
      </button>
    </div>
    <ng-content select="app-summary" />
    @if (!customSummary() && !loading) {
      <app-summary class="max-md:!hidden">
        {{ table()?.view()?.length ?? rowCount()
        }}{{ table()?.filtered() ? ' av ' + rowCount() : '' }} rader
      </app-summary>
    }
    <ng-content />
    <div class="flex min-h-0 flex-1 gap-4">
      <app-data-table
        class="min-h-0 min-w-0 flex-1"
        [chrome]="false"
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

  /** Sidans rubrik på dator (syns inte på mobil, där namnet står i topbaren). */
  @Input() title = '';
  /** Flikar i stället för rubrik när avsnittet har flera vyer (`STOCK_TABS` m.fl.). */
  @Input() tabs: SectionTab[] = [];
  @Input() tabsLabel = 'Avsnitt';
  /** Flikarna visas bara på dator (vyer för uppföljning). Av när de ska synas på mobil också. */
  @Input() tabsDesktopOnly = true;
  @Input({ required: true }) columns: DtCol[] = [];
  @Input() rows: unknown[] | null = [];
  @Input() loading = false;
  @Input() newLink: string | null = null;
  /** Adressparametrar till "Ny"-knappen, t.ex. `{ kind: 'invoice' }` för en ny faktura. */
  @Input() newQuery: Record<string, string> | null = null;
  @Input() newLabel = 'Ny';
  /** "Ny"-knapp som gör något på sidan (öppnar en dialog) i stället för att gå till `newLink`; svaret är `newClick`. */
  @Input() newButton = false;
  @Output() newClick = new EventEmitter<void>();
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
  readonly table = viewChild(DataTable);
  /** Sidan har lagt en egen sammanfattning (`<app-summary>`); annars visas antalet rader. */
  readonly customSummary = contentChild(Summary);

  hasHeader() {
    return !!(this.title || this.tabs.length || this.newLink || this.newButton);
  }

  rowCount() {
    return this.rows?.length ?? 0;
  }

  toggleArchived() {
    this.archived = !this.archived;
    this.archivedChange.emit(this.archived);
  }

  ngOnInit() {
    // Första sökningen direkt, därefter när man slutat skriva en stund.
    this.search.emit('');
    this.query.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => this.search.emit(q.trim()));
  }
}
