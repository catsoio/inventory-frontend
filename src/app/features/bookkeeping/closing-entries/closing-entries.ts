import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { ClosingApi } from '../../../core/api/closing-api';
import {
  CATEGORY_LABELS,
  Category,
  ClosingEntryKind,
  MOVEMENT_LABELS,
  MovementType,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
} from '../../../core/models';
import { DtCol } from '../../../shared/data-table/data-table';
import { KrPipe } from '../../../shared/kr-pipe';
import { dateTimeText, dayText } from '../bookkeeping-format';

const kr = new KrPipe();
type Row = Record<string, any>;

const FILTERS: Record<ClosingEntryKind, [string, string][]> = {
  line: Object.entries(CATEGORY_LABELS),
  movement: Object.entries(MOVEMENT_LABELS),
  deposit: [
    ['paid', 'Betalda i perioden'],
    ['removed', 'Raderade vid nollställning'],
  ],
};

const COLUMNS: Record<ClosingEntryKind, DtCol<Row>[]> = {
  line: [
    { key: 'label', label: 'Artikel', value: (r) => r['label'] },
    { key: 'code', label: 'Art.nr', value: (r) => r['code'] ?? r['sku'] ?? '', fmt: (r) => r['code'] || r['sku'] || '–' },
    {
      key: 'category',
      label: 'Typ',
      value: (r) => r['category'] ?? '',
      fmt: (r) => CATEGORY_LABELS[r['category'] as Category] ?? '–',
    },
    { key: 'open', label: 'Ingående', right: true, value: (r) => r['openingQty'] },
    { key: 'in', label: 'Inköpt', right: true, value: (r) => r['receivedQty'] },
    { key: 'sold', label: 'Sålt', right: true, value: (r) => r['soldQty'] },
    { key: 'ret', label: 'Retur', right: true, value: (r) => r['returnedQty'] },
    { key: 'wo', label: 'Kasserat', right: true, value: (r) => r['writtenOffQty'] },
    { key: 'adj', label: 'Inventerat', right: true, value: (r) => r['adjustedQty'] },
    { key: 'close', label: 'Utgående', right: true, value: (r) => r['closingQty'] },
    {
      key: 'avg',
      label: 'Snittpris',
      right: true,
      value: (r) => r['avgCost'],
      fmt: (r) => kr.transform(r['avgCost']),
    },
    {
      key: 'value',
      label: 'Värde',
      right: true,
      value: (r) => r['closingValue'],
      fmt: (r) => kr.transform(r['closingValue']),
    },
    {
      key: 'diff',
      label: 'Avvikelse',
      right: true,
      value: (r) => r['unledgeredQty'],
      fmt: (r) => (r['unledgeredQty'] ? String(r['unledgeredQty']) : '–'),
    },
  ],
  movement: [
    {
      key: 'date',
      label: 'Datum',
      value: (r) => r['createdAt'],
      fmt: (r) => dateTimeText(r['createdAt']),
    },
    { key: 'type', label: 'Typ', value: (r) => MOVEMENT_LABELS[r['type'] as MovementType] },
    { key: 'article', label: 'Artikel', value: (r) => r['articleLabel'] },
    { key: 'qty', label: 'Antal', right: true, value: (r) => r['quantity'] },
    {
      key: 'unit',
      label: 'Pris/st',
      right: true,
      value: (r) => r['unitPrice'] ?? r['unitCost'] ?? 0,
      fmt: (r) => kr.transform(r['unitPrice'] ?? r['unitCost']),
    },
    {
      key: 'sum',
      label: 'Summa',
      right: true,
      value: (r) => (r['unitPrice'] ?? r['unitCost'] ?? 0) * r['quantity'],
      fmt: (r) => kr.transform((r['unitPrice'] ?? r['unitCost'] ?? 0) * r['quantity']),
    },
    { key: 'bal', label: 'Saldo', right: true, value: (r) => r['balanceAfter'] },
    {
      key: 'ref',
      label: 'Referens',
      value: (r) => r['reference'] ?? '',
      fmt: (r) => r['reference'] || '–',
    },
    {
      key: 'note',
      label: 'Anteckning',
      value: (r) => r['note'] ?? '',
      fmt: (r) => r['note'] || '–',
    },
  ],
  deposit: [
    { key: 'code', label: 'Nr', value: (r) => r['number'], fmt: (r) => r['code'] },
    { key: 'reg', label: 'Reg.nr', value: (r) => r['vehicle']?.regNo ?? '' },
    { key: 'customer', label: 'Kund', value: (r) => r['customer']?.name ?? '' },
    {
      key: 'fee',
      label: 'Avgift',
      right: true,
      value: (r) => r['fee'],
      fmt: (r) => kr.transform(r['fee']),
    },
    {
      key: 'method',
      label: 'Betalsätt',
      value: (r) =>
        r['paymentMethod'] ? PAYMENT_METHOD_LABELS[r['paymentMethod'] as PaymentMethod] : '',
      fmt: (r) =>
        r['paymentMethod'] ? PAYMENT_METHOD_LABELS[r['paymentMethod'] as PaymentMethod] : '–',
    },
    {
      key: 'paid',
      label: 'Betald',
      value: (r) => r['paidAt'] ?? '',
      fmt: (r) => (r['paidAt'] ? dayText(r['paidAt']) : '–'),
    },
    {
      key: 'in',
      label: 'Inlämnad',
      value: (r) => r['depositedAt'],
      fmt: (r) => dayText(r['depositedAt']),
    },
    {
      key: 'state',
      label: 'Status',
      value: (r) =>
        r['removed']
          ? 'Raderad vid nollställning'
          : r['status'] === 'stored'
            ? 'Inlagrad'
            : 'Utlämnad',
    },
  ],
};

