import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { AxleApi } from '../../../core/api/axle-api';
import { Auth } from '../../../core/auth/auth';
import { Insights } from '../../../core/insights/insights';
import {
  Reorder,
  byBrand,
  byRim,
  dotAges,
  seasonUnits,
  toOrder,
} from '../../../core/insights/stock';
import { Article, StockHistoryPoint, Summary } from '../../../core/models';
import { bars, columns, fmtKr, kronor, line, tickKr } from '../../../shared/chart/chart-kit';
import { ACCENT, OTHER, SEASON, STATUS, tint } from '../../../shared/chart/chart-theme';
import type { MixPart } from '../../../shared/mix-bar/mix-bar';
import type { PanelTable } from '../../../shared/panel/panel';
import { STOCK_TABS } from '../../../shared/section-tabs/tabs';

const fmt = (n: number) => n.toLocaleString('sv-SE');
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '');

/**
 * Lagret i överblick: vilka däckstorlekar och säsonger vi har, vilka märken som dominerar, hur
 * lagervärdet rört sig och vad som ska beställas. Räknas ut av alla aktiva artiklar.
 */
@Component({
  selector: 'app-stock-overview',
  standalone: false,
  host: { class: 'block' },
  template: `
    <app-section-tabs class="shrink-0" [tabs]="tabs" [desktopOnly]="true" label="Lager" />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <app-stat
        label="Däck i lager"
        [value]="loading() ? '–' : fmt(tyreUnits())"
        [hint]="loading() ? '' : tyreArticles() + ' artiklar'"
        link="/inventory"
        [params]="{ category: 'tyre' }"
      />
      @if (admin) {
        <app-stat
          label="Lagervärde"
          [value]="summary() ? kr(summary()!.stockValue) : '–'"
          hint="inköpsvärde exkl. moms"
          [trend]="trend()"
          link="/inventory"
        />
      }
      <app-stat
        label="Behöver beställas"
        [value]="summary()?.lowStock ?? '–'"
        hint="under beställningspunkten"
        [status]="summary()?.lowStock ? 'warn' : 'none'"
        link="/inventory"
        [params]="{ lowStock: true }"
      />
      <app-stat
        label="Slut"
        [value]="summary()?.outOfStock ?? '–'"
        hint="inget kvar i lager"
        [status]="summary()?.outOfStock ? 'bad' : 'none'"
        link="/inventory"
        [params]="{ inStock: false }"
      />
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      <app-panel
        class="xl:col-span-2"
        title="Däck per fälgstorlek"
        subtitle="Antal däck i lager efter fälgdiameter och säsong. Klicka på en stapel för att se artiklarna."
        [loading]="loading()"
        [table]="rimTable()"
        [empty]="!loading() && !rims().length"
        emptyText="Inga däck i lager än."
      >
        <div class="h-72">
          <app-chart
            [config]="rimChart()"
            (pick)="openRim($event.index)"
            label="Däck i lager per fälgstorlek och säsong"
          />
        </div>
      </app-panel>

      <app-panel
        title="Märken"
        subtitle="Antal däck i lager per märke."
        [loading]="loading()"
        [table]="brandTable()"
        [empty]="!loading() && !brands().length"
        emptyText="Inga däck i lager än."
      >
        <div class="h-72">
          <app-chart
            [config]="brandChart()"
            (pick)="openBrand($event.index)"
            label="Däck i lager per märke"
          />
        </div>
      </app-panel>

      @if (admin) {
        <app-panel
          class="xl:col-span-2"
          title="Lagervärde över tid"
          [subtitle]="valueNote()"
          [loading]="loading()"
          [table]="valueTable()"
          [empty]="!loading() && !history().length"
          emptyText="Lagerhistoriken fylls på när det finns lagerrörelser."
        >
          <div class="h-52">
            <app-chart [config]="valueChart()" label="Lagervärde de senaste 90 dagarna" />
          </div>
        </app-panel>
      }

      <app-panel
        title="Säsong"
        subtitle="Däck i lager"
        [loading]="loading()"
        [empty]="!loading() && !articles().length"
        emptyText="Inga däck i lager än."
      >
        <app-mix-bar [parts]="mix()" unit="däck" />
      </app-panel>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      <app-panel
        [class]="hasAges() ? 'xl:col-span-2' : 'xl:col-span-3'"
        title="Att beställa"
        [subtitle]="
          orders().length ? 'Slut eller under beställningspunkten. Det som är mest akut först.' : ''
        "
        [loading]="loading()"
      >
        @if (orders().length) {
          <ul class="divide-y divide-gray-100">
            @for (o of ordersTop(); track o.article.id) {
              <li>
                <a
                  [routerLink]="['/inventory', o.article.id]"
                  class="grid min-h-12 items-center gap-x-4 gap-y-1 py-2 hover:bg-gray-50 max-md:grid-cols-[1fr_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]"
                >
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium">{{ title(o.article) }}</span>
                    <span class="block truncate text-xs text-gray-500"
                      >{{ o.article.code
                      }}{{ o.article.location ? ' · ' + o.article.location : '' }}</span
                    >
                  </span>
                  <span class="truncate text-sm text-gray-500 max-md:hidden">{{
                    o.article.supplier || '–'
                  }}</span>
                  <span class="flex items-center gap-2">
                    <span
                      class="h-2 min-w-16 flex-1 overflow-hidden rounded-full"
                      [style.background]="track(o)"
                      aria-hidden="true"
                    >
                      <span
                        class="block h-full rounded-full"
                        [style.width.%]="Math.max(o.ratio * 100, 4)"
                        [style.background]="fill(o)"
                      ></span>
                    </span>
                    <span
                      class="inline-flex w-24 shrink-0 items-center gap-1 text-xs font-medium"
                      [class]="o.article.quantity <= 0 ? 'text-red-700' : 'text-amber-800'"
                    >
                      <mat-icon class="!h-4 !w-4 !text-sm">{{
                        o.article.quantity <= 0 ? 'error' : 'warning'
                      }}</mat-icon>
                      {{
                        o.article.quantity <= 0
                          ? 'Slut'
                          : o.article.quantity + ' av ' + o.article.reorderLevel
                      }}
                    </span>
                  </span>
                  <mat-icon class="text-gray-300 max-md:hidden">chevron_right</mat-icon>
                </a>
              </li>
            }
          </ul>
          @if (orders().length > ordersTop().length) {
            <a
              routerLink="/inventory"
              [queryParams]="{ lowStock: true }"
              class="mt-2 inline-block text-sm font-medium text-brand hover:underline"
              >Visa alla {{ orders().length }}</a
            >
          }
        } @else if (!loading()) {
          <p class="py-4 text-sm text-gray-500">Inget är slut eller under beställningspunkten.</p>
        }
      </app-panel>

      @if (hasAges()) {
        <app-panel
          title="Däckens ålder"
          [subtitle]="ageNote()"
          [loading]="loading()"
          [table]="ageTable()"
        >
          <div class="h-56">
            <app-chart [config]="ageChart()" label="Däck i lager efter ålder" />
          </div>
        </app-panel>
      }
    </div>
  `,
})
export class StockOverview {
  private readonly insights = inject(Insights);
  private readonly api = inject(AxleApi);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly now = new Date();

