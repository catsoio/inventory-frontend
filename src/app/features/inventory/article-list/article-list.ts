import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs';
import { InventoryApi } from '../../../core/api/inventory-api';
import { Auth } from '../../../core/auth/auth';
import {
  Article,
  ArticleQuery,
  FacetItem,
  Facets,
  SEASON_LABELS,
  Season,
} from '../../../core/models';
import { KrPipe } from '../../../shared/kr-pipe';
import { Settings } from '../../../core/settings';

type Sel = Record<string, string | number | boolean | undefined>;
type Status = '' | 'in' | 'low' | 'out';
interface Col {
  key: string;
  label: string;
  right?: boolean;
  hide?: string;
  val: (a: Article) => string | number;
  fmt: (a: Article) => string;
}

const kr = new KrPipe();
const VIEW_KEY = 'garagestock.view';
const COLS_KEY = 'garagestock.cols';
// Kolumner som backend kan sortera på (hela lagret); övriga sorteras bland inlästa rader.
const SERVER_SORT = [
  'brand',
  'model',
  'location',
  'quantity',
  'sellPrice',
  'averageCost',
  'lastPurchasedAt',
];
const DEFAULT_HIDDEN = ['reorderLevel', 'averageCost', 'stockValue', 'supplier', 'lastPurchasedAt'];

const COLS: Col[] = [
  { key: 'sku', label: 'Nr', val: (a) => a.sku ?? '', fmt: (a) => a.sku ?? '–' },
  {
    key: 'size',
    label: 'Storlek',
    val: (a) => a.tyre.sizeLabel ?? '',
    fmt: (a) => a.tyre.sizeLabel ?? '',
  },
  { key: 'brand', label: 'Märke', val: (a) => a.brand, fmt: (a) => a.brand },
  { key: 'model', label: 'Modell', val: (a) => a.model, fmt: (a) => a.model },
  {
    key: 'season',
    label: 'Säsong',
    val: (a) => a.tyre.season,
    fmt: (a) => SEASON_LABELS[a.tyre.season] + (a.tyre.studded ? ' (dubb)' : ''),
  },
  {
    key: 'location',
    label: 'Hyllplats',
    val: (a) => a.location ?? '',
    fmt: (a) => a.location || '–',
  },
  {
    key: 'quantity',
    label: 'Lager',
    right: true,
    val: (a) => a.quantity,
    fmt: (a) => String(a.quantity),
  },
  {
    key: 'reorderLevel',
    label: 'Best.punkt',
    right: true,
    val: (a) => a.reorderLevel,
    fmt: (a) => String(a.reorderLevel),
  },
  {
    key: 'averageCost',
    label: 'Snittkostnad',
    right: true,
    val: (a) => a.averageCost,
    fmt: (a) => kr.transform(a.averageCost),
  },
  {
    key: 'sellPrice',
    label: 'Pris',
    right: true,
    val: (a) => a.sellPrice,
    fmt: (a) => kr.transform(a.sellPrice),
  },
  {
    key: 'marginPercent',
    label: 'Marginal',
    right: true,
    val: (a) => a.marginPercent,
    fmt: (a) => `${a.marginPercent.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} %`,
  },
  {
    key: 'stockValue',
    label: 'Lagervärde',
    right: true,
    val: (a) => a.stockValue,
    fmt: (a) => kr.transform(a.stockValue),
  },
  {
    key: 'supplier',
    label: 'Leverantör',
    val: (a) => a.supplier ?? '',
    fmt: (a) => a.supplier || '–',
  },
  {
    key: 'lastPurchasedAt',
    label: 'Senaste inköp',
    val: (a) => a.lastPurchasedAt ?? '',
    fmt: (a) => (a.lastPurchasedAt ? new Date(a.lastPurchasedAt).toLocaleDateString('sv-SE') : '–'),
  },
];

