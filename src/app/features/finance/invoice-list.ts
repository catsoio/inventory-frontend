import { appLocale } from '../../core/i18n/locale';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import { netOf } from '../../shared/vat';
import { InvoiceItem, loadInvoices } from './invoices';

const kr = new KrPipe();
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(appLocale()) : '–';

const COLS: DtCol<InvoiceItem>[] = [
  { key: 'code', label: 'Nr', value: (o) => o.code },
  {
    key: 'date',
    label: 'Utfärdad',
    value: (o) => o.invoicedAt ?? '',
    fmt: (o) => day(o.invoicedAt),
  },
  { key: 'customer', label: 'Kund', value: (o) => o.customerName },
  { key: 'regNo', label: 'Regnr', value: (o) => o.regNo },
  { key: 'ref', label: 'Underlag', value: (o) => o.ref },
  {
    key: 'net',
    label: 'Exkl. moms',
    right: true,
    value: (o) => netOf(o.total),
    fmt: (o) => kr.transform(netOf(o.total)),
  },
  {
    key: 'gross',
    label: 'Att betala',
    right: true,
    value: (o) => o.total,
    fmt: (o) => kr.transform(o.total),
  },
  { key: 'paid', label: 'Betalning', value: (o) => (o.paidAt ? 'Betald' : 'Obetald') },
];

type Filter = 'all' | 'unpaid' | 'paid';

/** Alla fakturor och kvitton på ett ställe; klick öppnar säljkortet (eller äldre fakturan) bakom. */
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
        emptyText="Inga fakturor än. De skapas när ett säljkort bokförs, eller lägg till en gammal med knappen."
        searchPlaceholder="Sök nummer, kund eller regnr…"
        (search)="query.set($event)"
        (rowClick)="open($event)"
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
          <span class="flex-1"></span>
          <a mat-flat-button color="primary" routerLink="/finance/invoices/new">
            <mat-icon>add</mat-icon> Lägg till faktura
          </a>
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
  private readonly cardsApi = inject(SalesCardApi);
  readonly router = inject(Router);
  readonly cols = COLS;
  private readonly items = signal<InvoiceItem[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly filter = signal<Filter>('all');
  readonly shown = computed(() => {
    const q = this.query().toLowerCase();
    return this.items().filter(
      (o) =>
        (this.filter() === 'all' || (this.filter() === 'paid') === !!o.paidAt) &&
        (!q || `${o.code} ${o.customerName} ${o.regNo} ${o.ref}`.toLowerCase().includes(q)),
    );
  });
  readonly sum = computed(() =>
    kr.transform(this.shown().reduce((s, o) => s + o.total, 0)),
  );

  constructor() {
    loadInvoices(this.api, this.cardsApi).subscribe({
      next: (l) => {
        this.items.set(l);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(o: InvoiceItem) {
    void this.router.navigate(o.kind === 'card' ? ['/sales', o.id] : ['/finance/invoices', o.id]);
  }
}