  readonly tabs = STOCK_TABS;
  readonly Math = Math;
  readonly fmt = fmt;
  readonly kr = kronor;
  /** Lagervärdet och dess utveckling är inköpspriser: bara för ägaren. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();

  readonly loading = signal(true);
  readonly articles = signal<Article[]>([]);
  readonly summary = signal<Summary | null>(null);
  readonly history = signal<StockHistoryPoint[]>([]);

  readonly tyreUnits = computed(() =>
    this.articles().reduce((t, a) => t + (a.tyre && a.active ? a.quantity : 0), 0),
  );
  readonly tyreArticles = computed(() => this.articles().filter((a) => a.tyre && a.active).length);

  // --- fälgstorlek och säsong ---
  private readonly rims = computed(() => byRim(this.articles()));
  readonly rimChart = computed(() => {
    const r = this.rims();
    return columns({
      labels: r.map((x) => `${x.rim}"`),
      stacked: true,
      title: (i) => `${r[i].rim}-tums fälg`,
      series: [
        { label: 'Vinter', data: r.map((x) => x.winter), color: SEASON.winter },
        { label: 'Sommar', data: r.map((x) => x.summer), color: SEASON.summer },
        { label: 'Helår', data: r.map((x) => x.all_season), color: SEASON.all_season },
      ],
      format: (v) => `${fmt(v)} st`,
      footer: (i) => [
        `Totalt ${fmt(r[i].winter + r[i].summer + r[i].all_season)} däck` +
          (r[i].studded ? `, varav ${fmt(r[i].studded)} dubbade` : ''),
      ],
    });
  });
  readonly rimTable = computed<PanelTable>(() => ({
    head: ['Fälg', 'Vinter', 'Sommar', 'Helår', 'Varav dubbade'],
    rows: this.rims().map((r) => [`${r.rim}"`, r.winter, r.summer, r.all_season, r.studded]),
  }));

  // --- märken ---
  private readonly brands = computed(() => byBrand(this.articles(), 7));
  readonly brandChart = computed(() => {
    const b = this.brands();
    return bars({
      labels: b.map((x) => x.brand),
      series: [
        {
          label: 'Däck',
          data: b.map((x) => x.units),
          color: ACCENT,
          colors: b.map((x) => (x.brand === 'Övriga' ? OTHER : ACCENT)),
        },
      ],
      format: (v) => `${fmt(v)} st`,
    });
  });
  readonly brandTable = computed<PanelTable>(() => ({
    head: ['Märke', 'Däck'],
    rows: this.brands().map((b) => [b.brand, b.units]),
  }));

  // --- säsong ---
  readonly mix = computed<MixPart[]>(() => {
    const s = seasonUnits(this.articles());
    return [
      { key: 'winter', label: 'Vinter', value: s.winter, color: SEASON.winter },
      { key: 'summer', label: 'Sommar', value: s.summer, color: SEASON.summer },
      { key: 'all_season', label: 'Helår', value: s.all_season, color: SEASON.all_season },
    ];
  });

  // --- lagervärde över tid ---
  readonly trend = computed(() => {
    const h = this.history();
    return h.length > 1 ? h.slice(-30).map((p) => p.stockValue) : [];
  });
  readonly valueChart = computed(() => {
    const h = this.history();
    return line({
      labels: h.map((p) => day(p.date)),
      label: 'Lagervärde',
      data: h.map((p) => p.stockValue / 100),
      format: fmtKr,
      tick: tickKr,
    });
  });
  readonly valueNote = computed(() => {
    const h = this.history();
    if (h.length < 2) return 'Inköpsvärde exkl. moms, per dag.';
    const last = h[h.length - 1];
    const from = h[Math.max(0, h.length - 31)];
    const diff = last.stockValue - from.stockValue;
    return `Inköpsvärde exkl. moms. Nu ${kronor(last.stockValue)}, ${diff >= 0 ? '+' : '−'}${kronor(Math.abs(diff))} på 30 dagar.`;
  });
  readonly valueTable = computed<PanelTable>(() => ({
    head: ['Datum', 'Artiklar med lager', 'Antal', 'Värde'],
    rows: this.history()
      .slice()
      .reverse()
      .map((p) => [p.date, p.articles, p.units, kronor(p.stockValue)]),
  }));

  // --- ålder (DOT-koden) ---
  private readonly ages = computed(() => dotAges(this.articles(), this.now));
  readonly hasAges = computed(() => this.ages().buckets.some((b) => b.units > 0));
  readonly ageChart = computed(() => {
    const a = this.ages().buckets;
    return columns({
      labels: a.map((x) => x.label),
      allLabels: true,
      series: [
        {
          label: 'Däck',
          data: a.map((x) => x.units),
          color: ACCENT,
          colors: a.map((x) => (x.key === 'y4' ? STATUS.warning : ACCENT)),
        },
      ],
      format: (v) => `${fmt(v)} st`,
    });
  });
  readonly ageTable = computed<PanelTable>(() => ({
    head: ['Ålder', 'Däck'],
    rows: this.ages().buckets.map((b) => [b.label, b.units]),
  }));
  readonly ageNote = computed(() => {
    const u = this.ages().unknownUnits;
    return (
      'Efter DOT-koden. Äldre däck är svårare att sälja, sälj dem först.' +
      (u ? ` ${fmt(u)} st saknar kod.` : '')
    );
  });

  // --- att beställa ---
  readonly orders = computed<Reorder[]>(() => toOrder(this.articles()));
  readonly ordersTop = computed(() => this.orders().slice(0, 10));

  constructor() {
    forkJoin({
      articles: this.insights.articles(true).pipe(catchError(() => of([] as Article[]))),
      summary: this.api.summary().pipe(catchError(() => of(null))),
      history: this.admin
        ? this.insights
            .stockHistory(this.now, 90)
            .pipe(catchError(() => of([] as StockHistoryPoint[])))
        : of([] as StockHistoryPoint[]),
    }).subscribe(({ articles, summary, history }) => {
      this.articles.set(articles);
      this.summary.set(summary);
      this.history.set(history);
      this.loading.set(false);
    });
  }

  openRim(i: number) {
    const r = this.rims()[i];
    if (r)
      void this.router.navigate(['/inventory'], {
        queryParams: { category: 'tyre', rimDiameter: r.rim },
      });
  }

  openBrand(i: number) {
    const b = this.brands()[i];
    if (b && b.brand !== 'Övriga')
      void this.router.navigate(['/inventory'], { queryParams: { brand: b.brand } });
  }

  title(a: Article): string {
    return a.sizeLabel ? [a.sizeLabel, a.brand, a.model].filter(Boolean).join(' ') : a.label;
  }

  /** Mätaren: fyllningen visar allvaret (slut = kritiskt, lågt = varning), banan är en ljusare nyans. */
  fill(o: Reorder): string {
    return o.article.quantity <= 0 ? STATUS.critical : STATUS.warning;
  }
  track(o: Reorder): string {
    return tint(this.fill(o), 0.8);
  }
}