/** Arkiverade rader i en bokföring: artikelsaldon, kopia av loggen eller hotellsets. */
@Component({
  selector: 'app-closing-entries',
  standalone: false,
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    @if (filters.length > 1) {
      <mat-form-field class="max-w-xs">
        <mat-label>Visa</mat-label>
        <mat-select [value]="sub()" (selectionChange)="setSub($event.value)">
          <mat-option [value]="null">Alla</mat-option>
          @for (f of filters; track f[0]) {
            <mat-option [value]="f[0]">{{ f[1] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    }
    <app-data-table
      [columns]="columns"
      [rows]="items()"
      scrollClass="max-h-[60vh]"
      [emptyText]="loading() ? 'Laddar…' : 'Inga rader.'"
    />
    <div class="mt-3 flex items-center gap-3">
      @if (hasNext()) {
        <button mat-stroked-button (click)="load(false)" [disabled]="loading()">Visa fler</button>
      }
      <span class="text-sm text-gray-500">{{ items().length }} av {{ total() }}</span>
    </div>
  `,
})
export class ClosingEntries implements OnChanges {
  private readonly api = inject(ClosingApi);
  @Input({ required: true }) closingId!: string;
  @Input({ required: true }) kind!: ClosingEntryKind;

  columns: DtCol<Row>[] = [];
  filters: [string, string][] = [];
  readonly sub = signal<string | null>(null);
  readonly items = signal<Row[]>([]);
  readonly total = signal(0);
  readonly hasNext = signal(false);
  readonly loading = signal(false);

  ngOnChanges() {
    this.columns = COLUMNS[this.kind];
    this.filters = FILTERS[this.kind];
    this.load(true);
  }

  setSub(value: string | null) {
    this.sub.set(value);
    this.load(true);
  }

  load(reset: boolean) {
    const offset = reset ? 0 : this.items().length;
    this.loading.set(true);
    this.api
      .entries(this.closingId, this.kind, { sub: this.sub() ?? undefined, limit: 100, offset })
      .subscribe({
        next: (p) => {
          const rows = p.items.map((e) => e.data);
          this.items.update((cur) => (reset ? rows : [...cur, ...rows]));
          this.total.set(p.pagination.total);
          this.hasNext.set(p.pagination.hasNextPage);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
