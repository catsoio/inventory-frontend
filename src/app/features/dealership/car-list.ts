import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { CarApi } from '../../core/api/car-api';
import { Auth } from '../../core/auth/auth';
import { BlocketImporter } from '../../core/blocket-importer';
import { CarListing, LISTING_STATUS_LABELS, ListingStatus } from '../../core/models';
import {
  CAR_FLAGS,
  CarFlag,
  IDLE_DAYS,
  daysInStock,
  isCarFlag,
  matchesFlag,
} from '../../shared/car-stock';
import { carColorHex } from '../../shared/car-color';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import type { SectionTab } from '../../shared/page-header/page-header';

const kr = new KrPipe();
const money = (n: number | null | undefined) => (n == null ? '–' : kr.transform(n));
const costsOf = (c: CarListing) => c.costs.reduce((sum, x) => sum + x.amount, 0);

const totalCostOf = (c: CarListing) => (c.purchase?.price ?? 0) + costsOf(c);

const TONE: Record<ListingStatus, 'green' | 'amber' | 'gray' | 'blue'> = {
  active: 'green',
  reserved: 'amber',
  draft: 'gray',
  sold: 'blue',
};

const REG: DtCol<CarListing> = { key: 'regNo', label: 'Regnr', value: (c) => c.regNo };
const CAR: DtCol<CarListing> = { key: 'car', label: 'Bil', value: (c) => c.heading };
const YEAR: DtCol<CarListing> = {
  key: 'year',
  label: 'År',
  right: true,
  value: (c) => c.year ?? 0,
  fmt: (c) => `${c.year ?? '–'}`,
};
// Svenskar anger miltal i mil (10 km); registret och databasen har km.
const MILEAGE: DtCol<CarListing> = {
  key: 'mileage',
  label: 'Mil',
  right: true,
  value: (c) => c.mileageKm ?? 0,
  fmt: (c) =>
    c.mileageKm == null ? '–' : `${Math.round(c.mileageKm / 10).toLocaleString('sv-SE')}`,
};
const STATUS: DtCol<CarListing> = {
  key: 'status',
  label: 'Status',
  value: (c) => LISTING_STATUS_LABELS[c.status],
};
const PURCHASE: DtCol<CarListing> = {
  key: 'purchase',
  label: 'Inköpspris',
  right: true,
  value: (c) => c.purchase?.price ?? 0,
  fmt: (c) => money(c.purchase?.price),
};
const COLOR: DtCol<CarListing> = {
  key: 'color',
  label: 'Färg',
  value: (c) => c.color ?? '',
  fmt: (c) => c.color || '–',
};
const TOTAL_COST: DtCol<CarListing> = {
  key: 'totalCost',
  label: 'Total kostnad',
  right: true,
  value: totalCostOf,
  fmt: (c) => money(totalCostOf(c)),
};
/** Dagar i lager (standtid): det en bilhandlare sorterar på. */
const DAYS: DtCol<CarListing> = {
  key: 'days',
  label: 'Dagar',
  right: true,
  value: (c) => daysInStock(c),
  fmt: (c) => `${daysInStock(c)}`,
};
const PROFIT: DtCol<CarListing> = {
  key: 'profit',
  label: 'Vinst',
  right: true,
  value: (c) => c.economy.profit ?? 0,
  fmt: (c) => money(c.economy.profit),
};

/** Inköpta: bilarna som köpts in och ännu inte lagts ut till salu. */
const PURCHASES: DtCol<CarListing>[] = [
  REG,
  CAR,
  COLOR,
  YEAR,
  MILEAGE,
  {
    key: 'bought',
    label: 'Inköpt',
    value: (c) => c.purchase?.date ?? '',
    fmt: (c) => c.purchase?.date ?? '–',
  },
  {
    key: 'seller',
    label: 'Köpt av',
    value: (c) => c.purchase?.seller ?? '',
    fmt: (c) => c.purchase?.seller ?? '–',
  },
  PURCHASE,
  {
    key: 'costs',
    label: 'Lagt på bilen',
    right: true,
    value: costsOf,
    fmt: (c) => money(costsOf(c)),
  },
  DAYS,
];

