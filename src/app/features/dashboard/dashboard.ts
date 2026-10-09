import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { InventoryApi } from '../../core/api/inventory-api';
import { Article, Report } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { Settings } from '../../core/settings';
import { KrPipe } from '../../shared/kr-pipe';

interface Delta {
  text: string;
  icon: string;
  cls: string;
}

interface Card {
  label: string;
  icon: string;
  value: string | number;
  sub: string;
  delta?: Delta;
  link: string;
  params: Record<string, string | number | boolean>;
  border: string;
}

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toLocaleDateString('sv-SE');

@Component({
  selector: 'app-dashboard',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">Översikt</h1>
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="days()"
        (change)="setDays($event.value)"
      >
        <mat-button-toggle [value]="7">7 dagar</mat-button-toggle>
        <mat-button-toggle [value]="30">30 dagar</mat-button-toggle>
        <mat-button-toggle [value]="90">90 dagar</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    <div class="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      @for (c of cards(); track c.label) {
        <a [routerLink]="c.link" [queryParams]="c.params" class="block">
          <mat-card class="h-full border-t-4 p-4 transition hover:shadow-md" [class]="c.border">
            <div class="flex items-center justify-between text-gray-500">
              <span class="text-sm">{{ c.label }}</span>
              <mat-icon>{{ c.icon }}</mat-icon>
            </div>
            <div class="mt-1 text-2xl font-semibold">{{ c.value }}</div>
            <div class="mt-1 flex min-h-5 items-center gap-2 text-sm">
              @if (c.delta; as d) {
                <span class="flex items-center font-medium" [class]="d.cls">
                  <mat-icon class="!h-5 !w-5 !text-base">{{ d.icon }}</mat-icon
                  >{{ d.text }}
                </span>
              }
              <span class="text-gray-500">{{ c.sub }}</span>
            </div>
          </mat-card>
        </a>
      }
    </div>
    <div class="mt-1 shrink-0 text-xs text-gray-500">
      Kort med period visar de senaste {{ days() }} dagarna, jämfört med de {{ days() }} dagarna
      före.
    </div>

    <div class="mt-6 grid min-h-0 flex-1 gap-6 xl:grid-cols-3">
      <section class="flex min-h-72 min-w-0 flex-col xl:col-span-2">
        <div class="mb-1 flex shrink-0 items-center justify-between">
          <h2 class="flex items-center gap-2 text-xl font-semibold">
            <mat-icon class="text-amber-500">warning</mat-icon> Behöver beställas
          </h2>
          <a mat-button routerLink="/inventory" [queryParams]="{ lowStock: true }">Visa alla</a>
        </div>
        <app-data-table
          class="min-h-0 flex-1"
          [columns]="lowCols"
          [rows]="low()?.items"
          [clickable]="true"
          emptyText="Inga artiklar med lågt lager."
          (rowClick)="router.navigate(['/inventory', $event.id])"
        >
          <ng-template #cell let-a="row" let-c="col" let-text="text">
            @if (c.key === 'status') {
              <app-stock-badge [level]="a.stockLevel" />
            } @else {
              {{ text }}
            }
          </ng-template>
        </app-data-table>
      </section>

      <aside class="flex min-h-72 min-w-0 flex-col gap-4">
        <section class="shrink-0">
          <h2 class="mb-2 text-xl font-semibold">Genvägar</h2>
          <div class="flex flex-wrap gap-2">
            <a mat-flat-button color="primary" routerLink="/inventory/new"
              ><mat-icon>add</mat-icon> Ny artikel</a
            >
            <a mat-stroked-button routerLink="/sales"><mat-icon>point_of_sale</mat-icon> Sälj</a>
            <a mat-stroked-button routerLink="/purchases"
              ><mat-icon>local_shipping</mat-icon> Inköp</a
            >
          </div>
        </section>
        <section class="flex min-h-0 flex-1 flex-col">
          <div class="mb-1 flex shrink-0 items-center justify-between">
            <h2 class="flex items-center gap-2 text-xl font-semibold">
              <mat-icon>history</mat-icon> Senaste händelser
            </h2>
            <a mat-button routerLink="/reports">Visa logg</a>
          </div>
          <mat-card class="min-h-0 flex-1 overflow-y-auto p-3">
            <app-movement-list [compact]="true" [pageSize]="15" />
          </mat-card>
        </section>
      </aside>
    </div>
  `,
})
export class Dashboard {
  private readonly api = inject(InventoryApi);
  private readonly kr = new KrPipe();
  readonly router = inject(Router);

  readonly lowCols: DtCol<Article>[] = [
    { key: 'size', label: 'Storlek', value: (a) => a.tyre.sizeLabel ?? '' },
    { key: 'article', label: 'Artikel', value: (a) => `${a.brand} ${a.model}` },
    {
      key: 'location',
      label: 'Hyllplats',
      value: (a) => a.location ?? '',
      fmt: (a) => a.location || '–',
    },
    { key: 'qty', label: 'Lager', right: true, value: (a) => a.quantity },
    { key: 'reorder', label: 'Best.punkt', right: true, value: (a) => a.reorderLevel },
    {
      key: 'supplier',
      label: 'Leverantör',
      value: (a) => a.supplier ?? '',
      fmt: (a) => a.supplier || '–',
    },
    { key: 'status', label: 'Status', value: (a) => a.quantity },
  ];

  readonly days = signal(inject(Settings).value().dashboardDays);
  readonly summary = toSignal(this.api.summary().pipe(catchError(() => of(null))));
  readonly low = toSignal(
    this.api.articles({ lowStock: true, limit: 50 }).pipe(catchError(() => of(null))),
  );
  readonly cur = signal<Report | null>(null);
  readonly prev = signal<Report | null>(null);

  constructor() {
    this.load();
  }

  setDays(d: number) {
    this.days.set(d);
    this.load();
  }

  private load() {
    const d = this.days();
    this.api.report(day(-(d - 1)), day(0)).subscribe((r) => this.cur.set(r));
    this.api.report(day(-(2 * d - 1)), day(-d)).subscribe((r) => this.prev.set(r));
  }

  cards(): Card[] {
    const s = this.summary();
    const c = this.cur();
    const p = this.prev();
    const k = (o: number | undefined | null) => this.kr.transform(o ?? 0);
    const d = this.days();
    const margin =
      c && c.soldRevenue ? `${Math.round((c.grossProfit / c.soldRevenue) * 100)} % marginal` : '';
    const inv = '/inventory';
    const rep = '/reports';
    return [
      {
        label: 'Artiklar',
        icon: 'inventory_2',
        value: s?.articles ?? '–',
        sub: 'Aktiva artiklar',
        link: inv,
        params: {},
        border: 'border-brand',
      },
      {
        label: 'Däck i lager',
        icon: 'layers',
        value: s?.units ?? '–',
        sub: 'Totalt antal däck',
        link: inv,
        params: { inStock: true },
        border: 'border-green-500',
      },
      {
        label: 'Lagervärde',
        icon: 'payments',
        value: s ? k(s.stockValue) : '–',
        sub: s ? `Säljvärde ${k(s.retailValue)}` : '',
        link: inv,
        params: { inStock: true, sort: 'averageCost', order: 'desc' },
        border: 'border-blue-500',
      },
      {
        label: 'Lågt lager',
        icon: 'warning',
        value: s?.lowStock ?? '–',
        sub: 'Behöver beställas',
        link: inv,
        params: { lowStock: true },
        border: 'border-amber-400',
      },
      {
        label: 'Slut',
        icon: 'block',
        value: s?.outOfStock ?? '–',
        sub: 'Inget kvar i lager',
        link: inv,
        params: { inStock: false },
        border: 'border-red-500',
      },

      {
        label: `Sålda däck · ${d} d`,
        icon: 'shopping_cart',
        value: c ? `${c.soldUnits} st` : '–',
        sub: '',
        delta: this.delta(c?.soldUnits, p?.soldUnits, false),
        link: rep,
        params: {},
        border: 'border-green-500',
      },
      {
        label: `Försäljning · ${d} d`,
        icon: 'sell',
        value: c ? k(c.soldRevenue) : '–',
        sub: '',
        delta: this.delta(c?.soldRevenue, p?.soldRevenue, false),
        link: rep,
        params: {},
        border: 'border-blue-500',
      },
      {
        label: `Bruttovinst · ${d} d`,
        icon: 'trending_up',
        value: c ? k(c.grossProfit) : '–',
        sub: margin,
        delta: this.delta(c?.grossProfit, p?.grossProfit, false),
        link: rep,
        params: {},
        border: 'border-green-500',
      },
      {
        label: `Inköp · ${d} d`,
        icon: 'local_shipping',
        value: c ? k(c.purchasedCost) : '–',
        sub: c ? `${c.purchasedUnits} st` : '',
        delta: this.delta(c?.purchasedCost, p?.purchasedCost, false),
        link: rep,
        params: {},
        border: 'border-brand',
      },
      {
        label: `Kasserat · ${d} d`,
        icon: 'delete_sweep',
        value: c ? k(c.writtenOffCost) : '–',
        sub: c ? `${c.writtenOffUnits} st` : '',
        delta: this.delta(c?.writtenOffCost, p?.writtenOffCost, true),
        link: rep,
        params: {},
        border: 'border-red-500',
      },
    ];
  }

  private delta(cur: number | undefined, prev: number | undefined, upIsBad: boolean): Delta {
    const flat: Delta = { text: '–', icon: 'remove', cls: 'text-gray-500' };
    if (cur == null || prev == null) return flat;
    if (prev === 0)
      return cur === 0
        ? flat
        : { text: 'Ny', icon: 'arrow_upward', cls: upIsBad ? 'text-red-600' : 'text-green-600' };
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    if (pct === 0) return { text: '0 %', icon: 'remove', cls: 'text-gray-500' };
    const up = pct > 0;
    return {
      text: `${Math.abs(pct)} %`,
      icon: up ? 'arrow_upward' : 'arrow_downward',
      cls: up === upIsBad ? 'text-red-600' : 'text-green-600',
    };
  }
}
