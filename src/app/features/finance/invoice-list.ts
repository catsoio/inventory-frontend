import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { WorkOrder } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import { grossOf, loadInvoices } from './invoices';

const kr = new KrPipe();
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('sv-SE') : '–';

const COLS: DtCol<WorkOrder>[] = [
  { key: 'code', label: 'Nr', value: (o) => o.invoiceCode ?? '' },
  {
    key: 'date',
    label: 'Utfärdad',
    value: (o) => o.invoicedAt ?? '',
    fmt: (o) => day(o.invoicedAt),
  },
  { key: 'customer', label: 'Kund', value: (o) => o.customerName },
  { key: 'regNo', label: 'Regnr', value: (o) => o.regNo },
  { key: 'order', label: 'Order', value: (o) => o.code },
  {
    key: 'net',
    label: 'Exkl. moms',
    right: true,
    value: (o) => o.price ?? 0,
    fmt: (o) => kr.transform(o.price ?? 0),
  },
  {
    key: 'gross',
    label: 'Att betala',
    right: true,
    value: (o) => grossOf(o.price ?? 0),
    fmt: (o) => kr.transform(grossOf(o.price ?? 0)),
  },
  { key: 'paid', label: 'Betalning', value: (o) => (o.paidAt ? 'Betald' : 'Obetald') },
];

type Filter = 'all' | 'unpaid' | 'paid';

/** Alla fakturor och kvitton på ett ställe; klick öppnar arbetsordern bakom. */
@Component({
  selector: 'app-invoice-list',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-finance-tabs />
    <div class="min-h-0 flex-1">
      <app-list-page
        title="Fakturor"
        [columns]="cols"
        [rows]="shown()"
        [loading]="loading()"
        emptyText="Inga fakturor än. De skapas från en klar arbetsorder."
        searchPlaceholder="Sök nummer, kund eller regnr…"
        (search)="query.set($event)"
        (rowClick)="router.navigate(['/workorders', $event.id])"
      >
        <div class="mb-3 flex shrink-0 flex-wrap items-center gap-3">
          <mat-button-toggle-group
            hideSingleSelectionIndicator
            [value]="filter()"
            (change)="filter.set($event.value)"
            aria-label="Visa"
          >
            <mat-button-toggle value="all">Alla</mat-button-toggle>
            <mat-button-toggle value="unpaid">Obetalda</mat-button-toggle>
            <mat-button-toggle value="paid">Betalda</mat-button-toggle>
          </mat-button-toggle-group>
          <span class="text-sm text-gray-600">
            {{ shown().length }} st · {{ sum() }} att betala
          </span>
        </div>
        <ng-template #cell let-o="row" let-col="col" let-text="text">
          @if (col.key === 'paid') {
            <app-pill [tone]="o.paidAt ? 'green' : 'amber'">{{ text }}</app-pill>
          } @else {
            {{ text }}
          }
        </ng-template>
      </app-list-page>
    </div>
  `,
})
export class InvoiceList {
  private readonly api = inject(WorkOrderApi);
  readonly router = inject(Router);
  readonly cols = COLS;
  private readonly items = signal<WorkOrder[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly filter = signal<Filter>('all');
  readonly shown = computed(() => {
    const q = this.query().toLowerCase();
    return this.items().filter(
      (o) =>
        (this.filter() === 'all' || (this.filter() === 'paid') === !!o.paidAt) &&
        (!q || `${o.invoiceCode} ${o.customerName} ${o.regNo} ${o.code}`.toLowerCase().includes(q)),
    );
  });
  readonly sum = computed(() =>
    kr.transform(this.shown().reduce((s, o) => s + grossOf(o.price ?? 0), 0)),
  );

  constructor() {
    loadInvoices(this.api).subscribe({
      next: (l) => {
        this.items.set(l);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