/** Till salu: bilarna som är utlagda eller reserverade, med pris, marginal och hur länge de stått. */
const FOR_SALE: DtCol<CarListing>[] = [
  REG,
  CAR,
  COLOR,
  YEAR,
  STATUS,
  DAYS,
  PURCHASE,
  TOTAL_COST,
  {
    key: 'price',
    label: 'Pris',
    right: true,
    value: (c) => c.price ?? 0,
    fmt: (c) => (c.price == null ? 'På förfrågan' : money(c.price)),
  },
  PROFIT,
  {
    key: 'inquiries',
    label: 'Frågor',
    right: true,
    value: (c) => c.inquiries.length,
    fmt: (c) => (c.inquiries.length ? `${c.inquiries.length}` : ''),
  },
];

/** Sålda: vad bilen kostade, vad den såldes för och vad som blev kvar. */
const SOLD: DtCol<CarListing>[] = [
  REG,
  CAR,
  COLOR,
  { key: 'soldAt', label: 'Såld', value: (c) => c.soldAt ?? '', fmt: (c) => c.soldAt ?? '' },
  DAYS,
  PURCHASE,
  TOTAL_COST,
  {
    key: 'price',
    label: 'Såld för',
    right: true,
    value: (c) => c.soldPrice ?? 0,
    fmt: (c) => money(c.soldPrice),
  },
  PROFIT,
];

type Stage = 'all' | 'sales' | 'purchases' | 'sold';

const TABS: SectionTab[] = [
  { path: '/dealership/cars/all', label: 'Alla' },
  { path: '/dealership/cars', label: 'Till salu', exact: true },
  { path: '/dealership/cars/purchases', label: 'Inköpta' },
  { path: '/dealership/cars/sold', label: 'Sålda' },
];

/**
 * Bilarna i fyra vyer (undermeny i sidomenyn, flikar på mobil): Alla, Till salu (utlagda och
 * reserverade), Inköpta (ännu inte utlagda) och Sålda. På bred skärm visar ett kort bredvid listan bild,
 * uppgifter, ekonomi och de som hört av sig (`app-car-quick`).
 * Samma bilar, olika kolumner. En länk med `?flag=` (från Hem och menyns siffror) visar i stället alla
 * bilar i lager som flaggan gäller, oavsett flik. På mobil är varje bil ett fotokort med tid i lager.
 */
