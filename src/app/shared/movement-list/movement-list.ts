import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { InventoryApi } from '../../core/api/inventory-api';
import { MOVEMENT_LABELS, Movement, MovementType } from '../../core/models';
import { DtCol } from '../data-table/data-table';
import { KrPipe } from '../kr-pipe';

const TYPE_CLS: Record<MovementType, string> = {
  purchase: 'bg-blue-100 text-blue-800',
  sale: 'bg-green-100 text-green-800',
  customer_return: 'bg-purple-100 text-purple-800',
  write_off: 'bg-red-100 text-red-800',
  adjustment: 'bg-gray-200 text-gray-800',
};

const kr = new KrPipe();
const unit = (m: Movement) => m.unitPrice ?? m.unitCost ?? null;
const when = (m: Movement) =>
  new Date(m.createdAt).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

@Component({
  selector: 'app-movement-list',
  standalone: false,
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    @if (compact) {
      <div class="flex flex-col">
        @for (m of items(); track m.id) {
          <div class="flex items-center gap-3 py-2.5 text-sm">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              [class]="typeCls[m.type]"
              ><mat-icon class="!h-5 !w-5 !text-xl">{{ icons[m.type] }}</mat-icon></span
            >
            <div class="min-w-0 flex-1">
              <div class="font-medium">{{ labels[m.type] }} · {{ m.quantity }} st</div>
              <div class="truncate text-gray-500">
                @if (m.articleLabel ?? m.label) {
                  {{ m.articleLabel ?? m.label }}
                }
              </div>
            </div>
            <span class="shrink-0 text-xs text-gray-400">{{
              m.createdAt | date: 'd MMM HH:mm'
            }}</span>
          </div>
        } @empty {
          <div class="py-2 text-sm text-gray-500">
            {{ loading() ? 'Laddar…' : 'Inga händelser.' }}
          </div>
        }
      </div>
    } @else {
      <app-data-table
        [columns]="colsList"
        [rows]="items()"
        [scrollClass]="scrollClass"
        [emptyText]="loading() ? 'Laddar…' : 'Inga lagerhändelser.'"
      >
        <ng-template #cell let-m="row" let-c="col" let-text="text">
          @if (c.key === 'type') {
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="badge(m.type)">{{
              text
            }}</span>
          } @else {
            {{ text }}
          }
        </ng-template>
      </app-data-table>
      @if (hasNext()) {
        <button
          mat-stroked-button
          class="mt-3 self-start"
          (click)="load(false)"
          [disabled]="loading()"
        >
          Visa fler
        </button>
      }
    }
  `,
})
export class MovementList implements OnChanges {
  private readonly api = inject(InventoryApi);
  @Input() articleId?: string;
  @Input() type?: MovementType;
  @Input() from?: string;
  @Input() to?: string;
  @Input() compact = false;
  @Input() pageSize = 50;
  @Input() reloadKey?: unknown;
  @Input() scrollClass = 'flex-1';

  readonly labels = MOVEMENT_LABELS;
  readonly typeCls = TYPE_CLS;
  readonly icons: Record<MovementType, string> = {
    purchase: 'move_to_inbox',
    sale: 'sell',
    customer_return: 'undo',
    write_off: 'delete_sweep',
    adjustment: 'fact_check',
  };
  readonly items = signal<Movement[]>([]);
  readonly hasNext = signal(false);
  readonly loading = signal(false);

  colsList: DtCol<Movement>[] = [];

  badge(t: string) {
    return TYPE_CLS[t as MovementType];
  }

  private buildCols(): DtCol<Movement>[] {
    const cols: DtCol<Movement>[] = [
      { key: 'date', label: 'Datum', value: (m) => m.createdAt, fmt: when },
      {
        key: 'type',
        label: 'Typ',
        value: (m) => MOVEMENT_LABELS[m.type],
        fmt: (m) => MOVEMENT_LABELS[m.type],
      },
    ];
    if (!this.articleId) {
      cols.push({
        key: 'article',
        label: 'Artikel',
        value: (m) => m.articleLabel ?? m.label ?? '',
      });
    }
    cols.push(
      { key: 'qty', label: 'Antal', right: true, value: (m) => m.quantity },
      {
        key: 'unit',
        label: 'Pris/st',
        right: true,
        value: (m) => unit(m) ?? 0,
        fmt: (m) => (unit(m) == null ? '–' : kr.transform(unit(m))),
      },
      {
        key: 'sum',
        label: 'Summa',
        right: true,
        value: (m) => (unit(m) ?? 0) * m.quantity,
        fmt: (m) => (unit(m) == null ? '–' : kr.transform(unit(m)! * m.quantity)),
      },
      {
        key: 'balance',
        label: 'Saldo',
        right: true,
        value: (m) => m.balanceAfter ?? 0,
        fmt: (m) => String(m.balanceAfter ?? '–'),
      },
      {
        key: 'ref',
        label: 'Referens',
        value: (m) => m.reference ?? '',
        fmt: (m) => m.reference || '–',
      },
      { key: 'note', label: 'Anteckning', value: (m) => m.note ?? '', fmt: (m) => m.note || '–' },
    );
    return cols;
  }

  ngOnChanges() {
    this.colsList = this.buildCols();
    this.load(true);
  }

  load(reset: boolean) {
    const offset = reset ? 0 : this.items().length;
    const q = { type: this.type, from: this.from, to: this.to, limit: this.pageSize, offset };
    this.loading.set(true);
    (this.articleId
      ? this.api.articleMovements(this.articleId, q)
      : this.api.movements(q)
    ).subscribe({
      next: (p) => {
        this.items.update((cur) => (reset ? p.items : [...cur, ...p.items]));
        this.hasNext.set(p.pagination.hasNextPage);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
