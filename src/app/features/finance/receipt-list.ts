import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { isSameDay, subDays } from 'date-fns';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { appLocale } from '../../core/i18n/locale';
import { PaymentMethod, paymentLabel } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import { InvoiceItem, loadInvoices, onlyReceipts } from './invoices';

const kr = new KrPipe();
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(appLocale()) : '–';

const COLS: DtCol<InvoiceItem>[] = [
  { key: 'code', label: 'Nr', value: (o) => o.code },
  { key: 'customer', label: 'Kund', value: (o) => o.customerName },
  { key: 'regNo', label: 'Regnr', value: (o) => o.regNo },
  {
    key: 'date',
    label: 'Datum',
    value: (o) => o.invoicedAt ?? '',
    fmt: (o) => day(o.invoicedAt),
  },
  {
    key: 'method',
    label: 'Betalsätt',
    value: (o) => o.paymentMethod ?? '',
    fmt: (o) => (o.paymentMethod ? paymentLabel('receipt', o.paymentMethod) : '–'),
  },
  {
    key: 'gross',
    label: 'Belopp',
    right: true,
    value: (o) => o.total,
    fmt: (o) => kr.transform(o.total),
  },
];

type MethodFilter = 'all' | PaymentMethod;

/**
 * Kvitton: försäljning som betalades på stället (kort, kontant eller Swish). Ett kvitto är ett eget
 * dokument med en egen nummerserie (KV-), betalt när det utfärdas, och är aldrig en fordran: det
 * står alltså inte bland fakturorna. Överst syns vad som kommit in i kassan. Klick öppnar säljkortet
 * (eller det äldre kvittot) bakom.
 */
@Component({
  selector: 'app-receipt-list',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-finance-tabs />
    <div class="mb-4 grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
      <app-stat
        label="Idag"
        [value]="loading() ? '–' : money(figures().today.sum)"
        [hint]="loading() ? '' : count(figures().today.count)"
      />
      <app-stat
        label="Senaste 7 dagarna"
        [value]="loading() ? '–' : money(figures().week.sum)"
        [hint]="loading() ? '' : count(figures().week.count)"
      />
      <div class="min-w-0 max-md:hidden">
        <app-stat
          label="Senaste 30 dagarna"
          [value]="loading() ? '–' : money(figures().month.sum)"
          [hint]="loading() ? '' : count(figures().month.count) + ', inkl. moms'"
        />
      </div>
    </div>
    <div class="min-h-0 flex-1">
      <app-list-page
        title=""
        [columns]="cols"
        [rows]="shown()"
        [loading]="loading()"
        newLink="/sales/new"
        [newQuery]="{ kind: 'receipt' }"
        newLabel="Nytt kvitto"
        [newFab]="false"
        emptyText="Inga kvitton. De skapas när ett säljkort bokförs som kvitto."
        searchPlaceholder="Sök nummer, kund eller regnr…"
        (search)="query.set($event)"
        (rowClick)="open($event)"
      >
        <div class="mb-3 flex shrink-0 flex-wrap items-center gap-3">
          <mat-button-toggle-group
            hideSingleSelectionIndicator
            [value]="method()"
            (change)="method.set($event.value)"
            aria-label="Betalsätt"
          >
            <mat-button-toggle value="all">Alla</mat-button-toggle>
            <mat-button-toggle value="card">Kort</mat-button-toggle>
            <mat-button-toggle value="cash">Kontant</mat-button-toggle>
            <mat-button-toggle value="swish">Swish</mat-button-toggle>
          </mat-button-toggle-group>
          <span class="text-sm text-gray-600">{{ summary() }}</span>
        </div>
        <!-- Mobil: ett kompakt kort i stället för alla kolumner under varandra. -->
        <ng-template #card let-o="row">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="font-semibold">{{ o.code }}</span>
                <span class="text-xs text-gray-500">{{ dateOf(o) }}</span>
              </div>
              <div class="truncate text-sm text-gray-700">{{ o.customerName }}</div>
              <div class="truncate text-xs text-gray-500">
                {{ o.ref }}{{ o.regNo ? ' · ' + o.regNo : '' }}
              </div>
            </div>
            <div class="shrink-0 text-right">
              <div class="font-semibold tabular-nums">{{ money(o.total) }}</div>
              <app-pill class="mt-1 inline-block" tone="green">{{ methodText(o) }}</app-pill>
            </div>
          </div>
        </ng-template>
        <ng-template #cell let-o="row" let-col="col" let-text="text">
          @switch (col.key) {
            @case ('code') {
              <span class="font-medium">{{ o.code }}</span>
              <span class="block text-xs text-gray-500">{{ o.ref }}</span>
            }
            @case ('method') {
              <app-pill tone="green">{{ methodText(o) }}</app-pill>
            }
            @default {
              {{ text }}
            }
          }
        </ng-template>
      </app-list-page>
    </div>
  `,
})
export class ReceiptList {
  private readonly api = inject(WorkOrderApi);
  private readonly cardsApi = inject(SalesCardApi);
  readonly router = inject(Router);
  readonly cols = COLS;
  readonly money = (ore: number) => kr.transform(ore);
  readonly dateOf = (o: InvoiceItem) => day(o.invoicedAt);
  readonly methodText = (o: InvoiceItem) =>
    o.paymentMethod ? paymentLabel('receipt', o.paymentMethod) : '–';
  readonly count = (n: number) => `${n} ${n === 1 ? 'kvitto' : 'kvitton'}`;

  private readonly items = signal<InvoiceItem[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly method = signal<MethodFilter>('all');

  /** Vad som kommit in i kassan, så att dagen går att stämma av mot kortterminalen och kassalådan. */
  readonly figures = computed(() => {
    const now = new Date();
    const sum = (from: (d: Date) => boolean) => {
      const rows = this.items().filter((o) => o.invoicedAt && from(new Date(o.invoicedAt)));
      return { count: rows.length, sum: rows.reduce((s, o) => s + o.total, 0) };
    };
    return {
      today: sum((d) => isSameDay(d, now)),
      week: sum((d) => d > subDays(now, 7)),
      month: sum((d) => d > subDays(now, 30)),
    };
  });

  readonly shown = computed(() => {
    const q = this.query().toLowerCase();
    const m = this.method();
    return this.items().filter(
      (o) =>
        (m === 'all' || o.paymentMethod === m) &&
        (!q || `${o.code} ${o.customerName} ${o.regNo} ${o.ref}`.toLowerCase().includes(q)),
    );
  });

  readonly summary = computed(() => {
    const rows = this.shown();
    return `${rows.length} st · ${kr.transform(rows.reduce((s, o) => s + o.total, 0))} totalt`;
  });

  constructor() {
    loadInvoices(this.api, this.cardsApi).subscribe({
      next: (l) => {
        this.items.set(onlyReceipts(l));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(o: InvoiceItem) {
    void this.router.navigate(o.source === 'card' ? ['/sales', o.id] : ['/finance/invoices', o.id]);
  }
}
