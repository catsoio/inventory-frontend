import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { InventoryApi } from '../../core/api/inventory-api';
import { StorageApi } from '../../core/api/storage-api';
import { Article, Report, itemKind } from '../../core/models';
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
  /** Ljus bakgrund. */
  tone: string;
}

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toLocaleDateString('sv-SE');

@Component({
  selector: 'app-dashboard',
  standalone: false,
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[1600px]">
      <h1 class="mb-6 text-2xl font-semibold">Översikt</h1>

      <ng-template #kpi let-c>
        <a [routerLink]="c.link" [queryParams]="c.params" class="block h-full">
          <div class="h-full rounded-xl p-5 transition hover:brightness-[0.97]" [class]="c.tone">
            <div class="flex items-start justify-between">
              <span class="text-sm text-gray-600">{{ c.label }}</span>
              <span class="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-gray-600"
                ><mat-icon>{{ c.icon }}</mat-icon></span
              >
            </div>
            <div class="mt-1 text-3xl font-semibold tracking-tight">{{ c.value }}</div>
            <div class="mt-1 flex min-h-5 items-center gap-2 text-sm">
              @if (c.delta; as d) {
                <span class="flex items-center font-medium" [class]="d.cls">
                  <mat-icon class="!h-5 !w-5 !text-base">{{ d.icon }}</mat-icon
                  >{{ d.text }}
                </span>
              }
              <span class="text-gray-500">{{ c.sub }}</span>
            </div>
          </div>
        </a>
      </ng-template>

      <div class="grid gap-x-10 gap-y-10 xl:grid-cols-3">
        <div class="flex min-w-0 flex-col gap-8 xl:col-span-2">
          <section>
            <h2 class="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Lagret just nu
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              @for (c of stockCards(); track c.label) {
                <ng-container
                  [ngTemplateOutlet]="kpi"
                  [ngTemplateOutletContext]="{ $implicit: c }"
                />
              }
            </div>
          </section>

          <section>
            <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Senaste {{ days() }} dagarna
              </h2>
              <a routerLink="/settings" class="text-xs text-gray-500 hover:underline"
                >Jämfört med föregående period · ändra period</a
              >
            </div>
            <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
              @for (c of periodCards(); track c.label) {
                <ng-container
                  [ngTemplateOutlet]="kpi"
                  [ngTemplateOutletContext]="{ $implicit: c }"
                />
              }
            </div>
          </section>
        </div>

        <section class="flex min-w-0 flex-col">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-lg font-semibold">
              <mat-icon class="text-gray-400">history</mat-icon> Senaste händelser
            </h2>
            <a mat-button routerLink="/reports">Visa logg</a>
          </div>
          <div class="flex-1 rounded-xl bg-white px-4 py-2 shadow-sm">
            <app-movement-list [compact]="true" [pageSize]="5" />
          </div>
        </section>

        <section class="min-w-0 xl:col-span-2">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-lg font-semibold">
              <mat-icon class="text-amber-500">warning</mat-icon> Behöver beställas
            </h2>
            <a mat-button routerLink="/inventory" [queryParams]="{ lowStock: true }"
              >Visa alla{{ lowTotal() > lowRows().length ? ' (' + lowTotal() + ')' : '' }}</a
            >
          </div>
          <app-data-table
            [columns]="lowCols"
            [rows]="lowRows()"
            [clickable]="true"
            [accent]="stockAccent"
            emptyText="Inga artiklar med lågt lager."
            (rowClick)="router.navigate(['/inventory', $event.id])"
          >
            <ng-template #cell let-a="row" let-c="col" let-text="text">
              @if (c.key === 'size') {
                <span class="inline-flex items-center gap-3">
                  <app-item-icon [kind]="kind(a)" />{{ text }}
                </span>
              } @else {
                {{ text }}
              }
            </ng-template>
          </app-data-table>
        </section>

        <section class="min-w-0">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-lg font-semibold">
              <mat-icon class="text-gray-400">warehouse</mat-icon> Däckhotell
            </h2>
            <a mat-button routerLink="/storage">Visa alla</a>
          </div>
          <div class="flex flex-col rounded-xl bg-white p-2 shadow-sm">
            @if (hotel(); as h) {
              <a
                routerLink="/storage"
                class="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-gray-50"
              >
                <span class="grid h-9 w-9 place-items-center rounded-full bg-sky-50 text-sky-700"
                  ><mat-icon>warehouse</mat-icon></span
                >
                <span class="flex-1 text-gray-600">Inlagrade set</span>
                <b
                  >{{ h.stored }}
                  <span class="font-normal text-gray-500">({{ h.units }} st)</span></b
                >
              </a>
              <a
                routerLink="/storage"
                [queryParams]="{ status: 'stored', paymentStatus: 'unpaid' }"
                class="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-gray-50"
              >
                <span
                  class="grid h-9 w-9 place-items-center rounded-full bg-amber-50 text-amber-700"
                  ><mat-icon>payments</mat-icon></span
                >
                <span class="flex-1 text-gray-600">Obetalda</span>
                <b
                  >{{ h.unpaid }}
                  <span class="font-normal text-gray-500">· {{ h.unpaidAmount | kr }}</span></b
                >
              </a>
              <a
                routerLink="/storage"
                [queryParams]="{ status: 'stored', overdue: true }"
                class="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-gray-50"
              >
                <span class="grid h-9 w-9 place-items-center rounded-full bg-red-50 text-red-700"
                  ><mat-icon>event_busy</mat-icon></span
                >
                <span class="flex-1 text-gray-600">Passerat hämtdatum</span>
                <b>{{ h.overdue }}</b>
              </a>
            } @else {
              <span class="p-3 text-gray-500">Laddar…</span>
            }
          </div>
        </section>
      </div>
    </div>
  `,
})
export class Dashboard {
  private readonly api = inject(InventoryApi);
  private readonly storage = inject(StorageApi);
  private readonly kr = new KrPipe();
  readonly router = inject(Router);

  readonly lowCols: DtCol<Article>[] = [
    {
      key: 'size',
      label: 'Mått',
      value: (a) => a.sizeLabel ?? '',
      fmt: (a) => a.sizeLabel || '–',
    },
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
  ];

  /** Perioden väljs under Inställningar. */
  readonly days = signal(inject(Settings).value().dashboardDays);
  readonly summary = toSignal(this.api.summary().pipe(catchError(() => of(null))));
  readonly low = toSignal(
    this.api.articles({ lowStock: true, limit: 50 }).pipe(catchError(() => of(null))),
  );
  readonly hotel = toSignal(this.storage.summary().pipe(catchError(() => of(null))));
  readonly cur = signal<Report | null>(null);
  readonly prev = signal<Report | null>(null);

  constructor() {
    this.load();
  }

  private load() {
    const d = this.days();
    this.api.report(day(-(d - 1)), day(0)).subscribe((r) => this.cur.set(r));
    this.api.report(day(-(2 * d - 1)), day(-d)).subscribe((r) => this.prev.set(r));
  }

  /** Röd = slut, gul = lågt lager (samma som i artikellistan). */
  readonly stockAccent = (a: Article) =>
    a.stockLevel === 'out' ? 'border-red-500' : a.stockLevel === 'low' ? 'border-amber-400' : null;
  readonly kind = (a: Article) => itemKind(a.category);
  readonly lowTotal = computed(() => this.low()?.pagination.total ?? 0);
  readonly lowRows = computed(() => (this.low()?.items ?? []).slice(0, 8));
  readonly stockCards = computed(() => this.cards().slice(0, 3));
  readonly periodCards = computed(() => this.cards().slice(3));

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
    // Ljusa toner: färgen antyder kategori utan att ta över sidan.
    return [
      {
        label: 'Artiklar',
        icon: 'inventory_2',
        value: s?.articles ?? '–',
        sub: 'Aktiva artiklar',
        link: inv,
        params: {},
        tone: 'bg-sky-50',
      },
      {
        label: 'Lågt lager',
        icon: 'warning',
        value: s?.lowStock ?? '–',
        sub: 'Behöver beställas',
        link: inv,
        params: { lowStock: true },
        tone: 'bg-amber-50',
      },
      {
        label: 'Slut',
        icon: 'block',
        value: s?.outOfStock ?? '–',
        sub: 'Inget kvar i lager',
        link: inv,
        params: { inStock: false },
        tone: 'bg-red-50',
      },
      {
        label: 'Sålda enheter',
        icon: 'shopping_cart',
        value: c ? `${c.soldUnits} st` : '–',
        sub: '',
        delta: this.delta(c?.soldUnits, p?.soldUnits, false),
        link: rep,
        params: {},
        tone: 'bg-green-50',
      },
      {
        label: 'Försäljning',
        icon: 'sell',
        value: c ? k(c.soldRevenue) : '–',
        sub: '',
        delta: this.delta(c?.soldRevenue, p?.soldRevenue, false),
        link: rep,
        params: {},
        tone: 'bg-blue-50',
      },
      {
        label: 'Bruttovinst',
        icon: 'trending_up',
        value: c ? k(c.grossProfit) : '–',
        sub: margin,
        delta: this.delta(c?.grossProfit, p?.grossProfit, false),
        link: rep,
        params: {},
        tone: 'bg-emerald-50',
      },
      {
        label: 'Inköp',
        icon: 'local_shipping',
        value: c ? k(c.purchasedCost) : '–',
        sub: c ? `${c.purchasedUnits} st` : '',
        delta: this.delta(c?.purchasedCost, p?.purchasedCost, false),
        link: rep,
        params: {},
        tone: 'bg-violet-50',
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
