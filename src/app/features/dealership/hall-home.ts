import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GlobalSearch } from '../../core/search/global-search';
import { CarListing } from '../../core/models';
import { AGE_BANDS, AgeBand, IDLE_DAYS, WATCH_DAYS, daysInStock } from '../../shared/car-stock';
import { KrPipe } from '../../shared/kr-pipe';
import type { MixPart } from '../../shared/mix-bar/mix-bar';
import { HallData } from './hall-data';

const MOBILE = '(max-width: 767.98px)';
const kr = new KrPipe();

/** Färgen på åldersstapeln. Dagarna står alltid som text bredvid, så färgen bär aldrig något ensam. */
const BAND_BAR: Record<AgeBand, string> = {
  fresh: 'bg-gray-300',
  normal: 'bg-gray-400',
  old: 'bg-amber-400',
  stale: 'bg-red-500',
};
const BAND_COLOR: Record<AgeBand, string> = {
  fresh: '#cbd5e1',
  normal: '#94a3b8',
  old: '#fab219',
  stale: '#d03b3b',
};

/** Bilens omslagsbild, eller tom sträng. */
const cover = (c: CarListing) => (c.imageUrls[0] ? environment.apiUrl + c.imageUrls[0] : '');

/** "14:32" idag, "igår", annars "3 nov". */
function when(iso: string, now = new Date()): string {
  const d = parseISO(iso);
  const diff = differenceInCalendarDays(now, d);
  if (diff <= 0) return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'igår';
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '');
}

/** Delad uppsättning för båda vyerna. */
class HallView {
  readonly data = inject(HallData);
  readonly kr = (ore: number | null | undefined) => (ore == null ? '–' : kr.transform(ore));
  readonly cover = cover;
  readonly when = (iso: string) => when(iso);
  readonly bar = BAND_BAR;
  readonly WATCH_DAYS = WATCH_DAYS;
  readonly IDLE_DAYS = IDLE_DAYS;
  readonly daysOf = (c: CarListing) => daysInStock(c);

  /** Från inköp till såld: var bilarna står just nu. */
  readonly stages = computed(() => {
    const s = this.data.stock();
    return [
      { key: 'bought', label: 'Inköpta', count: s.bought, link: '/dealership/cars/purchases' },
      {
        key: 'sale',
        label: 'Till salu',
        count: s.forSale,
        link: '/dealership/cars',
      },
      {
        key: 'reserved',
        label: 'Reserverade',
        count: s.reserved,
        link: '/dealership/cars',
      },
      {
        key: 'sold',
        label: 'Sålda i månaden',
        count: this.data.month().count,
        link: '/dealership/cars/sold',
      },
    ];
  });

  readonly stockHint = computed(() => {
    const s = this.data.stock();
    return s.count ? `${s.forSale} till salu · ${s.reserved} reserverade` : 'Inga bilar än';
  });

  readonly avgDays = computed(() => {
    const d = this.data.stock().avgDays;
    return d == null ? '–' : `${d} dagar`;
  });
  readonly avgStatus = computed<'none' | 'warn'>(() =>
    (this.data.stock().avgDays ?? 0) >= WATCH_DAYS ? 'warn' : 'none',
  );
  readonly avgHint = computed(() => {
    const stale = this.data.stock().bands.stale;
    return stale ? `${stale} över ${IDLE_DAYS} dagar` : 'i lager';
  });

  readonly inquiryHint = computed(() => {
    const latest = this.data.inquiries()[0];
    return latest ? `senaste ${when(latest.inquiry.at)}` : 'inga nya';
  });

  readonly monthHint = computed(() => {
    const m = this.data.month();
    return m.count ? `${m.count} bilar · vinst ${kr.transform(m.profit)}` : 'inga sålda än';
  });

  readonly bands = computed<MixPart[]>(() => {
    const b = this.data.stock().bands;
    return AGE_BANDS.map((x) => ({
      key: x.key,
      label: x.label,
      value: b[x.key],
      color: BAND_COLOR[x.key],
    }));
  });

  /** Stapelns längd i procent av 120 dagar (längre bilar fyller hela stapeln). */
  readonly width = (days: number) => Math.max(4, Math.min(100, Math.round((days / 120) * 100)));
  readonly bandOf = (days: number): AgeBand =>
    days >= IDLE_DAYS ? 'stale' : days >= WATCH_DAYS ? 'old' : days >= 30 ? 'normal' : 'fresh';

  readonly tones: Record<'bad' | 'warn' | 'info', string> = {
    bad: 'bg-red-50 text-red-700',
    warn: 'bg-amber-50 text-amber-800',
    info: 'bg-sky-50 text-sky-800',
  };
}