@Component({
  selector: 'app-article-list',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      <h1 class="mr-2 text-2xl font-semibold">Artiklar</h1>
      <div class="relative max-w-md min-w-56 flex-1">
        <mat-icon class="pointer-events-none absolute top-2 left-2 text-gray-400">search</mat-icon>
        <input
          #searchEl
          type="search"
          [formControl]="search"
          (keydown.enter)="openIfSingle()"
          placeholder="Sök storlek, märke, säsong…"
          class="focus:border-brand focus:ring-brand h-10 w-full rounded-lg border border-gray-300 bg-white pr-3 pl-10 outline-none focus:ring-1"
        />
      </div>
      <span class="flex-1"></span>
      <button
        mat-icon-button
        class="lg:!hidden"
        title="Filter"
        (click)="showFilters.set(!showFilters())"
      >
        <mat-icon>filter_list</mat-icon>
      </button>
      @if (view() === 'table') {
        <button mat-icon-button [matMenuTriggerFor]="colMenu" title="Välj kolumner">
          <mat-icon>view_column</mat-icon>
        </button>
        <button
          mat-icon-button
          title="Filtrera per kolumn"
          [class.text-brand]="showColFilters()"
          (click)="showColFilters.set(!showColFilters())"
        >
          <mat-icon>filter_alt</mat-icon>
        </button>
      }
      <mat-menu #colMenu="matMenu">
        @for (c of cols; track c.key) {
          <button mat-menu-item (click)="toggleCol(c.key); $event.stopPropagation()">
            <mat-icon>{{
              visible().has(c.key) ? 'check_box' : 'check_box_outline_blank'
            }}</mat-icon>
            {{ c.label }}
          </button>
        }
      </mat-menu>
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="view()"
        (change)="setView($event.value)"
        aria-label="Vy"
      >
        <mat-button-toggle value="table" aria-label="Tabell"
          ><mat-icon>table_rows</mat-icon></mat-button-toggle
        >
        <mat-button-toggle value="cards" aria-label="Kort"
          ><mat-icon>grid_view</mat-icon></mat-button-toggle
        >
      </mat-button-toggle-group>
      <a mat-flat-button color="primary" routerLink="new"><mat-icon>add</mat-icon> Ny artikel</a>
    </div>

    <div class="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <aside
        class="max-h-[50vh] w-full shrink-0 overflow-y-auto rounded-lg border bg-white p-3 lg:max-h-none lg:w-60"
        [class]="showFilters() ? 'block' : 'hidden lg:block'"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="font-semibold">Filter</span>
          @if (activeFilters()) {
            <button class="text-sm text-brand underline" (click)="clearFilters()">Rensa</button>
          }
        </div>

        <div class="mb-1 text-xs font-semibold text-gray-500 uppercase">Status</div>
        @for (s of statuses; track s[0]) {
          <button
            class="flex w-full justify-between rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
            [class]="status() === s[0] ? 'bg-brand-soft font-semibold text-brand' : ''"
            (click)="setStatus(s[0])"
          >
            {{ s[1] }}
          </button>
        }

        <div class="mt-3 mb-1 text-xs font-semibold text-gray-500 uppercase">Säsong</div>
        @for (s of seasons; track s[0]) {
          <button
            class="flex w-full justify-between rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
            [class]="sel()['season'] === s[0] ? 'bg-brand-soft font-semibold text-brand' : ''"
            (click)="toggle('season', s[0])"
          >
            {{ s[1] }}
          </button>
        }

        @if (facets(); as f) {
          @for (g of groups(f); track g.key) {
            <div class="mt-3 mb-1 text-xs font-semibold text-gray-500 uppercase">{{ g.title }}</div>
            <div class="max-h-44 overflow-y-auto">
              @for (i of g.items; track i.value) {
                <button
                  class="flex w-full justify-between rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
                  [class]="sel()[g.key] === i.value ? 'bg-brand-soft font-semibold text-brand' : ''"
                  (click)="toggle(g.key, i.value)"
                >
                  <span>{{ i.value }}</span
                  ><span class="text-gray-500">{{ i.units }}</span>
                </button>
              }
            </div>
          }
        }

        @if (admin) {
          <label class="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              [checked]="!!sel()['includeArchived']"
              (change)="toggle('includeArchived', true)"
            />
            Visa arkiverade
          </label>
        }
      </aside>

      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="mb-2 shrink-0 text-sm text-gray-500">
          Visar {{ rows().length }}
          {{
            hasColFilters() ? 'filtrerade rader av ' + items().length + ' inlästa' : 'av ' + total()
          }}
          artiklar
          @if (hasColFilters()) {
            <button class="ml-2 text-brand underline" (click)="colFilters.set({})">
              Rensa kolumnfilter
            </button>
          }
        </div>

        <div class="min-h-0 flex-1 overflow-auto rounded-lg border bg-white">
          @if (view() === 'table') {
            <table class="w-full border-collapse bg-white text-left text-sm">
              <thead class="sticky top-0 z-10 bg-gray-100 text-gray-600">
                <tr>
                  @for (c of visibleCols(); track c.key) {
                    <th
                      class="cursor-pointer px-3 py-2 whitespace-nowrap select-none hover:bg-gray-200"
                      [class]="(c.right ? 'text-right ' : '') + (c.hide ?? '')"
                      (click)="sortBy(c.key)"
                    >
                      {{ c.label }}{{ arrow(c.key) }}
                    </th>
                  }
                  <th class="px-3 py-2">Status</th>
                </tr>
                @if (showColFilters()) {
                  <tr>
                    @for (c of visibleCols(); track c.key) {
                      <th class="px-2 pb-2 font-normal">
                        <input
                          class="w-full min-w-16 rounded border bg-white px-2 py-1 text-sm text-gray-900"
                          [class.text-right]="c.right"
                          placeholder="Filter"
                          [value]="colFilters()[c.key] ?? ''"
                          (input)="setColFilter(c.key, $any($event.target).value)"
                        />
                      </th>
                    }
                    <th class="px-2 pb-2"></th>
                  </tr>
                }
              </thead>
              <tbody class="divide-y">
                @for (a of rows(); track a.id) {
                  <tr
                    class="h-11 cursor-pointer hover:bg-brand-soft"
                    [class.opacity-60]="!a.active"
                    (click)="open(a)"
                  >
                    @for (c of visibleCols(); track c.key; let first = $first) {
                      <td
                        class="px-3 py-2 whitespace-nowrap"
                        [class]="
                          (c.right ? 'text-right ' : '') +
                          (c.hide ?? '') +
                          (c.key === 'quantity' ? ' font-semibold' : '')
                        "
                        [class.border-l-4]="first"
                        [class.border-red-500]="first && a.stockLevel === 'out'"
                        [class.border-amber-400]="first && a.stockLevel === 'low'"
                        [class.border-green-500]="first && a.stockLevel === 'in_stock'"
                      >
                        {{ c.fmt(a) }}
                      </td>
                    }
                    <td class="px-3 py-2"><app-stock-badge [level]="a.stockLevel" /></td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              @for (a of rows(); track a.id) {
                <a
                  [routerLink]="a.id"
                  class="rounded-lg border-l-8 bg-white p-4 shadow-sm"
                  [class]="
                    a.stockLevel === 'out'
                      ? 'border-red-500'
                      : a.stockLevel === 'low'
                        ? 'border-amber-400'
                        : 'border-green-500'
                  "
                  [style.opacity]="a.active ? 1 : 0.6"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="text-xl font-semibold">{{ a.tyre.sizeLabel }}</div>
                    <app-stock-badge [level]="a.stockLevel" />
                  </div>
                  <div class="text-gray-700">{{ a.brand }} {{ a.model }}</div>
                  <div class="mt-2 flex items-center justify-between text-sm">
                    <span
                      ><b class="text-lg">{{ a.quantity }}</b> st ·
                      {{ a.location || 'Ingen plats' }}</span
                    >
                    <span class="font-medium">{{ a.sellPrice | kr }}</span>
                  </div>
                </a>
              }
            </div>
          }

          @if (!loading() && !items().length) {
            <p class="mt-6 text-center text-gray-500">Inga artiklar hittades.</p>
          }
          @if (loading()) {
            <mat-progress-bar class="mt-4" mode="indeterminate" />
          }
          @if (total() > items().length) {
            <div class="my-4 text-center">
              <button mat-stroked-button (click)="more()">Visa fler</button>
            </div>
          }
        </div>
      </section>
    </div>
  `,
})
export class ArticleList implements OnInit {
  private readonly api = inject(InventoryApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly searchEl = viewChild<ElementRef<HTMLInputElement>>('searchEl');
  private readonly load$ = new Subject<number>();
  private readonly settings = inject(Settings).value();
  private readonly PAGE = this.settings.pageSize;

  readonly admin = inject(Auth).isAdmin();
  readonly cols = COLS;
  readonly search = new FormControl('', { nonNullable: true });
  readonly seasons = Object.entries(SEASON_LABELS);
  readonly statuses: [Status, string][] = [
    ['', 'Alla'],
    ['in', 'I lager'],
    ['low', 'Lågt lager'],
    ['out', 'Slut'],
  ];

  readonly facets = signal<Facets | null>(null);
  readonly sel = signal<Sel>({});
  readonly items = signal<Article[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly showFilters = signal(false);
  readonly showColFilters = signal(false);
  readonly view = signal<'table' | 'cards'>(
    (localStorage.getItem(VIEW_KEY) as 'table' | 'cards' | null) ??
      (this.settings.defaultView !== 'auto'
        ? this.settings.defaultView
        : window.innerWidth >= 1024
          ? 'table'
          : 'cards'),
  );
  readonly sort = signal<{ key: string; dir: 1 | -1 } | null>(null);

  readonly status = computed<Status>(() => {
    const s = this.sel();
    return s['lowStock']
      ? 'low'
      : s['inStock'] === true
        ? 'in'
        : s['inStock'] === false
          ? 'out'
          : '';
  });
  readonly activeFilters = computed(() => Object.values(this.sel()).some((v) => v !== undefined));

  readonly visible = signal<Set<string>>(
    new Set(
      JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null') ??
        COLS.filter((c) => !DEFAULT_HIDDEN.includes(c.key) || window.innerWidth >= 1536).map(
          (c) => c.key,
        ),
    ),
  );
  readonly visibleCols = computed(() => COLS.filter((c) => this.visible().has(c.key)));
  readonly colFilters = signal<Record<string, string>>({});
  readonly hasColFilters = computed(() => Object.values(this.colFilters()).some((v) => v.trim()));

  readonly rows = computed(() => {
    const f = Object.entries(this.colFilters()).filter(([, v]) => v.trim());
    const base = f.length
      ? this.items().filter((a) =>
          f.every(([k, v]) =>
            COLS.find((c) => c.key === k)
              ?.fmt(a)
              .toLowerCase()
              .includes(v.trim().toLowerCase()),
          ),
        )
      : this.items();
    const s = this.sort();
    const col = s && COLS.find((c) => c.key === s.key);
    if (!s || !col || SERVER_SORT.includes(s.key)) return base;
    return [...base].sort((a, b) => {
      const x = col.val(a);
      const y = col.val(b);
      return (
        (typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'sv')) * s.dir
      );
    });
  });

  constructor() {
    afterNextRender(() => {
      if (window.innerWidth >= 768) this.searchEl()?.nativeElement.focus();
    });
  }

  ngOnInit() {
    this.api.facets().subscribe((f) => this.facets.set(f));

    this.search.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load$.next(0));

    this.load$
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((offset) => this.api.articles(this.query(offset))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (p) => {
          this.items.update((cur) => (p.pagination.offset === 0 ? p.items : [...cur, ...p.items]));
          this.total.set(p.pagination.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });

    // Måste prenumereras efter load$ så att första emissionen inte tappas.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
      const flag = (k: string) => (q.has(k) ? q.get(k) === 'true' : undefined);
      this.search.setValue(q.get('q') ?? '', { emitEvent: false });
      if (q.has('sort')) {
        this.sort.set({ key: q.get('sort')!, dir: q.get('order') === 'desc' ? -1 : 1 });
      }
      this.sel.update((s) => ({
        ...s,
        lowStock: flag('lowStock') || undefined,
        inStock: flag('inStock'),
      }));
      this.load$.next(0);
    });

    this.load$
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((offset) => this.api.articles(this.query(offset))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (p) => {
          this.items.update((cur) => (p.pagination.offset === 0 ? p.items : [...cur, ...p.items]));
          this.total.set(p.pagination.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  groups(f: Facets): { key: string; title: string; items: FacetItem[] }[] {
    return [
      { key: 'rimDiameter', title: 'Fälg', items: f.rimDiameters },
      { key: 'width', title: 'Bredd', items: f.widths },
      { key: 'profile', title: 'Profil', items: f.profiles },
      { key: 'brand', title: 'Märke', items: f.brands },
    ];
  }

  toggle(key: string, value: string | number | boolean) {
    this.sel.update((s) => ({ ...s, [key]: s[key] === value ? undefined : value }));
    this.load$.next(0);
  }

  setStatus(s: Status) {
    this.sel.update((x) => ({
      ...x,
      lowStock: s === 'low' ? true : undefined,
      inStock: s === 'in' ? true : s === 'out' ? false : undefined,
    }));
    this.load$.next(0);
  }

  clearFilters() {
    this.sel.set({});
    this.search.setValue('', { emitEvent: false });
    this.router.navigate([], { queryParams: {} });
    this.load$.next(0);
  }

  setView(v: 'table' | 'cards') {
    this.view.set(v);
    localStorage.setItem(VIEW_KEY, v);
  }

  toggleCol(key: string) {
    this.visible.update((v) => {
      const n = new Set(v);
      if (!n.delete(key)) n.add(key);
      localStorage.setItem(COLS_KEY, JSON.stringify([...n]));
      return n;
    });
  }

  setColFilter(key: string, value: string) {
    this.colFilters.update((f) => ({ ...f, [key]: value }));
  }

  sortBy(key: string) {
    const prev = this.sort();
    this.sort.update((s) =>
      s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 },
    );
    if (SERVER_SORT.includes(key) || (prev && SERVER_SORT.includes(prev.key))) this.load$.next(0);
  }

  arrow(key: string) {
    const s = this.sort();
    return s?.key === key ? (s.dir === 1 ? ' ▲' : ' ▼') : '';
  }

  more() {
    this.load$.next(this.items().length);
  }

  open(a: Article) {
    this.router.navigate(['/inventory', a.id]);
  }

  openIfSingle() {
    const [only, ...rest] = this.items();
    if (only && !rest.length) this.open(only);
  }

  private query(offset: number): ArticleQuery {
    const s = this.sel();
    return {
      q: this.search.value.trim() || undefined,
      season: s['season'] as Season | undefined,
      brand: s['brand'] as string | undefined,
      rimDiameter: s['rimDiameter'] as number | undefined,
      width: s['width'] as number | undefined,
      profile: s['profile'] as number | undefined,
      lowStock: s['lowStock'] ? true : undefined,
      inStock: s['inStock'] as boolean | undefined,
      includeArchived: s['includeArchived'] ? true : undefined,
      sort: this.sort() && SERVER_SORT.includes(this.sort()!.key) ? this.sort()!.key : undefined,
      order:
        this.sort() && SERVER_SORT.includes(this.sort()!.key)
          ? this.sort()!.dir === 1
            ? 'asc'
            : 'desc'
          : undefined,
      limit: this.PAGE,
      offset,
    };
  }
}
