import { Component, computed, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ClosingApi } from '../../core/api/closing-api';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { VatReport, WorkOrder } from '../../core/models';
import { ChartConfiguration } from 'chart.js';
import { brandColor } from '../../shared/chart/chart';
import { KrPipe } from '../../shared/kr-pipe';
import { InventoryApi } from '../../core/api/inventory-api';
import { TradeRow } from '../../core/models';
import { grossOf, loadInvoices, loadTrades } from './invoices';

const kr = new KrPipe();
const MONTHS = 12;
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Ekonomins startsida: vad som är obetalt, vad som fakturerats och momsen, med sex månader i diagram. */
@Component({
  selector: 'app-finance-overview',
  standalone: false,
  host: { class: 'block' },
  template: `
    <app-finance-tabs />
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      @for (k of kpis(); track k.label) {
        <a
          [routerLink]="k.link"
          class="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
        >
          <div class="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {{ k.label }}
          </div>
          <div class="mt-1 text-2xl font-semibold tabular-nums" [class]="k.tone">{{ k.value }}</div>
          <div class="mt-0.5 text-sm text-gray-500">{{ k.hint }}</div>
        </a>
      }
    </div>

    <section class="mt-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div class="mb-4 flex items-baseline gap-2">
        <h2 class="text-sm font-semibold">Fakturerat och betalt per månad</h2>
        <span class="text-xs text-gray-500">exkl. moms, senaste {{ months }} månaderna</span>
      </div>
      <div class="h-72">
        <app-chart [config]="chart()" label="Fakturerat och betalt per månad" />
      </div>
    </section>

    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      <section class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div class="mb-4 flex items-baseline gap-2">
          <h2 class="text-sm font-semibold">Försäljning per månad</h2>
          <span class="text-xs text-gray-500">lagerförsäljning, exkl. moms</span>
        </div>
        <div class="h-64">
          <app-chart [config]="salesChart()" label="Försäljning per månad" />
        </div>
      </section>
      <section class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div class="mb-4 flex items-baseline gap-2">
          <h2 class="text-sm font-semibold">Inköp per månad</h2>
          <span class="text-xs text-gray-500">exkl. moms</span>
        </div>
        <div class="h-64">
          <app-chart [config]="purchaseChart()" label="Inköp per månad" />
        </div>
      </section>
    </div>
  `,
})
export class FinanceOverview {
  private readonly orders = inject(WorkOrderApi);
  private readonly closings = inject(ClosingApi);
  private readonly inventory = inject(InventoryApi);
  private readonly sales = signal<TradeRow[]>([]);
  private readonly purchases = signal<TradeRow[]>([]);
  readonly months = MONTHS;
  private readonly invoices = signal<WorkOrder[]>([]);
  private readonly vat = signal<VatReport | null>(null);

  readonly kpis = computed(() => {
    const unpaid = this.invoices().filter((o) => !o.paidAt);
    const unpaidSum = unpaid.reduce((s, o) => s + grossOf(o.price ?? 0), 0);
    const now = new Date();
    const monthNet = this.invoices()

      .filter((o) => this.sameMonth(o.invoicedAt, now))
      .reduce((s, o) => s + (o.price ?? 0), 0);
    const v = this.vat();
    return [
      {
        label: 'Obetalt',
        value: kr.transform(unpaidSum),
        hint: `${unpaid.length} fakturor`,
        tone: unpaid.length ? 'text-amber-700' : '',
        link: '/finance/invoices',
      },
      {
        label: 'Fakturerat i månaden',
        value: kr.transform(monthNet),
        hint: 'exkl. moms',
        tone: '',
        link: '/finance/invoices',
      },
      {
        label: 'Klara, ej fakturerade',
        value: v ? String(v.doneNotInvoiced) : '–',
        hint: 'order att fakturera',
        tone: v && v.doneNotInvoiced ? 'text-red-700' : '',
        link: '/workorders',
      },
      {
        label: 'Moms i månaden',
        value: v ? kr.transform(v.total.vat) : '–',
        hint: 'utgående moms',
        tone: '',
        link: '/bookkeeping',
      },
    ];
  });

  readonly chart = computed(() => {
    const sum = (d: Date, at: (o: WorkOrder) => string | null | undefined) =>
      this.invoices()
        .filter((o) => this.sameMonth(at(o), d))
        .reduce((t, o) => t + (o.price ?? 0), 0) / 100;
    return this.monthly(
      { label: 'Fakturerat', color: brandColor(), value: (d) => sum(d, (o) => o.invoicedAt) },
      { label: 'Betalt', color: '#16a34a', value: (d) => sum(d, (o) => o.paidAt) },
    );
  });

  private lastMonths() {
    const now = new Date();
    return Array.from(
      { length: MONTHS },
      (_, i) => new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1),
    );
  }

  /** Staplar (och en valfri linje) per månad med samma axlar och hovertips som övriga diagram. */
  private monthly(
    bar: { label: string; color: string; value: (d: Date) => number },
    line?: { label: string; color: string; value: (d: Date) => number },
  ): ChartConfiguration {
    const months = this.lastMonths();
    return {
      type: 'bar',
      data: {
        labels: months.map((d) => d.toLocaleDateString('sv-SE', { month: 'short' })),
        datasets: [
          {
            type: 'bar',
            label: bar.label,
            data: months.map(bar.value),
            backgroundColor: bar.color,
            borderRadius: 6,
            maxBarThickness: 36,
          },
          ...(line
            ? [
                {
                  type: 'line' as const,
                  label: line.label,
                  data: months.map(line.value),
                  borderColor: line.color,
                  backgroundColor: line.color,
                  tension: 0.3,
                  pointRadius: 3,
                },
              ]
            : []),
        ],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: ${kr.transform((c.parsed.y ?? 0) * 100)}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => `${Number(v).toLocaleString('sv-SE')} kr` },
          },
        },
      },
    };
  }

  private tradeSum(rows: TradeRow[], d: Date, pick: (r: TradeRow) => number) {
    return (
      rows.filter((r) => this.sameMonth(r.createdAt, d)).reduce((t, r) => t + pick(r), 0) / 100
    );
  }

  readonly salesChart = computed(() =>
    this.monthly(
      {
        label: 'Försäljning',
        color: brandColor(),
        value: (d) => this.tradeSum(this.sales(), d, (r) => r.total),
      },
      {
        label: 'Vinst',
        color: '#16a34a',
        value: (d) => this.tradeSum(this.sales(), d, (r) => r.total - r.cost),
      },
    ),
  );

  readonly purchaseChart = computed(() =>
    this.monthly({
      label: 'Inköp',
      color: '#64748b',
      value: (d) => this.tradeSum(this.purchases(), d, (r) => r.total),
    }),
  );

  private sameMonth(iso: string | null | undefined, d: Date) {
    if (!iso) return false;
    const x = new Date(iso);
    return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
  }

  constructor() {
    loadInvoices(this.orders)
      .pipe(catchError(() => of([] as WorkOrder[])))
      .subscribe((l) => this.invoices.set(l));
    loadTrades(this.inventory, 'sales')
      .pipe(catchError(() => of([] as TradeRow[])))
      .subscribe((l) => this.sales.set(l));
    loadTrades(this.inventory, 'purchases')
      .pipe(catchError(() => of([] as TradeRow[])))
      .subscribe((l) => this.purchases.set(l));
    const now = new Date();
    this.closings
      .vatReport({
        from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
      })
      .pipe(catchError(() => of(null)))
      .subscribe((v) => this.vat.set(v));
  }
}