@Component({
  selector: 'app-car-list',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-page-header class="shrink-0" [tabs]="tabs" label="Bilar" [mobileOnly]="true" />
    @if (flag(); as f) {
      <app-callout
        class="mb-3 shrink-0"
        tone="info"
        [fixes]="[{ label: 'Visa alla bilar', icon: 'close', link: ['/dealership/cars'] }]"
      >
        Visar bilar som {{ flagText(f) }}.
      </app-callout>
    }
    @if (failed()) {
      <app-callout
        class="mb-3 shrink-0"
        tone="warn"
        [fixes]="[{ label: 'Försök igen', icon: 'refresh', click: reload }]"
      >
        Det gick inte att hämta bilarna.
      </app-callout>
    }
    <div class="min-h-0 flex-1">
      <app-list-page
        [title]="heading"
        [columns]="cols()"
        [rows]="shown()"
        [loading]="loading()"
        [newLink]="stage === 'sold' ? '' : '/dealership/cars/new'"
        newLabel="Ny bil"
        [emptyText]="empty()"
        searchPlaceholder="Sök regnr, märke eller modell…"
        [defaultSort]="null"
        (search)="query.set($event)"
        [highlight]="isSelected"
        (rowClick)="pick($event)"
        (rowDblClick)="open($event)"
      >
        @if (auth.isAdmin()) {
          <div actions class="contents">
            <button
              mat-stroked-button
              type="button"
              class="btn-icon max-md:!hidden"
              title="Fler åtgärder"
              aria-label="Fler åtgärder"
              [matMenuTriggerFor]="more"
            >
              <mat-icon>more_horiz</mat-icon>
            </button>
            <mat-menu #more="matMenu" xPosition="before">
              <!-- Ej inställt ger importen själv vägen till Anslutningar. -->
              <button
                mat-menu-item
                type="button"
                [disabled]="importing()"
                (click)="importFromBlocket()"
              >
                <mat-icon>cloud_download</mat-icon>
                {{ importing() ? 'Läser in…' : 'Läs in från Blocket' }}
              </button>
            </mat-menu>
          </div>
        }
        <!-- Mobil: ett fotokort per bil. -->
        <ng-template #card let-c="row">
          <div class="flex items-center gap-3">
            @if (cover(c); as src) {
              <img
                [src]="src"
                alt=""
                class="h-16 w-24 shrink-0 rounded-lg bg-gray-100 object-cover"
              />
            } @else {
              <span
                class="grid h-16 w-24 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-400"
              >
                <mat-icon>directions_car</mat-icon>
              </span>
            }
            <div class="min-w-0 flex-1">
              <div class="truncate text-[15px] font-semibold">{{ c.heading }}</div>
              <div class="mt-0.5 flex items-center gap-2">
                <app-reg-plate [value]="c.regNo" size="sm" />
                <app-pill [tone]="tone(c.status)">{{ statusText(c.status) }}</app-pill>
              </div>
              <div class="mt-1 flex items-baseline justify-between gap-2 text-sm">
                <span
                  class="text-xs"
                  [class]="
                    days(c) >= IDLE_DAYS && c.status !== 'sold'
                      ? 'font-medium text-red-700'
                      : 'text-gray-500'
                  "
                  >{{ days(c) }} dagar</span
                >
                <span class="font-semibold tabular-nums">{{ priceText(c) }}</span>
              </div>
            </div>
          </div>
        </ng-template>
        <ng-template #cell let-c="row" let-col="col" let-text="text">
          @if (col.key === 'status') {
            <app-pill [tone]="tone(c.status)">{{ text }}</app-pill>
          } @else if (col.key === 'color' && c.color) {
            <span
              class="mr-1.5 inline-block h-3.5 w-3.5 rounded-full align-middle ring-1 ring-black/20"
              [style.background]="hex(c.color)"
            ></span
            >{{ text }}
          } @else if (col.key === 'days' && c.status !== 'sold' && days(c) >= IDLE_DAYS) {
            <span class="font-medium text-red-700">{{ text }}</span>
          } @else {
            {{ text }}
          }
        </ng-template>
        <aside
          detail
          class="hidden min-h-0 w-[34%] max-w-[28rem] min-w-[22rem] shrink-0 overflow-y-auto lg:block"
        >
          @if (selectedCar(); as c) {
            <app-car-quick [car]="c" />
          } @else {
            <div
              class="flex flex-col items-center gap-2 rounded-xl bg-white p-10 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/5"
            >
              <mat-icon class="!h-10 !w-10 !text-4xl text-gray-300">directions_car</mat-icon>
              Välj en bil i listan för att se bilden, uppgifterna, ekonomin och vilka som hört av
              sig.
            </div>
          }
        </aside>
      </app-list-page>
    </div>
    @if (stage === 'sold' && sold().length > 0) {
      <p class="shrink-0 pt-3 text-sm text-gray-700">{{ summary() }}</p>
    }
  `,
})
export class CarList {
  private readonly api = inject(CarApi);
  private readonly importer = inject(BlocketImporter);
  readonly auth = inject(Auth);
  readonly importing = signal(false);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly stage = this.route.snapshot.data['stage'] as Stage;
  /** Sidans rubrik: samma namn som posten i Bilar-menyn. */
  readonly heading = {
    all: 'Alla bilar',
    sales: 'Till salu',
    purchases: 'Inköpta',
    sold: 'Sålda',
  }[this.stage];

  readonly tabs = TABS;
  readonly IDLE_DAYS = IDLE_DAYS;
  readonly hex = carColorHex;
  readonly days = (c: CarListing) => daysInStock(c);
  readonly statusText = (s: ListingStatus) => LISTING_STATUS_LABELS[s];
  readonly flagText = (f: CarFlag) => CAR_FLAGS[f];
  readonly cover = (c: CarListing) => (c.imageUrls[0] ? environment.apiUrl + c.imageUrls[0] : '');
  readonly priceText = (c: CarListing) =>
    c.status === 'sold' ? money(c.soldPrice) : c.price == null ? 'På förfrågan' : money(c.price);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  /** `?flag=` visar bilarna en flagga gäller, över alla flikar. */
  readonly flag = computed<CarFlag | null>(() => {
    const f = this.params().get('flag');
    return isCarFlag(f) ? f : null;
  });
  readonly cols = computed(() =>
    this.flag()
      ? FOR_SALE
      : this.stage === 'sold'
        ? SOLD
        : this.stage === 'purchases'
          ? PURCHASES
          : FOR_SALE,
  );
  readonly empty = computed(() => {
    if (this.failed()) return 'Det gick inte att hämta bilarna. Försök igen om en stund.';
    if (this.flag()) return 'Inga bilar att ta tag i. Allt är som det ska.';
    return this.stage === 'all'
      ? 'Inga bilar än. Skriv ett registreringsnummer så hämtas uppgifterna.'
      : this.stage === 'sold'
        ? 'Inga sålda bilar än.'
        : this.stage === 'purchases'
          ? 'Inga inköpta bilar. Skriv ett registreringsnummer så hämtas uppgifterna.'
          : 'Inga bilar till salu. Lägg ut en inköpt bil, eller köp in en ny.';
  });

  private readonly items = signal<CarListing[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly query = signal('');

  readonly shown = computed(() => {
    const q = this.query().toLowerCase();
    const flag = this.flag();
    const today = new Date();
    return this.items()
      .filter((c) => {
        const inStage = flag
          ? matchesFlag(flag, c, today)
          : this.stage === 'all'
            ? true
            : this.stage === 'purchases'
              ? c.status === 'draft'
              : this.stage === 'sold'
                ? c.status === 'sold'
                : c.status === 'active' || c.status === 'reserved';
        return inStage && (!q || `${c.regNo} ${c.heading}`.toLowerCase().includes(q));
      })
      .sort((a, b) =>
        this.stage === 'sold' && !flag
          ? (b.soldAt ?? '').localeCompare(a.soldAt ?? '')
          : daysInStock(b, today) - daysInStock(a, today),
      );
  });

  readonly sold = computed(() => this.shown().filter((c) => c.status === 'sold'));
  readonly summary = computed(() => {
    const sum = (f: (c: CarListing) => number) => this.sold().reduce((s, c) => s + f(c), 0);
    return `${this.sold().length} sålda · Såld för ${money(sum((c) => c.soldPrice ?? 0))} · Moms att betala ${money(sum((c) => c.economy.vatToPay ?? 0))} · Vinst ${money(sum((c) => c.economy.profit ?? 0))}`;
  });

  constructor() {
    this.load();
  }

  /** Hämtar bilarna; ett fel (t.ex. 429 vid många snabba sidbyten) visas, inte som en tom lista. */
  load() {
    this.failed.set(false);
    this.loading.set(true);
    this.api.list().subscribe({
      next: (r) => {
        this.items.set(r);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  readonly reload = () => this.load();

  /** Läser in bilarna som redan ligger på Blocket, direkt; listan läses om när något kom in. */
  async importFromBlocket() {
    this.importing.set(true);
    try {
      if (await this.importer.run()) this.load();
    } finally {
      this.importing.set(false);
    }
  }

  tone(s: ListingStatus) {
    return TONE[s];
  }

  /** Bred skärm: visa bilen i panelen. Smal skärm: öppna bilens kort. */
  pick(c: CarListing) {
    if (window.matchMedia('(min-width: 1024px)').matches) this.selected.set(c.id);
    else this.open(c);
  }

  open(c: CarListing) {
    void this.router.navigate(['/dealership/cars', c.id]);
  }

  /** Bilen som visas i panelen (bred skärm). */
  readonly selected = signal<string | null>(null);
  readonly isSelected = (c: CarListing) => c.id === this.selected();
  readonly selectedCar = computed(() => this.shown().find((c) => c.id === this.selected()) ?? null);
}
