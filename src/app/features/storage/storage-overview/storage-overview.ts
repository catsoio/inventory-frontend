import { Component, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { StorageApi } from '../../../core/api/storage-api';
import { Insights } from '../../../core/insights/insights';
import {
  Overdue,
  PickupForecast,
  Shelf,
  Worn,
  overdueList,
  pickupForecast,
  shortLabel,
  seasonMix,
  shelves,
  topSizes,
  treadBuckets,
  wornSets,
} from '../../../core/insights/hotel';
import { StorageDeposit, StorageSummary } from '../../../core/models';
import { bars, columns, kronor } from '../../../shared/chart/chart-kit';
import { ACCENT, HEAT, INK, OTHER, SEASON, STATUS, heat } from '../../../shared/chart/chart-theme';
import type { MixPart } from '../../../shared/mix-bar/mix-bar';
import type { PanelTable } from '../../../shared/panel/panel';
import { HOTEL_TABS } from '../../../shared/section-tabs/tabs';

const MIX_COLORS = {
  winter: SEASON.winter,
  summer: SEASON.summer,
  all_season: SEASON.all_season,
  rims: OTHER,
} as const;

/**
 * Däckhotell i överblick: när setet ska hämtas (var kommer trycket), vad som ligger där, vilka
 * hyllor som är fulla och vilka som skulle ha hämtats redan. Räknas ut av alla inlagrade set.
 */
@Component({
  selector: 'app-storage-overview',
  standalone: false,
  host: { class: 'block' },
  template: `
    <app-section-tabs [tabs]="tabs" [desktopOnly]="true" label="Däckhotell" />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <app-stat
        label="Inlagrade set"
        [value]="summary()?.stored ?? '–'"
        [hint]="summary() ? summary()!.units + ' däck och fälgar' : ''"
        link="/storage"
        [params]="{ status: 'stored' }"
      />
      <app-stat
        label="Hämtas inom två veckor"
        [value]="soon()"
        [hint]="soonHint()"
        link="/storage"
        [params]="{ status: 'stored' }"
      />
      <app-stat
        label="Skulle ha hämtats"
        [value]="summary()?.overdue ?? '–'"
        hint="har passerat hämtdatum"
        [status]="summary()?.overdue ? 'bad' : 'none'"
        link="/storage"
        [params]="{ status: 'stored', overdue: true }"
      />
      <app-stat
        label="Obetalda avgifter"
        [value]="summary()?.unpaid ?? '–'"
        [hint]="summary() ? kr(summary()!.unpaidAmount) + ' exkl. moms' : ''"
        [status]="summary()?.unpaid ? 'warn' : 'none'"
        link="/storage"
        [params]="{ status: 'stored', paymentStatus: 'unpaid' }"
      />
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      <app-panel
        class="xl:col-span-2"
        title="Hämtas per vecka"
        subtitle="Inlagrade set efter hämtdatum. Röd stapel: har redan passerat hämtdatum."
        [loading]="loading()"
        [table]="pickupTable()"
        [empty]="!loading() && !deposits().length"
      >
        <div class="h-64">
          <app-chart [config]="pickupChart()" label="Set som ska hämtas per vecka" />
        </div>
      </app-panel>

      <app-panel
        title="Vad ligger i hotellet"
        subtitle="Inlagrade set"
        [loading]="loading()"
        [empty]="!loading() && !deposits().length"
      >
        <div class="mb-2 text-xs font-medium text-gray-500">Säsong</div>
        <app-mix-bar [parts]="mix()" unit="set" />
        <div class="mt-6 mb-2 text-xs font-medium text-gray-500">Avgift för året</div>
        <app-mix-bar [parts]="payment()" unit="set" />
      </app-panel>

      <app-panel
        class="xl:col-span-2"
        title="Hyllor"
        [subtitle]="shelfNote()"
        [loading]="loading()"
        [table]="shelfTable()"
      >
        @for (g of shelfGroups(); track g.name) {
          @if (g.name) {
            <div class="mb-1.5 text-xs font-medium text-gray-500">{{ g.name }}</div>
          }
          <div class="mb-3 grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-1">
            @for (s of g.shelves; track s.place) {
              <a
                [routerLink]="['/storage']"
                [queryParams]="{ status: 'stored', q: s.query }"
                class="flex h-14 flex-col items-center justify-center rounded-lg leading-tight transition hover:ring-2 hover:ring-gray-900/20"
                [style.background]="bg(s)"
                [style.color]="fg(s)"
                [title]="s.place + ': ' + s.sets + ' set (' + s.units + ' däck och fälgar)'"
              >
                <span class="max-w-full truncate px-1 text-[11px] opacity-85">{{
                  short(s.place)
                }}</span>
                <b class="text-base font-semibold tabular-nums">{{ s.sets }}</b>
              </a>
            }
          </div>
        } @empty {
          <p class="py-6 text-center text-sm text-gray-500">Inga inlagrade set.</p>
        }
        @if (shelfList().length) {
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <span>1 set</span>
            <span class="h-2 w-28 rounded-full" [style.background]="scale"></span>
            <span>{{ maxSets() }} set</span>
          </div>
        }
      </app-panel>

      <app-panel
        title="Vanligaste storlekarna"
        subtitle="Däck i inlagrade set. Det som kommer tillbaka till vår eller höst."
        [loading]="loading()"
        [table]="sizeTable()"
        [empty]="!loading() && !sizes().length"
        emptyText="Inga inlagrade set med däckstorlek."
      >
        <div class="h-64">
          <app-chart [config]="sizeChart()" label="Vanligaste däckstorlekarna i hotellet" />
        </div>
      </app-panel>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      <app-panel
        title="Mönsterdjup"
        subtitle="Däck i inlagrade set, mätt vid inlämning."
        [loading]="loading()"
        [table]="treadTable()"
        [empty]="!loading() && !treadTotal()"
        emptyText="Inga däck har mätts än."
      >
        <div class="h-56">
          <app-chart [config]="treadChart()" label="Mönsterdjup på däcken i hotellet" />
        </div>
      </app-panel>

      <app-panel
        class="xl:col-span-2"
        title="Slitna däck"
        [subtitle]="worn().length ? 'Under 4 mm. Dags att erbjuda nya, de slitnaste först.' : ''"
        [loading]="loading()"
      >
        @if (worn().length) {
          <ul class="divide-y divide-gray-100">
            @for (w of wornTop(); track w.deposit.id) {
              <li class="flex items-center gap-3 py-2">
                <app-reg-plate [value]="w.deposit.vehicle.regNo" size="sm" />
                <a [routerLink]="['/storage', w.deposit.id]" class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{
                    w.deposit.customer.name
                  }}</span>
                  <span class="block truncate text-xs text-gray-500">{{ wornText(w) }}</span>
                </a>
                <span
                  class="inline-flex items-center gap-1 text-xs font-medium"
                  [class]="w.mm < 3 ? 'text-red-700' : 'text-amber-800'"
                >
                  <mat-icon class="!h-4 !w-4 !text-sm !leading-4">{{
                    w.mm < 3 ? 'error' : 'warning'
                  }}</mat-icon>
                  {{ mmText(w.mm) }} mm
                </span>
                @if (w.deposit.customer.phone; as tel) {
                  <a
                    [href]="'tel:' + tel"
                    class="grid h-9 w-9 place-items-center rounded-full text-brand hover:bg-brand-soft"
                    [attr.aria-label]="'Ring ' + w.deposit.customer.name"
                  >
                    <mat-icon>call</mat-icon>
                  </a>
                }
              </li>
            }
          </ul>
          @if (worn().length > wornTop().length) {
            <p class="mt-2 text-xs text-gray-500">
              {{ worn().length - wornTop().length }} set till under 4 mm.
            </p>
          }
        } @else if (!loading()) {
          <p class="py-4 text-sm text-gray-500">Inga inlagrade däck är under 4 mm.</p>
        }
      </app-panel>
    </div>

    <app-panel
      class="mt-4 block"
      title="Skulle ha hämtats"
      [subtitle]="overdue().length ? 'De som väntat längst först. Ring direkt från raden.' : ''"
      [loading]="loading()"
    >
      @if (overdue().length) {
        <ul class="divide-y divide-gray-100">
          @for (o of overdueTop(); track o.deposit.id) {
            <li class="flex items-center gap-3 py-2">
              <app-reg-plate [value]="o.deposit.vehicle.regNo" size="sm" />
              <a [routerLink]="['/storage', o.deposit.id]" class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{
                  o.deposit.customer.name
                }}</span>
                <span class="block truncate text-xs text-gray-500"
                  >{{ o.deposit.code }} · {{ o.deposit.location || 'Ingen plats' }}</span
                >
                <span
                  class="inline-flex items-center gap-1 text-xs font-medium text-red-700 md:hidden"
                >
                  <mat-icon class="!h-4 !w-4 !text-sm !leading-4">schedule</mat-icon>
                  {{ o.days }} {{ o.days === 1 ? 'dag' : 'dagar' }} sedan
                </span>
              </a>
              <span
                class="inline-flex items-center gap-1 text-xs font-medium text-red-700 max-md:hidden"
              >
                <mat-icon class="!h-4 !w-4 !text-sm">schedule</mat-icon>
                {{ o.days }} {{ o.days === 1 ? 'dag' : 'dagar' }} sedan
              </span>
              @if (o.deposit.customer.phone; as tel) {
                <a
                  [href]="'tel:' + tel"
                  class="grid h-9 w-9 place-items-center rounded-full text-brand hover:bg-brand-soft"
                  [attr.aria-label]="'Ring ' + o.deposit.customer.name"
                >
                  <mat-icon>call</mat-icon>
                </a>
              }
            </li>
          }
        </ul>
        @if (overdue().length > overdueTop().length) {
          <a
            routerLink="/storage"
            [queryParams]="{ status: 'stored', overdue: true }"
            class="mt-2 inline-block text-sm font-medium text-brand hover:underline"
            >Visa alla {{ overdue().length }}</a
          >
        }
      } @else if (!loading()) {
        <p class="py-4 text-sm text-gray-500">Inga set har passerat hämtdatum.</p>
      }
    </app-panel>
  `,
})
export class StorageOverview {
  private readonly insights = inject(Insights);
  private readonly storage = inject(StorageApi);
  private readonly now = new Date();

  readonly tabs = HOTEL_TABS;
  readonly kr = kronor;
  readonly scale = `linear-gradient(to right, ${HEAT.join(', ')})`;

  readonly loading = signal(true);
  readonly deposits = signal<StorageDeposit[]>([]);
  readonly summary = signal<StorageSummary | null>(null);

  readonly forecast = computed<PickupForecast>(() => pickupForecast(this.deposits(), this.now, 10));
  readonly mix = computed<MixPart[]>(() =>
    seasonMix(this.deposits()).map((m) => ({
      key: m.key,
      label: m.label,
      value: m.sets,
      color: MIX_COLORS[m.key],
      note: `${m.units} st`,
    })),
  );
  readonly payment = computed<MixPart[]>(() => {
    const stored = this.deposits().filter((d) => d.status === 'stored');
    const unpaid = stored.filter((d) => d.paymentStatus === 'unpaid');
    return [
      { key: 'paid', label: 'Betalda', value: stored.length - unpaid.length, color: ACCENT },
      {
        key: 'unpaid',
        label: 'Obetalda',
        value: unpaid.length,
        color: STATUS.warning,
        note: kronor(unpaid.reduce((t, d) => t + d.fee, 0)),
      },
    ];
  });
  readonly shelfList = computed<Shelf[]>(() => shelves(this.deposits()));
  readonly maxSets = computed(() => Math.max(1, ...this.shelfList().map((s) => s.sets)));
  readonly shelfGroups = computed(() => {
    const by = new Map<string, Shelf[]>();
    for (const s of this.shelfList()) by.set(s.warehouse, [...(by.get(s.warehouse) ?? []), s]);
    return [...by].map(([name, list]) => ({ name, shelves: list }));
  });
  readonly overdue = computed<Overdue[]>(() => overdueList(this.deposits(), this.now));
  readonly overdueTop = computed(() => this.overdue().slice(0, 8));

  /** Hämtas denna och nästa vecka (efter de försenade). */
  readonly soon = computed(() => {
    const b = this.forecast().buckets;
    return this.loading() ? '–' : (b[1]?.sets ?? 0) + (b[2]?.sets ?? 0);
  });
  readonly soonHint = computed(() => {
    const b = this.forecast().buckets;
    return this.loading() ? '' : `${b[1]?.sets ?? 0} denna vecka, ${b[2]?.sets ?? 0} nästa`;
  });

  readonly shelfNote = computed(() => {
    const n = this.shelfList().length;
    return n ? `${n} platser. Klicka på en hylla för att se vad som står där.` : '';
  });

  readonly pickupChart = computed(() => {
    const b = this.forecast().buckets;
    return columns({
      // Smal skärm: bara veckonumren, så att alla ryms.
      labels: b.map((x) => (window.innerWidth < 768 ? shortLabel(x) : x.label)),
      allLabels: true,
      title: (i) => b[i].title,
      series: [
        {
          label: 'Set',
          data: b.map((x) => x.sets),
          color: ACCENT,
          colors: b.map((x) => (x.overdue ? STATUS.critical : x.key === 'later' ? OTHER : ACCENT)),
        },
      ],
      format: (v) => `${v} set`,
      footer: (i) => [`${b[i].units} däck och fälgar`],
    });
  });
  readonly pickupTable = computed<PanelTable>(() => ({
    head: ['Vecka', 'Set', 'Däck och fälgar'],
    rows: this.forecast().buckets.map((b) => [b.title, b.sets, b.units]),
  }));

  // --- mönsterdjup ---
  readonly tread = computed(() => treadBuckets(this.deposits()));
  readonly treadTotal = computed(() => this.tread().reduce((t, b) => t + b.sets, 0));
  readonly treadChart = computed(() => {
    const t = this.tread();
    const colors = {
      under3: STATUS.critical,
      from3: STATUS.warning,
      from4: ACCENT,
      over6: ACCENT,
      unknown: OTHER,
    };
    return bars({
      labels: t.map((x) => x.label),
      series: [
        {
          label: 'Set',
          data: t.map((x) => x.sets),
          color: ACCENT,
          colors: t.map((x) => colors[x.key]),
        },
      ],
      format: (v) => `${v} set`,
    });
  });
  readonly treadTable = computed<PanelTable>(() => ({
    head: ['Mönsterdjup', 'Set'],
    rows: this.tread().map((b) => [b.label, b.sets]),
  }));
  readonly worn = computed<Worn[]>(() => wornSets(this.deposits()));
  readonly wornTop = computed(() => this.worn().slice(0, 6));

  readonly sizes = computed(() => topSizes(this.deposits(), 8));
  readonly sizeChart = computed(() =>
    bars({
      labels: this.sizes().map((s) => s.label),
      series: [{ label: 'Set', data: this.sizes().map((s) => s.sets), color: ACCENT }],
      format: (v) => `${v} set`,
    }),
  );
  readonly sizeTable = computed<PanelTable>(() => ({
    head: ['Storlek', 'Set'],
    rows: this.sizes().map((s) => [s.label, s.sets]),
  }));

  readonly shelfTable = computed<PanelTable>(() => ({
    head: ['Plats', 'Set', 'Däck och fälgar'],
    rows: this.shelfList().map((s) => [
      (s.warehouse ? s.warehouse + ' · ' : '') + s.place,
      s.sets,
      s.units,
    ]),
  }));

  constructor() {
    forkJoin({
      deposits: this.insights
        .storedDeposits(true)
        .pipe(catchError(() => of([] as StorageDeposit[]))),
      summary: this.storage.summary().pipe(catchError(() => of(null))),
    }).subscribe(({ deposits, summary }) => {
      this.deposits.set(deposits);
      this.summary.set(summary);
      this.loading.set(false);
    });
  }

  /** Cellens färg ur värmeskalan; ljus text på de mörkaste stegen. */
  bg(s: Shelf): string {
    return heat(s.sets / this.maxSets());
  }
  fg(s: Shelf): string {
    return Math.round((s.sets / this.maxSets()) * (HEAT.length - 1)) >= 5 ? '#ffffff' : INK.primary;
  }
  mmText(mm: number): string {
    return String(mm).replace('.', ',');
  }
  /** Vad som ligger där och var, så att man kan ringa med ett erbjudande i handen. */
  wornText(w: Worn): string {
    const t = w.deposit.tyres;
    const what = [t?.sizeLabel, t?.brand].filter(Boolean).join(' · ');
    return `${w.deposit.code}${what ? ' · ' + what : ''}`;
  }
  /** "Hylla H-12" blir "H-12" så att cellen ryms. */
  short(place: string): string {
    return place.replace(/^hylla\s+/i, '');
  }
}