/** Halls startsida. Dator och mobil är två olika sidor, som i Axle, och delar samma data. */
@Component({
  selector: 'app-hall-home',
  standalone: false,
  providers: [HallData],
  host: { class: 'block' },
  template: `
    @if (mobile()) {
      <app-hall-home-mobile />
    } @else {
      <app-hall-home-desktop />
    }
  `,
})
export class HallHome {
  readonly mobile = toSignal(
    inject(BreakpointObserver)
      .observe(MOBILE)
      .pipe(map((r) => r.matches)),
    { initialValue: window.matchMedia(MOBILE).matches },
  );
}

/**
 * Hall på dator: vad som står i lager och hur länge, vilka bilar som kräver något (pris, besiktning,
 * utläggning), vad intresserade frågat och hur månaden gick. Allt är en klick från bilen det gäller.
 */
@Component({
  selector: 'app-hall-home-desktop',
  standalone: false,
  host: { class: 'block' },
  template: `
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <app-stat
        label="Bilar i lager"
        [value]="data.loaded() ? data.stock().count : '–'"
        [hint]="stockHint()"
        link="/dealership/cars"
      />
      <app-stat
        label="Bundet kapital"
        [value]="data.loaded() ? kr(data.stock().capital) : '–'"
        hint="inköp och kostnader"
      />
      <app-stat
        label="Snitt i lager"
        [value]="data.loaded() ? avgDays() : '–'"
        [hint]="avgHint()"
        [status]="avgStatus()"
      />
      <app-stat
        label="Frågor, 7 dagar"
        [value]="data.loaded() ? data.inquiries().length : '–'"
        [hint]="inquiryHint()"
      />
      <app-stat
        label="Sålt i månaden"
        [value]="data.loaded() ? kr(data.month().revenue) : '–'"
        [hint]="monthHint()"
        link="/dealership/cars/sold"
      />
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      <app-panel
        class="xl:col-span-2"
        title="Bilarna just nu"
        subtitle="Från inköp till såld."
        icon="directions_car"
      >
        <a actions mat-button routerLink="/dealership/cars/new"><mat-icon>add</mat-icon> Ny bil</a>
        <ol class="grid grid-cols-2 gap-3 md:grid-cols-4">
          @for (s of stages(); track s.key; let last = $last) {
            <li class="relative">
              <a
                [routerLink]="s.link"
                class="block rounded-xl bg-gray-50 p-4 ring-1 ring-black/5 transition hover:bg-gray-100"
              >
                <span class="block text-3xl leading-none font-semibold tabular-nums">{{
                  data.loaded() ? s.count : '–'
                }}</span>
                <span class="mt-2 block text-sm text-gray-600">{{ s.label }}</span>
              </a>
              @if (!last) {
                <mat-icon
                  class="absolute top-1/2 -right-3.5 z-10 hidden -translate-y-1/2 rounded-full bg-white text-gray-400 md:block"
                  aria-hidden="true"
                  >chevron_right</mat-icon
                >
              }
            </li>
          }
        </ol>
      </app-panel>

      <app-panel title="Att göra" icon="task_alt">
        @if (attention().length) {
          <ul
            class="-my-1 max-h-[216px] divide-y divide-gray-100 overflow-y-auto overscroll-contain"
          >
            @for (a of attention(); track a.key) {
              <li>
                <a
                  [routerLink]="a.link"
                  [queryParams]="a.params"
                  class="flex min-h-12 items-center gap-3 rounded-lg py-2 hover:bg-gray-50"
                >
                  <span
                    class="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                    [class]="tones[a.tone]"
                  >
                    <mat-icon class="!h-5 !w-5 !text-xl">{{ a.icon }}</mat-icon>
                  </span>
                  <span class="min-w-0 flex-1 text-sm leading-snug">{{ a.text }}</span>
                  <mat-icon class="shrink-0 text-gray-300">chevron_right</mat-icon>
                </a>
              </li>
            }
          </ul>
        } @else if (data.ready()) {
          <p class="flex items-center gap-2 py-3 text-sm text-gray-600">
            <mat-icon class="text-[#006300]">check_circle</mat-icon>
            Inget väntar just nu.
          </p>
        }
      </app-panel>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      <app-panel
        class="xl:col-span-2"
        title="Står längst"
        subtitle="Bilarna som legat längst i lager. Dags att se över priset?"
        icon="hourglass_top"
        [empty]="data.loaded() && !data.longest().length"
        emptyText="Inga bilar i lager."
      >
        <ul class="divide-y divide-gray-100">
          @for (x of data.longest(); track x.car.id) {
            <li>
              <a
                [routerLink]="['/dealership/cars', x.car.id]"
                class="flex items-center gap-3 py-2.5 hover:bg-gray-50"
              >
                @if (cover(x.car); as src) {
                  <img
                    [src]="src"
                    alt=""
                    class="h-12 w-[4.5rem] shrink-0 rounded-md bg-gray-100 object-cover"
                  />
                } @else {
                  <span
                    class="grid h-12 w-[4.5rem] shrink-0 place-items-center rounded-md bg-gray-100 text-gray-400"
                  >
                    <mat-icon>directions_car</mat-icon>
                  </span>
                }
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <app-reg-plate [value]="x.car.regNo" size="sm" />
                    <span class="truncate text-sm font-medium">{{ x.car.heading }}</span>
                  </span>
                  <span class="mt-1.5 flex items-center gap-2">
                    <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <span
                        class="block h-full rounded-full"
                        [class]="bar[bandOf(x.days)]"
                        [style.width.%]="width(x.days)"
                      ></span>
                    </span>
                    <span
                      class="w-20 text-right text-xs font-medium tabular-nums"
                      [class]="x.days >= IDLE_DAYS ? 'text-red-700' : 'text-gray-600'"
                      >{{ x.days }} dagar</span
                    >
                  </span>
                </span>
                <span class="w-28 shrink-0 text-right text-sm tabular-nums">
                  {{ x.car.price == null ? 'På förfrågan' : kr(x.car.price) }}
                  @if (x.car.economy.marginPercent != null) {
                    <span class="block text-xs text-gray-500"
                      >{{ x.car.economy.marginPercent }} % marginal</span
                    >
                  }
                </span>
              </a>
            </li>
          }
        </ul>
      </app-panel>

      <app-panel title="Lagrets ålder" subtitle="Dagar sedan inköp." icon="schedule">
        <app-mix-bar [parts]="bands()" unit="bilar" />
      </app-panel>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      <app-panel
        class="xl:col-span-2"
        title="Frågor från intresserade"
        subtitle="Senaste veckan, från webbplatsen."
        icon="forum"
        [empty]="data.loaded() && !data.inquiries().length"
        emptyText="Inga frågor senaste veckan."
      >
        <ul class="divide-y divide-gray-100">
          @for (q of data.inquiries().slice(0, 6); track q.inquiry.at + q.car.id) {
            <li class="flex items-start gap-3 py-2.5">
              <span class="w-12 shrink-0 pt-0.5 text-xs text-gray-500 tabular-nums">{{
                when(q.inquiry.at)
              }}</span>
              <a [routerLink]="['/dealership/cars', q.car.id]" class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium"
                  >{{ q.inquiry.name }} · {{ q.car.heading }}</span
                >
                <span class="block truncate text-xs text-gray-500">
                  {{ q.car.regNo }}{{ q.inquiry.message ? ' · ' + q.inquiry.message : '' }}
                </span>
              </a>
              <a
                mat-stroked-button
                class="!h-9"
                [href]="'tel:' + q.inquiry.phone"
                [attr.aria-label]="'Ring ' + q.inquiry.name"
              >
                <mat-icon>call</mat-icon> Ring
              </a>
            </li>
          }
        </ul>
      </app-panel>

      <app-panel
        title="Senast sålda"
        icon="sell"
        [empty]="data.loaded() && !data.recentSold().length"
        emptyText="Inga sålda bilar än."
      >
        <a actions mat-button routerLink="/dealership/finance">Ekonomi</a>
        <ul class="divide-y divide-gray-100">
          @for (c of data.recentSold(); track c.id) {
            <li>
              <a
                [routerLink]="['/dealership/cars', c.id]"
                class="flex items-center gap-3 py-2.5 hover:bg-gray-50"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ c.heading }}</span>
                  <span class="block text-xs text-gray-500">{{ c.regNo }} · {{ c.soldAt }}</span>
                </span>
                <span class="text-right text-sm tabular-nums">
                  {{ kr(c.soldPrice) }}
                  <span class="block text-xs text-gray-500">vinst {{ kr(c.economy.profit) }}</span>
                </span>
              </a>
            </li>
          }
        </ul>
      </app-panel>
    </div>
  `,
})
export class HallHomeDesktop extends HallView {
  readonly attention = computed(() => this.data.attention(true));
}

