import { Component, computed, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ClosingApi } from '../../core/api/closing-api';
import { InventoryApi } from '../../core/api/inventory-api';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { addDays, ymd } from '../../core/insights/dates';
import { Insights } from '../../core/insights/insights';
import { MonthlySeries, monthlySeries } from '../../core/insights/sales';
import { GroupedReport, Report, VatReport } from '../../core/models';
import { Settings } from '../../core/settings';
import { bars, columns, fmtKr, kronor, line, tickKr } from '../../shared/chart/chart-kit';
import { ACCENT, OTHER } from '../../shared/chart/chart-theme';
import type { PanelTable } from '../../shared/panel/panel';
import { delta } from '../../shared/stat/stat';
import { InvoiceItem, invoiceFigures, loadInvoices } from './invoices';

const MONTHS = 12;

const sameMonth = (iso: string | null | undefined, d: Date) => {
  if (!iso) return false;
  const x = new Date(iso);
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
};

/**
 * Ekonomins startsida: vad som väntar på ägaren (obetalt, ofakturerat, moms), hur de senaste
 * dagarna gick mot dagarna innan och tre diagram över året. Månadsdiagrammen byggs av en enda
 * dagsrapport från servern, inte av tusentals dokument.
 */
@Component({
  selector: 'app-finance-overview',
  standalone: false,
  host: { class: 'block' },
  template: `
    <app-finance-tabs />

    <h2 class="sec">Att hantera</h2>
    <div class="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
      <app-stat
        label="Obetalt"
        [value]="loaded() ? kr(unpaidSum()) : '–'"
        [hint]="unpaidHint()"
        [status]="overdueCount() ? 'bad' : unpaidCount() ? 'warn' : 'none'"
        link="/finance/invoices"
        [params]="{ status: 'unpaid' }"
      />
      <app-stat
        label="Fakturerat i månaden"
        [value]="loaded() ? kr(monthGross()) : '–'"
        [delta]="monthDelta()"
        hint="inkl. moms, mot förra månaden"
        link="/finance/invoices"
      />
      <app-stat
        label="Klara, ej fakturerade"
        [value]="vat() ? vat()!.doneNotInvoiced : '–'"
        hint="order att fakturera"
        [status]="vat()?.doneNotInvoiced ? 'bad' : 'none'"
        link="/workorders"
      />
      <app-stat
        label="Moms i månaden"
        [value]="vat() ? kr(vat()!.total.vat) : '–'"
        hint="utgående moms"
        link="/bookkeeping"
      />
    </div>

    <div class="mt-6">
      <h2 class="sec">Senaste {{ days }} dagarna</h2>
    </div>
    <div class="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
      <app-stat
        label="Försäljning"
        [value]="cur() ? kr(cur()!.soldRevenue) : '–'"
        [delta]="d('soldRevenue')"
        hint="exkl. moms"
      />
      <app-stat
        label="Bruttovinst"
        [value]="cur() ? kr(cur()!.grossProfit) : '–'"
        [delta]="d('grossProfit')"
        [hint]="margin()"
      />
      <app-stat
        label="Sålda enheter"
        [value]="cur() ? cur()!.soldUnits + ' st' : '–'"
        [delta]="d('soldUnits')"
        hint="däck, fälgar och delar"
      />
      <app-stat
        label="Inköp"
        [value]="cur() ? kr(cur()!.purchasedCost) : '–'"
        [delta]="dNeutral('purchasedCost')"
        [hint]="cur() ? cur()!.purchasedUnits + ' st, exkl. moms' : ''"
      />
    </div>

    <div class="mt-6 grid gap-4 xl:grid-cols-3">
      <app-panel
        class="xl:col-span-2"
        title="Fakturerat och betalt per månad"
        subtitle="Inkl. moms, senaste 12 månaderna."
        [table]="invoiceTable()"
      >
        <div class="h-64">
          <app-chart [config]="invoiceChart()" label="Fakturerat och betalt per månad" />
        </div>
      </app-panel>

      <app-panel
        title="Mest sålda märken"
        subtitle="Försäljning exkl. moms, senaste 90 dagarna."
        [table]="brandTable()"
      >
        <div class="h-64">
          <app-chart [config]="brandChart()" label="Försäljning per märke" />
        </div>
      </app-panel>

      <app-panel
        class="xl:col-span-2"
        title="Försäljning och inköp per månad"
        subtitle="Exkl. moms."
        [table]="monthTable()"
      >
        <div class="h-64">
          <app-chart [config]="monthChart()" label="Försäljning och inköp per månad" />
        </div>
      </app-panel>

      <app-panel title="Bruttovinst per månad" subtitle="Exkl. moms." [table]="profitTable()">
        <div class="h-64">
          <app-chart [config]="profitChart()" label="Bruttovinst per månad" />
        </div>
      </app-panel>
    </div>
  `,
})
export class FinanceOverview {
  private readonly orders = inject(WorkOrderApi);
  private readonly cards = inject(SalesCardApi);
  private readonly closings = inject(ClosingApi);
  private readonly inventory = inject(InventoryApi);
  private readonly insights = inject(Insights);
  private readonly now = new Date();

