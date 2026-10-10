import {
  Component,
  ContentChild,
  EventEmitter,
  Input,
  Output,
  TemplateRef,
  computed,
  signal,
} from '@angular/core';

export interface DtCol<T = any> {
  key: string;
  label: string;
  right?: boolean;
  value: (r: T) => string | number;
  fmt?: (r: T) => string;
}

@Component({
  selector: 'app-data-table',
  standalone: false,
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    <div class="mb-1 flex shrink-0 items-center justify-end gap-1 text-sm text-gray-500">
      <span> {{ view().length }}{{ filtered() ? ' av ' + rowsSig().length : '' }} rader </span>
      <button
        mat-icon-button
        title="Filtrera per kolumn"
        [class.text-brand]="showFilters()"
        (click)="showFilters.set(!showFilters())"
      >
        <mat-icon>filter_alt</mat-icon>
      </button>
    </div>
    <div class="min-h-0 overflow-auto rounded-xl bg-white shadow-sm" [class]="scrollClass">
      <table class="w-full border-collapse text-left text-sm">
        <thead
          class="sticky top-0 z-10 border-b border-gray-100 bg-white text-xs font-medium tracking-wide text-gray-500 uppercase"
        >
          <tr>
            @for (c of colsSig(); track c.key) {
              <th
                class="cursor-pointer px-3 py-2 whitespace-nowrap select-none hover:text-gray-900"
                [class.text-right]="c.right"
                (click)="sortBy(c.key)"
              >
                {{ c.label }}{{ arrow(c.key) }}
              </th>
            }
          </tr>
          @if (showFilters()) {
            <tr>
              @for (c of colsSig(); track c.key) {
                <th class="px-2 pb-2 font-normal">
                  <input
                    class="w-full min-w-16 rounded border bg-white px-2 py-1 text-sm text-gray-900"
                    [class.text-right]="c.right"
                    placeholder="Filter"
                    [value]="filters()[c.key] ?? ''"
                    (input)="setFilter(c.key, $any($event.target).value)"
                  />
                </th>
              }
            </tr>
          }
        </thead>
        <tbody class="divide-y divide-gray-100">
          @for (r of view(); track $index) {
            <tr
              class="h-11"
              [class]="clickable ? 'cursor-pointer hover:bg-brand-soft' : 'hover:bg-gray-50'"
              (click)="clickable && rowClick.emit(r)"
            >
              @for (c of colsSig(); track c.key; let first = $first) {
                <td
                  class="px-3 whitespace-nowrap"
                  [class.text-right]="c.right"
                  [class.border-l-4]="first && !!accent"
                  [class]="first && accent ? (accent(r) ?? '') : ''"
                >
                  @if (cell) {
                    <ng-container
                      [ngTemplateOutlet]="cell"
                      [ngTemplateOutletContext]="{ row: r, col: c, text: text(r, c) }"
                    />
                  } @else {
                    {{ text(r, c) }}
                  }
                </td>
              }
            </tr>
          } @empty {
            <tr>
              <td [attr.colspan]="colsSig().length" class="px-3 py-8 text-center text-gray-500">
                {{ emptyText }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class DataTable {
  readonly colsSig = signal<DtCol[]>([]);
  readonly rowsSig = signal<any[]>([]);

  @Input({ required: true }) set columns(v: DtCol[]) {
    this.colsSig.set(v);
  }
  @Input({ required: true }) set rows(v: any[] | null | undefined) {
    this.rowsSig.set(v ?? []);
  }
  @Input() emptyText = 'Inga rader.';
  /** Färgad kant på radens första cell, t.ex. 'border-red-500' (som i artikellistan). */
  @Input() accent?: (row: any) => string | null;
  @Input() clickable = false;
  // Standard: fyller tillgänglig höjd. Skicka t.ex. 'max-h-96' för en fast maxhöjd.
  @Input() scrollClass = 'flex-1';
  @Output() rowClick = new EventEmitter<any>();
  @ContentChild('cell') cell?: TemplateRef<unknown>;

  readonly showFilters = signal(false);
  readonly filters = signal<Record<string, string>>({});
  readonly sort = signal<{ key: string; dir: 1 | -1 } | null>(null);

  readonly filtered = computed(() => Object.values(this.filters()).some((v) => v.trim()));
  readonly view = computed(() => {
    const cols = this.colsSig();
    const f = Object.entries(this.filters()).filter(([, v]) => v.trim());
    let rows = this.rowsSig();
    if (f.length) {
      rows = rows.filter((r) =>
        f.every(([k, v]) => {
          const c = cols.find((x) => x.key === k);
          return c ? this.text(r, c).toLowerCase().includes(v.trim().toLowerCase()) : true;
        }),
      );
    }
    const s = this.sort();
    const col = s && cols.find((c) => c.key === s.key);
    if (!s || !col) return rows;
    return [...rows].sort((a, b) => {
      const x = col.value(a);
      const y = col.value(b);
      return (
        (typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'sv', { numeric: true })) * s.dir
      );
    });
  });

  text(r: any, c: DtCol): string {
    return c.fmt ? c.fmt(r) : String(c.value(r) ?? '');
  }

  setFilter(key: string, value: string) {
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  sortBy(key: string) {
    this.sort.update((s) =>
      s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 },
    );
  }

  arrow(key: string) {
    const s = this.sort();
    return s?.key === key ? (s.dir === 1 ? ' ▲' : ' ▼') : '';
  }
}
