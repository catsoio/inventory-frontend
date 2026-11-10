import { appLocale } from '../../core/i18n/locale';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { SalesCardItem } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import { STATUS_TEXT, STATUS_TONE, invoiceStatus } from '../../shared/invoice-status';
import { SALES_TABS } from '../../shared/section-tabs/tabs';

const kr = new KrPipe();
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(appLocale()) : '–';

/** Ett utkast, eller hur det bokförda dokumentet ligger till: betalt, förfallet eller obetalt. */
const stateOf = (c: SalesCardItem) =>
  c.status === 'draft'
    ? null
    : invoiceStatus({ kind: c.kind ?? 'receipt', dueAt: c.dueAt, paidAt: c.paidAt, creditedAt: c.creditedAt });
const statusOf = (c: SalesCardItem) => {
  const s = stateOf(c);
  return s ? STATUS_TEXT[s] : 'Utkast';
};
const toneOf = (c: SalesCardItem) => {
  const s = stateOf(c);
  return s ? STATUS_TONE[s] : 'gray';
};

/** Verkstadens kolumner. Bilhandelns affär är en bil, så Regnr byts mot Bil och Rader utgår. */
const COLS: DtCol<SalesCardItem>[] = [
  { key: 'code', label: 'Nr', value: (c) => c.number },
  {
    key: 'date',
    label: 'Datum',
    value: (c) => c.invoicedAt ?? c.createdAt,
    fmt: (c) => day(c.invoicedAt ?? c.createdAt),
  },
  { key: 'customer', label: 'Kund', value: (c) => c.customerName ?? 'Kontant' },
  {
    key: 'regNo',
    label: 'Regnr',
    // En samlingsfaktura har ingen enskild bil: den säger hur många arbetsorder den gäller.
    value: (c) => c.regNo ?? ((c.orderCount ?? 0) > 1 ? `${c.orderCount} arbetsorder` : ''),
  },
  { key: 'lines', label: 'Rader', right: true, value: (c) => c.lineCount },
  {
    key: 'total',
    label: 'Att betala',
    right: true,
    value: (c) => c.total,
    fmt: (c) => kr.transform(c.total),
  },
  { key: 'invoice', label: 'Dokument', value: (c) => c.documentCode ?? '' },
  { key: 'status', label: 'Status', value: statusOf },
];

const HALL_COLS: DtCol<SalesCardItem>[] = COLS.filter(
  (c) => c.key !== 'regNo' && c.key !== 'lines',
).flatMap((c) =>
  c.key === 'customer'
    ? [c, { key: 'car', label: 'Bil', value: (x: SalesCardItem) => x.carLabel ?? '' }]
    : [c],
);

type Filter = 'all' | 'draft' | 'unpaid' | 'paid';

/**
 * Säljkorten: utkast, bokförda och betalda, en affär per kort. Samma lista i båda produkterna: i Axle
 * visas verkstadens kort, i Hall (`/dealership/deals`, ruttdata `product: 'hall'`) bilaffärerna.
 */
@Component({
  selector: 'app-sales-list',
  imports: [SharedModule],
  host: { class: 'flex h-full flex-col' },
  template: `
    @if (!hall) {
      <app-section-tabs class="shrink-0" [tabs]="tabs" [desktopOnly]="true" label="Försäljning" />
    }
    <app-list-page
      class="min-h-0 flex-1"
      [title]="hall ? 'Affärer' : ''"
      [columns]="cols"
      [rows]="items()"
      [loading]="loading()"
      newLink="/sales/new"
      [newLabel]="hall ? 'Ny affär' : 'Ny försäljning'"
      [emptyText]="empty"
      [searchPlaceholder]="hall ? 'Sök nummer, kund eller bil…' : 'Sök nummer, kund eller regnr…'"
      (search)="q.set($event); load()"
      (rowClick)="router.navigate(['/sales', $event.id])"
    >
      <div class="mb-3 flex shrink-0 flex-wrap items-center gap-3">
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [value]="filter()"
          (change)="filter.set($event.value); load()"
          aria-label="Visa"
        >
          <mat-button-toggle value="all">Alla</mat-button-toggle>
          <mat-button-toggle value="draft">Utkast</mat-button-toggle>
          <mat-button-toggle value="unpaid">Obetalda</mat-button-toggle>
          <mat-button-toggle value="paid">Betalda</mat-button-toggle>
        </mat-button-toggle-group>
        <span class="text-sm text-gray-600">{{ items().length }} st · {{ sum() }}</span>
      </div>
      <!-- Mobil: ett kompakt kort i stället för alla kolumner under varandra. -->
      <ng-template #card let-c="row">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="font-semibold">{{ c.code }}</span>
              <span class="text-xs text-gray-500">{{ dateOf(c) }}</span>
            </div>
            <div class="truncate text-sm text-gray-700">{{ c.customerName ?? 'Kontantkund' }}</div>
            @if (c.carLabel) {
              <div class="truncate text-sm font-medium">{{ c.carLabel }}</div>
            } @else if (c.regNo) {
              <app-reg-plate class="mt-1" [value]="c.regNo" size="sm" />
            } @else if ((c.orderCount ?? 0) > 1) {
              <div class="text-sm text-gray-600">
                Samlingsfaktura · {{ c.orderCount }} arbetsorder
              </div>
            }
          </div>
          <div class="shrink-0 text-right">
            <div class="font-semibold tabular-nums">{{ kr(c.total) }}</div>
            <app-pill class="mt-1 inline-block" [tone]="toneOf(c)">{{ statusOf(c) }}</app-pill>
          </div>
        </div>
      </ng-template>
      <ng-template #cell let-c="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="toneOf(c)">{{ text }}</app-pill>
        } @else if (col.key === 'code') {
          {{ c.code }}
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class SalesList {
  private readonly api = inject(SalesCardApi);
  readonly router = inject(Router);
  /** Bilhandelns affärer (`/dealership/deals`) eller verkstadens försäljning (`/sales`). */
  readonly hall = inject(ActivatedRoute).snapshot.data['product'] === 'hall';
  readonly cols = this.hall ? HALL_COLS : COLS;
  readonly tabs = SALES_TABS;
  readonly empty = this.hall
    ? 'Inga affärer än. Öppna en bil och välj Starta affär.'
    : 'Inga säljkort än. Skapa ett med knappen, eller från en arbetsorder eller ett däckhotell.';
  readonly statusOf = statusOf;
  readonly toneOf = toneOf;
  readonly kr = (ore: number) => kr.transform(ore);
  readonly dateOf = (c: SalesCardItem) => day(c.invoicedAt ?? c.createdAt);
  readonly items = signal<SalesCardItem[]>([]);
  readonly loading = signal(true);
  readonly q = signal('');
  /** Startfilter från adressen (`?show=unpaid`), t.ex. från Hem. */
  readonly filter = signal<Filter>(this.initialFilter());
  readonly sum = computed(() => kr.transform(this.items().reduce((s, c) => s + c.total, 0)));

  constructor() {
    this.load();
  }

  private initialFilter(): Filter {
    const v = inject(ActivatedRoute).snapshot.queryParamMap.get('show');
    return v === 'draft' || v === 'unpaid' || v === 'paid' ? v : 'all';
  }

  load() {
    const f = this.filter();
    this.loading.set(true);
    this.api
      .list({
        q: this.q() || undefined,
        status: f === 'draft' ? 'draft' : undefined,
        product: this.hall ? 'hall' : 'axle',
        paid: f === 'paid' ? true : f === 'unpaid' ? false : undefined,
        limit: 100,
      })
      .subscribe({
        next: (p) => {
          this.items.set(p.items);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