  /** Perioden för "Senaste dagarna" väljs under Inställningar. */
  readonly days = inject(Settings).value().dashboardDays;
  readonly kr = kronor;

  private readonly invoices = signal<InvoiceItem[]>([]);
  readonly loaded = signal(false);
  readonly vat = signal<VatReport | null>(null);
  readonly cur = signal<Report | null>(null);
  readonly prev = signal<Report | null>(null);
  private readonly daily = signal<GroupedReport | null>(null);
  private readonly brands = signal<GroupedReport | null>(null);

  // --- att hantera ---

  private readonly figures = computed(() => invoiceFigures(this.invoices()));
  readonly unpaidSum = computed(() => this.figures().unpaid.sum);
  readonly unpaidCount = computed(() => this.figures().unpaid.count);
  readonly overdueCount = computed(() => this.figures().overdue.count);
  /** "5 fakturor, varav 2 förfallna": det som är sent är det som ägaren behöver agera på. */
  readonly unpaidHint = computed(() => {
    if (!this.loaded()) return '';
    const n = this.unpaidCount();
    const late = this.overdueCount();
    return `${n} ${n === 1 ? 'faktura' : 'fakturor'}${
      late ? `, varav ${late} ${late === 1 ? 'förfallen' : 'förfallna'}` : ''
    }`;
  });

  private gross(month: Date): number {
    return this.invoices()
      .filter((o) => sameMonth(o.invoicedAt, month))
      .reduce((s, o) => s + o.total, 0);
  }
  readonly monthGross = computed(() => this.gross(this.now));
  readonly monthDelta = computed(() =>
    this.loaded()
      ? delta(
          this.monthGross(),
          this.gross(new Date(this.now.getFullYear(), this.now.getMonth() - 1, 1)),
        )
      : null,
  );

  // --- senaste dagarna mot dagarna innan ---

  d(key: keyof Report) {
    const c = this.cur();
    const p = this.prev();
    return c && p ? delta(c[key], p[key]) : null;
  }
  /** Inköp är varken bra eller dåligt att öka: bara riktningen visas. */
  dNeutral(key: keyof Report) {
    const c = this.cur();
    const p = this.prev();
    return c && p ? delta(c[key], p[key], null) : null;
  }
  readonly margin = computed(() => {
    const c = this.cur();
    return c && c.soldRevenue
      ? `${Math.round((c.grossProfit / c.soldRevenue) * 100)} % marginal`
      : '';
  });

  // --- fakturerat och betalt ---

  private readonly months = computed(() =>
    Array.from(
      { length: MONTHS },
      (_, i) => new Date(this.now.getFullYear(), this.now.getMonth() - (MONTHS - 1 - i), 1),
    ),
  );
  private readonly invoiced = computed(() => this.months().map((m) => this.gross(m) / 100));
  private readonly paid = computed(() =>
    this.months().map(
      (m) =>
        this.invoices()
          .filter((o) => sameMonth(o.paidAt, m))
          .reduce((s, o) => s + o.total, 0) / 100,
    ),
  );
  private readonly monthLabels = computed(() =>
    this.months().map((m) => m.toLocaleDateString('sv-SE', { month: 'short' }).replace('.', '')),
  );
  private readonly monthTitles = computed(() =>
    this.months().map((m) => {
      const t = m.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
      return t.charAt(0).toUpperCase() + t.slice(1);
    }),
  );