/**
 * Hall på mobil: handlaren går bland bilarna på tomten. Sök på regnr, se vem som frågat och ring med
 * ett tryck, se vilka bilar som står längst. Inga tabeller och ingen ekonomi.
 */
@Component({
  selector: 'app-hall-home-mobile',
  standalone: false,
  host: { class: 'flex flex-col gap-5 pb-4' },
  styles: `
    .action {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 0 14px;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 0 0 1px rgb(0 0 0 / 0.06);
      font-size: 15px;
      font-weight: 600;
    }
    .action:active {
      background: #f3f4f6;
    }
    .action mat-icon {
      color: var(--mat-sys-primary);
    }
  `,
  template: `
    <button
      type="button"
      class="flex h-12 w-full items-center gap-3 rounded-xl bg-white px-4 text-left text-gray-500 shadow-sm ring-1 ring-gray-200 active:bg-gray-50"
      (click)="search.open()"
    >
      <mat-icon class="text-gray-400">search</mat-icon>
      <span class="truncate text-[15px]">Sök regnr, bil eller kund…</span>
    </button>

    <div class="grid grid-cols-2 gap-2.5">
      <a routerLink="/dealership/cars/new" class="action">
        <mat-icon>add_circle</mat-icon><span>Ny bil</span>
      </a>
      <a routerLink="/dealership/cars" class="action">
        <mat-icon>directions_car</mat-icon><span>Alla bilar</span>
      </a>
    </div>

    <div class="grid grid-cols-2 gap-2.5">
      <app-stat
        label="Bilar i lager"
        [value]="data.loaded() ? data.stock().count : '–'"
        [hint]="stockHint()"
        link="/dealership/cars"
      />
      <app-stat
        label="Snitt i lager"
        [value]="data.loaded() ? avgDays() : '–'"
        [hint]="avgHint()"
        [status]="avgStatus()"
      />
    </div>

    <section>
      <h2 class="mb-2 px-1 text-sm font-semibold">Frågor från intresserade</h2>
      <div class="flex flex-col gap-2">
        @for (q of data.inquiries().slice(0, 4); track q.inquiry.at + q.car.id) {
          <div
            class="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5"
          >
            <a [routerLink]="['/dealership/cars', q.car.id]" class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold">{{ q.inquiry.name }}</span>
              <span class="block truncate text-xs text-gray-500"
                >{{ q.car.heading }} · {{ when(q.inquiry.at) }}</span
              >
              @if (q.inquiry.message) {
                <span class="mt-0.5 block truncate text-xs text-gray-600">{{
                  q.inquiry.message
                }}</span>
              }
            </a>
            <a
              [href]="'tel:' + q.inquiry.phone"
              class="grid h-11 w-12 shrink-0 place-items-center rounded-lg bg-brand text-white active:opacity-90"
              [attr.aria-label]="'Ring ' + q.inquiry.name"
            >
              <mat-icon>call</mat-icon>
            </a>
          </div>
        } @empty {
          @if (data.loaded()) {
            <p class="px-1 text-sm text-gray-600">Inga frågor senaste veckan.</p>
          }
        }
      </div>
    </section>

    @if (attention().length) {
      <section>
        <h2 class="mb-2 px-1 text-sm font-semibold">Att göra</h2>
        <ul class="divide-y divide-gray-100 rounded-xl bg-white px-3 shadow-sm ring-1 ring-black/5">
          @for (a of attention(); track a.key) {
            <li>
              <a
                [routerLink]="a.link"
                [queryParams]="a.params"
                class="flex min-h-12 items-center gap-3 py-2 active:bg-gray-50"
              >
                <span
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  [class]="tones[a.tone]"
                >
                  <mat-icon class="!h-5 !w-5 !text-xl">{{ a.icon }}</mat-icon>
                </span>
                <span class="min-w-0 flex-1 text-sm leading-snug">{{ a.text }}</span>
                <mat-icon class="shrink-0 text-gray-300">chevron_right</mat-icon>
              </a>
            </li>
          }
        </ul>
      </section>
    }

    @if (data.longest().length) {
      <section>
        <h2 class="mb-2 px-1 text-sm font-semibold">Står längst</h2>
        <div class="flex flex-col gap-2">
          @for (x of data.longest().slice(0, 4); track x.car.id) {
            <a
              [routerLink]="['/dealership/cars', x.car.id]"
              class="flex items-center gap-3 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-black/5 active:bg-gray-50"
            >
              @if (cover(x.car); as src) {
                <img
                  [src]="src"
                  alt=""
                  class="h-14 w-20 shrink-0 rounded-lg bg-gray-100 object-cover"
                />
              } @else {
                <span
                  class="grid h-14 w-20 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-400"
                >
                  <mat-icon>directions_car</mat-icon>
                </span>
              }
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold">{{ x.car.heading }}</span>
                <span class="block text-xs text-gray-500">{{ x.car.regNo }}</span>
                <span
                  class="mt-0.5 block text-xs font-medium"
                  [class]="x.days >= IDLE_DAYS ? 'text-red-700' : 'text-gray-600'"
                  >{{ x.days }} dagar i lager</span
                >
              </span>
              <span class="shrink-0 text-right text-sm font-semibold tabular-nums">{{
                x.car.price == null ? 'På förfrågan' : kr(x.car.price)
              }}</span>
            </a>
          }
        </div>
      </section>
    }
  `,
})
export class HallHomeMobile extends HallView {
  readonly search = inject(GlobalSearch);
  readonly attention = computed(() => this.data.attention(false));
}
