import { Component, computed, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { byRim, bySize, Reorder, seasonUnits, toOrder } from '../../core/insights/stock';
import { Article, Booking, MOVEMENT_LABELS, MovementType, itemKind } from '../../core/models';
import { openBooking } from '../../shared/booking-dialog/open-booking';
import { columns } from '../../shared/chart/chart-kit';
import { SEASON, STATUS, tint } from '../../shared/chart/chart-theme';
import type { MixPart } from '../../shared/mix-bar/mix-bar';
import type { PanelTable } from '../../shared/panel/panel';
import { HomeData } from './home-data';

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
const fmt = (n: number) => n.toLocaleString('sv-SE');

/** Så många rader "Att beställa" visar; resten är en länk till listan. */
const REORDER_ROWS = 6;

/**
 * Hem på dator: dagen (vem gör vad, vad som väntar), arbetsorder att flytta mellan kolumner och
 * lagret (vad som ska beställas, vilka däck som finns, vad som hänt). Inga pengar här: försäljning
 * och obetalt finns under Ekonomi, och Hem svarar på "vad gör jag härnäst".
 */
@Component({
  selector: 'app-home-desktop',
  standalone: false,
  host: { class: 'block' },
  template: `
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <app-stat
        label="Bokningar idag"
        [value]="data.bookingsLoaded() ? data.today().length : '–'"
        [hint]="data.bookingsLoaded() ? data.left() + ' kvar' : ''"
        link="/bookings"
      />
      @if (data.workOrdersOn) {
        <app-stat
          label="Order i verkstaden"
          [value]="data.ordersLoaded() ? inShop() : '–'"
          [hint]="orderHint()"
          [status]="waitingParts() ? 'warn' : 'none'"
          link="/workorders"
        />
      }
      <app-stat
        label="Behöver beställas"
        [value]="reorderCount() ?? '–'"
        [hint]="stockHint()"
        [status]="data.summary()?.reorderSoldOut ? 'bad' : reorderCount() ? 'warn' : 'none'"
        link="/inventory"
        [params]="{ lowStock: true }"
      />
      <app-stat
        label="Däck i lager"
        [value]="data.stockLoaded() ? fmt(tyreUnits()) : '–'"
        [hint]="data.stockLoaded() ? sizes().length + ' storlekar' : ''"
        link="/inventory"
        [params]="{ category: 'tyre' }"
      />
    </div>

    <app-section class="mt-4" title="Dagen">
      <div class="grid gap-3 xl:grid-cols-3">
        <app-panel class="xl:col-span-2" title="Idag" [subtitle]="todayNote()" icon="today">
          <button actions mat-button type="button" (click)="newBooking()">
            <mat-icon>add</mat-icon> Ny bokning
          </button>
          <app-day-timeline
            [bookings]="data.today()"
            [resources]="data.resources()"
            [now]="data.now()"
            (openBooking)="open($event)"
          />
          @if (upcoming().length) {
            <div class="mt-4 text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Kvar idag
            </div>
            <ul class="divide-y divide-gray-100">
              @for (b of upcoming(); track b.id) {
                <li class="flex items-center gap-3 py-2">
                  <span class="w-12 shrink-0 text-sm font-semibold tabular-nums">{{
                    hhmm(b.start)
                  }}</span>
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-3 text-left"
                    (click)="open(b)"
                  >
                    @if (b.regNo) {
                      <app-reg-plate [value]="b.regNo" size="sm" />
                    }
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium">{{ b.title }}</span>
                      <span class="block truncate text-xs text-gray-500"
                        >{{ b.customerName
                        }}{{ b.resourceName ? ' · ' + b.resourceName : '' }}</span
                      >
                    </span>
                  </button>
                  @if (b.status === 'arrived') {
                    <app-pill tone="amber">Här</app-pill>
                    <button
                      mat-stroked-button
                      class="!h-9"
                      type="button"
                      (click)="data.setStatus(b, 'done')"
                    >
                      Klar
                    </button>
                  } @else {
                    <button
                      mat-stroked-button
                      class="!h-9"
                      type="button"
                      (click)="data.setStatus(b, 'arrived')"
                    >
                      Anlänt
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </app-panel>

        <app-panel title="Att göra" icon="task_alt">
          <app-attention-list [items]="data.attention()" [ready]="data.attentionReady()" />
        </app-panel>
      </div>
    </app-section>

    @if (data.workOrdersOn) {
      <app-section class="mt-4" title="Verkstaden">
        <app-panel
          class="block"
          title="Arbetsorder"
          [subtitle]="activeOrders() + ' pågående. Dra ett kort för att byta status.'"
          icon="handyman"
        >
          <a actions mat-button routerLink="/workorders/new"
            ><mat-icon>add</mat-icon> Ny arbetsorder</a
          >
          <app-order-board />
        </app-panel>
      </app-section>
    }

    <app-section class="mt-4" title="Lager">
      <div class="grid gap-3 xl:grid-cols-3">
        <app-panel
          class="xl:col-span-2"
          title="Att beställa"
          [subtitle]="
            reorders().length ? 'Slut eller under beställningspunkten, mest akut först.' : ''
          "
          icon="inventory_2"
          [loading]="!data.stockLoaded()"
        >
          <a actions mat-button routerLink="/purchases/new"><mat-icon>add</mat-icon> Nytt inköp</a>
          @if (reorders().length) {
            <ul class="-my-1 divide-y divide-gray-100">
              @for (o of reorderTop(); track o.article.id) {
                <li class="flex min-h-14 items-center gap-3 py-2">
                  <app-item-icon [kind]="kind(o.article)" />
                  <a
                    [routerLink]="['/inventory', o.article.id]"
                    class="min-w-0 flex-1 rounded-lg hover:bg-gray-50"
                  >
                    <span class="block truncate text-sm font-medium">{{ title(o.article) }}</span>
                    <span class="block truncate text-xs text-gray-500">{{ where(o.article) }}</span>
                  </a>
                  <span
                    class="h-2 w-40 shrink-0 overflow-hidden rounded-full max-lg:hidden"
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
                    <mat-icon class="!h-4 !w-4 !text-sm !leading-4">{{
                      o.article.quantity <= 0 ? 'error' : 'warning'
                    }}</mat-icon>
                    {{ o.article.quantity <= 0 ? 'Slut' : o.article.quantity + ' kvar' }}
                    @if (o.onOrder) {
                      <span class="font-normal text-gray-600">· {{ o.onOrder }} på väg</span>
                    }
                  </span>
                  <a
                    mat-stroked-button
                    class="!h-9 shrink-0"
                    routerLink="/purchases/new"
                    [queryParams]="{ articleId: o.article.id, qty: Math.max(o.missing, 1) }"
                  >
                    Beställ
                  </a>
                </li>
              }
            </ul>
            @if (reorders().length > reorderTop().length) {
              <a
                routerLink="/inventory"
                [queryParams]="{ lowStock: true }"
                class="mt-2 flex h-9 items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                Visa alla {{ reorders().length }}
                <mat-icon class="!h-4 !w-4 !text-base">arrow_forward</mat-icon>
              </a>
            }
          } @else if (data.stockLoaded()) {
            <p class="flex items-center gap-2 py-3 text-sm text-gray-600">
              <mat-icon class="text-[#006300]">check_circle</mat-icon>
              Inget behöver beställas just nu.
            </p>
          }
        </app-panel>

        <app-panel
          title="Däck i lager"
          [subtitle]="data.stockLoaded() ? fmt(tyreUnits()) + ' däck fördelade på säsong' : ''"
          icon="tire_repair"
          [loading]="!data.stockLoaded()"
          [empty]="data.stockLoaded() && !tyreUnits()"
          emptyText="Inga däck i lager än."
        >
          <a actions mat-button routerLink="/inventory/overview">Lageröversikt</a>
          <app-mix-bar [parts]="mix()" unit="däck" />
        </app-panel>
      </div>

      <div class="mt-3 grid gap-3 xl:grid-cols-3">
        <app-panel
          class="xl:col-span-2"
          title="Däck per fälgstorlek"
          subtitle="Antal däck i lager. Klicka på en stapel för att se dem."
          [table]="rimTable()"
          [loading]="!data.stockLoaded()"
          [empty]="data.stockLoaded() && !rims().length"
          emptyText="Inga däck i lager än."
        >
          <div class="h-56">
            <app-chart
              [config]="rimChart()"
              label="Däck per fälgstorlek"
              (pick)="openRim($event.index)"
            />
          </div>
        </app-panel>

        <app-panel title="Senaste i lagret" icon="swap_vert">
          <a actions mat-button routerLink="/reports">Lagerlogg</a>
          @if (data.movements().length) {
            <ul class="-my-1 divide-y divide-gray-100">
              @for (m of data.movements(); track m.id) {
                <li class="flex min-h-12 items-center gap-3 py-2">
                  <span
                    class="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                    [class]="movementTone[m.type]"
                  >
                    <mat-icon class="!h-5 !w-5 !text-xl">{{ movementIcon[m.type] }}</mat-icon>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium">{{
                      m.articleLabel || m.label || '–'
                    }}</span>
                    <span class="block truncate text-xs text-gray-500"
                      >{{ movementLabel[m.type] }} · {{ m.quantity }} st ·
                      {{ when(m.createdAt) }}</span
                    >
                  </span>
                </li>
              }
            </ul>
          } @else {
            <p class="py-3 text-sm text-gray-500">Inget har hänt i lagret än.</p>
          }
        </app-panel>
      </div>
    </app-section>
  `,
})
export class HomeDesktop {
  readonly data = inject(HomeData);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  readonly hhmm = hhmm;
  readonly fmt = fmt;
  readonly Math = Math;

  readonly movementLabel = MOVEMENT_LABELS;
  readonly movementIcon: Record<MovementType, string> = {
    purchase: 'move_to_inbox',
    sale: 'sell',
    customer_return: 'undo',
    write_off: 'delete_sweep',
    adjustment: 'fact_check',
  };
  readonly movementTone: Record<MovementType, string> = {
    purchase: 'bg-green-50 text-green-800',
    sale: 'bg-sky-50 text-sky-800',
    customer_return: 'bg-amber-50 text-amber-800',
    write_off: 'bg-red-50 text-red-700',
    adjustment: 'bg-gray-100 text-gray-700',
  };

  constructor() {
    this.data.loadDesktop();
  }

  newBooking() {
    openBooking(this.dialog, null).subscribe((r) => r && this.data.loadBookings());
  }

  open(b: Booking) {
    openBooking(this.dialog, b).subscribe((r) => r && this.data.loadBookings());
  }

  // --- nyckeltal ---

  /** Order som verkstaden har på gång: öppna, pågående och de som väntar på en del. */
  readonly inShop = computed(
    () =>
      this.data
        .orders()
        .filter(
          (o) => o.status === 'open' || o.status === 'in_progress' || o.status === 'waiting_parts',
        ).length,
  );
  readonly waitingParts = computed(
    () => this.data.orders().filter((o) => o.status === 'waiting_parts').length,
  );
  readonly orderHint = computed(() =>
    !this.data.ordersLoaded()
      ? ''
      : this.waitingParts()
        ? `${this.waitingParts()} väntar på del`
        : 'ingen väntar på del',
  );
  readonly activeOrders = computed(
    () =>
      this.data.orders().filter((o) => o.status === 'open' || o.status === 'in_progress').length,
  );

  /** Slut (med påminnelsenivå) plus kvar men under nivån: samma räkning som menyn. */
  readonly reorderCount = computed(() => {
    const s = this.data.summary();
    return s && s.reorderSoldOut != null && s.reorderLow != null
      ? s.reorderSoldOut + s.reorderLow
      : null;
  });
  readonly stockHint = computed(() => {
    const s = this.data.summary();
    if (!s || this.reorderCount() === null) return '';
    if (s.reorderSoldOut) return `${s.reorderSoldOut} är slut`;
    return this.reorderCount() ? 'under beställningspunkten' : 'inget under punkten';
  });
  readonly sizes = computed(() => bySize(this.data.articles()));
  readonly tyreUnits = computed(() => this.sizes().reduce((t, s) => t + s.units, 0));

  // --- idag ---

  readonly todayNote = computed(() => {
    const d = new Date(this.data.now())
      .toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
      .replace('.', '');
    return this.data.bookingsLoaded()
      ? `${d.charAt(0).toUpperCase()}${d.slice(1)} · ${this.data.today().length} bokningar, ${this.data.left()} kvar`
      : '';
  });
  /** De närmaste som inte är avslutade, högst fem. */
  readonly upcoming = computed(() =>
    this.data
      .today()
      .filter((b) => (b.status === 'booked' || b.status === 'arrived') && !this.data.past(b))
      .slice(0, 5),
  );

  // --- att beställa ---

  readonly reorders = computed<Reorder[]>(() => toOrder(this.data.articles(), this.data.onOrder()));
  readonly reorderTop = computed(() => this.reorders().slice(0, REORDER_ROWS));

  kind(a: Article) {
    return itemKind(a.category);
  }
  title(a: Article): string {
    return a.sizeLabel ? [a.sizeLabel, a.brand, a.model].filter(Boolean).join(' ') : a.label;
  }
  /** Leverantör och plats: det man behöver för att beställa och för att hitta delen. */
  where(a: Article): string {
    return [a.supplier, a.location].filter(Boolean).join(' · ') || a.code || '';
  }
  /** Mätaren: fyllningen visar allvaret (slut = kritiskt, lågt = varning). */
  fill(o: Reorder): string {
    return o.article.quantity <= 0 ? STATUS.critical : STATUS.warning;
  }
  track(o: Reorder): string {
    return tint(this.fill(o), 0.8);
  }

  // --- däck ---

  readonly mix = computed<MixPart[]>(() => {
    const s = seasonUnits(this.data.articles());
    return [
      { key: 'winter', label: 'Vinter', value: s.winter, color: SEASON.winter },
      { key: 'summer', label: 'Sommar', value: s.summer, color: SEASON.summer },
      { key: 'all_season', label: 'Helår', value: s.all_season, color: SEASON.all_season },
    ];
  });

  readonly rims = computed(() => byRim(this.data.articles()));
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

  openRim(i: number) {
    const r = this.rims()[i];
    if (r)
      void this.router.navigate(['/inventory'], {
        queryParams: { category: 'tyre', rimDiameter: r.rim },
      });
  }

  // --- senaste i lagret ---

  /** "idag 14:32", "i går 09:10" eller datum. */
  when(iso: string): string {
    const d = new Date(iso);
    const now = new Date(this.data.now());
    const days = Math.round(
      (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
        864e5,
    );
    if (days === 0) return `idag ${hhmm(iso)}`;
    if (days === 1) return `i går ${hhmm(iso)}`;
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '');
  }
}