  readonly invoiceChart = computed(() =>
    columns({
      labels: this.monthLabels(),
      title: (i) => this.monthTitles()[i],
      series: [
        { label: 'Fakturerat', data: this.invoiced(), color: OTHER },
        { label: 'Betalt', data: this.paid(), color: ACCENT },
      ],
      format: fmtKr,
      tick: tickKr,
    }),
  );
  readonly invoiceTable = computed<PanelTable>(() => ({
    head: ['Månad', 'Fakturerat', 'Betalt'],
    rows: this.monthTitles().map((t, i) => [t, fmtKr(this.invoiced()[i]), fmtKr(this.paid()[i])]),
  }));

  // --- försäljning, inköp och vinst per månad ---

  private readonly series = computed<MonthlySeries>(() =>
    monthlySeries(this.daily(), this.now, MONTHS),
  );

  readonly monthChart = computed(() => {
    const s = this.series();
    return columns({
      labels: s.labels,
      title: (i) => this.monthTitles()[i],
      series: [
        { label: 'Försäljning', data: s.sold.map((v) => v / 100), color: ACCENT },
        { label: 'Inköp', data: s.bought.map((v) => v / 100), color: OTHER },
      ],
      format: fmtKr,
      tick: tickKr,
      footer: (i) => [`${s.soldUnits[i]} sålda enheter`],
    });
  });
  readonly monthTable = computed<PanelTable>(() => {
    const s = this.series();
    return {
      head: ['Månad', 'Försäljning', 'Inköp', 'Sålda enheter'],
      rows: this.monthTitles().map((t, i) => [
        t,
        kronor(s.sold[i]),
        kronor(s.bought[i]),
        s.soldUnits[i],
      ]),
    };
  });

  readonly profitChart = computed(() => {
    const s = this.series();
    return line({
      labels: s.labels,
      label: 'Bruttovinst',
      data: s.profit.map((v) => v / 100),
      format: fmtKr,
      tick: tickKr,
      fill: true,
    });
  });
  readonly profitTable = computed<PanelTable>(() => {
    const s = this.series();
    return {
      head: ['Månad', 'Bruttovinst', 'Marginal'],
      rows: this.monthTitles().map((t, i) => [
        t,
        kronor(s.profit[i]),
        s.sold[i] ? `${Math.round((s.profit[i] / s.sold[i]) * 100)} %` : '–',
      ]),
    };
  });

  // --- märken ---

  private readonly topBrands = computed(() =>
    (this.brands()?.groups ?? [])
      .filter((g) => g.soldRevenue > 0)
      .slice(0, 8)
      .map((g) => ({ ...g, label: g.key === 'Unknown' ? 'Okänt märke' : g.key })),
  );
  readonly brandChart = computed(() => {
    const b = this.topBrands();
    return bars({
      labels: b.map((x) => x.label),
      series: [{ label: 'Försäljning', data: b.map((x) => x.soldRevenue / 100), color: ACCENT }],
      format: fmtKr,
      footer: (i) => [`${b[i].soldUnits} sålda enheter`],
    });
  });
  readonly brandTable = computed<PanelTable>(() => ({
    head: ['Märke', 'Försäljning', 'Sålda enheter'],
    rows: this.topBrands().map((b) => [b.label, kronor(b.soldRevenue), b.soldUnits]),
  }));

  constructor() {
    loadInvoices(this.orders, this.cards)
      .pipe(catchError(() => of([] as InvoiceItem[])))
      .subscribe((l) => {
        this.invoices.set(l);
        this.loaded.set(true);
      });
    const start = new Date(this.now.getFullYear(), this.now.getMonth(), 1);
    this.closings
      .vatReport({
        from: start.toISOString(),
        to: new Date(this.now.getFullYear(), this.now.getMonth() + 1, 1).toISOString(),
      })
      .pipe(catchError(() => of(null)))
      .subscribe((v) => this.vat.set(v));

    const day = (offset: number) => ymd(addDays(this.now, offset));
    this.inventory
      .report(day(-(this.days - 1)), day(0))
      .pipe(catchError(() => of(null)))
      .subscribe((r) => this.cur.set(r));
    this.inventory
      .report(day(-(2 * this.days - 1)), day(-this.days))
      .pipe(catchError(() => of(null)))
      .subscribe((r) => this.prev.set(r));
    this.insights
      .daily(this.now, 365)
      .pipe(catchError(() => of(null)))
      .subscribe((r) => this.daily.set(r));
    this.insights
      .brandSales(addDays(this.now, -89), this.now)
      .pipe(catchError(() => of(null)))
      .subscribe((r) => this.brands.set(r));
  }
}
