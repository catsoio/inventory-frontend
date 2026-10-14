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
    <div
      class="mb-1 flex shrink-0 items-center justify-end gap-1 text-sm text-gray-500 max-md:hidden"
    >
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
    <div
      class="min-h-0 overflow-auto rounded-xl bg-white shadow-sm [-webkit-overflow-scrolling:touch] max-md:hidden"
      [class]="scrollClass"
    >
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
                    class="w-full min-w-16 rounded-lg border bg-white px-2 py-1 text-sm text-gray-900"
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
              class="h-12 md:h-11"
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
    <!-- Mobil: varje rad blir ett kort (första kolumnen som rubrik, resten som etikett och värde). -->
    <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pb-24 md:hidden">
      @for (r of view(); track $index) {
        <div
          class="rounded-xl border-l-4 border-transparent bg-white p-3 text-left shadow-sm active:bg-brand-soft"
          [ngClass]="accent ? (accent(r) ?? '') : ''"
          [attr.role]="clickable ? 'button' : null"
          [attr.tabindex]="clickable ? 0 : null"
          (click)="clickable && rowClick.emit(r)"
          (keydown.enter)="clickable && rowClick.emit(r)"
        >
          @if (colsSig()[0]; as first) {
            <div class="flex items-start justify-between gap-2 text-base font-semibold">
              <span class="min-w-0">
                @if (cell) {
                  <ng-container
                    [ngTemplateOutlet]="cell"
                    [ngTemplateOutletContext]="{ row: r, col: first, text: text(r, first) }"
                  />
                } @else {
                  {{ text(r, first) }}
                }
              </span>
              @if (clickable) {
                <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-gray-300">chevron_right</mat-icon>
              }
            </div>
          }
          <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            @for (c of colsSig().slice(1); track c.key) {
              @if (filled(r, c)) {
                <div class="min-w-0">
                  <div class="text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                    {{ c.label }}
                  </div>
                  <div class="truncate">
                    @if (cell) {
                      <ng-container
                        [ngTemplateOutlet]="cell"
                        [ngTemplateOutletContext]="{ row: r, col: c, text: text(r, c) }"
                      />
                    } @else {
                      {{ text(r, c) }}
                    }
                  </div>
                </div>
              }
            }
          </div>
        </div>
      } @empty {
        <p class="rounded-xl bg-white px-3 py-8 text-center text-gray-500 shadow-sm">
          {{ emptyText }}
        </p>
      }
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

  /** Tomma värden hoppas över i mobilens kort. */
  filled(r: any, c: DtCol): boolean {
    const t = this.text(r, c).trim();
    return t !== '' && t !== '–' && t !== '-';
  }

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
