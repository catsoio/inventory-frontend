import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Scanner } from '../../core/scan/scanner';
import { ScanTile } from '../../core/scan/scan-tile';
import { GlobalSearch } from '../../core/search/global-search';
import { Overdue, Shelf, overdueList, pickupForecast, shelves } from '../../core/insights/hotel';
import type { StorageDeposit, StorageSummary } from '../../core/models';
import { SharedModule } from '../../shared/shared-module';

/** Så många hyllor visas innan "Visa alla". */
const SHELVES_SHOWN = 6;
/** Så många försenade set visas; resten ligger bakom länken. */
const OVERDUE_SHOWN = 5;

/**
 * Däckhotellets Hem på mobilen: det man gör vid hyllorna, inte uppföljning. Tre stora knappar
 * (Lämna in, Lämna ut, Hitta; de två första börjar med kameran), tre siffror, de som skulle ha
 * hämtats med en ring-knapp, och hyllorna med en snabbknapp för att lägga in på en hylla. Diagram
 * och listor för uppföljning finns på datorn.
 */
@Component({
  selector: 'app-storage-home-mobile',
  standalone: true,
  imports: [SharedModule, ScanTile],
  host: { class: 'flex flex-col gap-5 pb-4' },
  template: `
    <div class="grid grid-cols-3 gap-3">
      <button
        type="button"
        app-scan-tile
        icon="add_circle"
        label="Lämna in"
        [primary]="true"
        (click)="intake()"
      ></button>
      <button
        type="button"
        app-scan-tile
        icon="output"
        label="Lämna ut"
        sub="Skanna etiketten"
        (click)="scanner.openDialog()"
      ></button>
      <button
        type="button"
        app-scan-tile
        icon="search"
        label="Hitta"
        sub="Skylt, kund, hylla"
        (click)="search.open()"
      ></button>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <a
        routerLink="/storage"
        [queryParams]="{ status: 'stored' }"
        class="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-200 active:bg-gray-50"
      >
        <b class="block text-xl tabular-nums">{{ loading() ? '–' : (summary()?.stored ?? '–') }}</b>
        <span class="text-xs text-gray-500">inlagrade set</span>
      </a>
      <a
        routerLink="/storage"
        [queryParams]="{ status: 'stored' }"
        class="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-200 active:bg-gray-50"
      >
        <b class="block text-xl tabular-nums">{{ loading() ? '–' : soon() }}</b>
        <span class="text-xs text-gray-500">hämtas inom 2 veckor</span>
      </a>
      <a
        routerLink="/storage"
        [queryParams]="{ status: 'stored', overdue: true }"
        class="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-200 active:bg-gray-50"
      >
        <b
          class="block text-xl tabular-nums"
          [class.text-red-700]="!loading() && (summary()?.overdue ?? 0) > 0"
          >{{ loading() ? '–' : (summary()?.overdue ?? '–') }}</b
        >
        <span class="text-xs text-gray-500">skulle ha hämtats</span>
      </a>
    </div>

    @if (overdue().length) {
      <section>
        <h2 class="mb-2 px-1 text-sm font-semibold">Skulle ha hämtats</h2>
        <ul class="divide-y divide-gray-100 rounded-xl bg-white px-3 shadow-sm">
          @for (o of overdueShown(); track o.deposit.id) {
            <li class="flex items-center gap-3 py-2">
              <app-reg-plate [value]="o.deposit.vehicle.regNo" size="sm" />
              <a [routerLink]="['/storage', o.deposit.id]" class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{
                  o.deposit.customer.name
                }}</span>
                <span class="block truncate text-xs text-gray-500"
                  >{{ o.deposit.code }} · {{ o.deposit.location || 'Ingen plats' }}</span
                >
                <span class="text-xs font-medium text-red-700"
                  >{{ o.days }} {{ o.days === 1 ? 'dag' : 'dagar' }} sedan</span
                >
              </a>
              @if (o.deposit.customer.phone; as tel) {
                <a
                  [href]="'tel:' + tel"
                  class="grid h-10 w-10 place-items-center rounded-full text-brand active:bg-brand-soft"
                  [attr.aria-label]="'Ring ' + o.deposit.customer.name"
                >
                  <mat-icon>call</mat-icon>
                </a>
              }
            </li>
          }
        </ul>
        @if (overdue().length > overdueShown().length) {
          <a
            routerLink="/storage"
            [queryParams]="{ status: 'stored', overdue: true }"
            class="mt-2 inline-block px-1 text-sm font-medium text-brand"
            >Visa alla {{ overdue().length }}</a
          >
        }
      </section>
    }

    <section>
      <h2 class="mb-2 px-1 text-sm font-semibold">Hyllor</h2>
      @if (rows().length) {
        <ul class="divide-y divide-gray-100 rounded-xl bg-white px-3 shadow-sm">
          @for (r of shown(); track r.key) {
            <li class="flex items-center gap-2">
              <a
                routerLink="/storage"
                [queryParams]="{ status: 'stored', q: r.shelf.query }"
                class="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2"
              >
                <span class="min-w-0 flex-1 truncate text-[15px] font-medium">{{
                  r.shelf.place
                }}</span>
                <span class="shrink-0 text-sm text-gray-600 tabular-nums"
                  >{{ r.shelf.sets }} set</span
                >
              </a>
              @if (r.ids) {
                <button
                  type="button"
                  class="grid h-10 w-10 shrink-0 place-items-center rounded-full text-brand active:bg-brand-soft"
                  [attr.aria-label]="'Lägg in på ' + r.shelf.place"
                  (click)="intakeAt(r.ids)"
                >
                  <mat-icon>add_circle</mat-icon>
                </button>
              }
            </li>
          }
        </ul>
        @if (rows().length > shown().length || showAll()) {
          <button
            type="button"
            class="mt-2 px-1 text-sm font-medium text-brand"
            (click)="showAll.set(!showAll())"
          >
            {{ showAll() ? 'Visa färre' : 'Visa alla ' + rows().length + ' hyllor' }}
          </button>
        }
      } @else if (!loading()) {
        <p class="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">Inga inlagrade set.</p>
      }
    </section>
  `,
})
export class StorageHomeMobile {
  readonly scanner = inject(Scanner);
  readonly search = inject(GlobalSearch);
  private readonly router = inject(Router);
  private readonly now = new Date();

  readonly deposits = input.required<StorageDeposit[]>();
  readonly summary = input<StorageSummary | null>(null);
  readonly loading = input(true);
  readonly showAll = signal(false);

  readonly overdue = computed<Overdue[]>(() => overdueList(this.deposits(), this.now));
  readonly overdueShown = computed(() => this.overdue().slice(0, OVERDUE_SHOWN));

  /** Hämtas denna och nästa vecka, efter de försenade (samma räkning som på datorn). */
  readonly soon = computed(() => {
    const b = pickupForecast(this.deposits(), this.now, 10).buckets;
    return (b[1]?.sets ?? 0) + (b[2]?.sets ?? 0);
  });

  /** Lager och plats för en hylla, ur ett set som står där, så att "Lägg in på hyllan" kan förvälja den. */
  private readonly ids = computed(() => {
    const m = new Map<string, { warehouseId: string; locationId: string }>();
    for (const d of this.deposits()) {
      if (d.warehouseId && d.locationId && d.location) {
        m.set(d.location.trim(), { warehouseId: d.warehouseId, locationId: d.locationId });
      }
    }
    return m;
  });

  readonly rows = computed(() =>
    shelves(this.deposits()).map((shelf: Shelf) => {
      const key = shelf.warehouse ? `${shelf.warehouse} · ${shelf.place}` : shelf.place;
      return { shelf, key, ids: this.ids().get(key) ?? null };
    }),
  );
  readonly shown = computed(() =>
    this.showAll() ? this.rows() : this.rows().slice(0, SHELVES_SHOWN),
  );

  /** En ny inlämning börjar med kameran på skylten. */
  intake() {
    void this.router.navigate(['/storage/new'], { queryParams: { scan: 1 } });
  }

  intakeAt(ids: { warehouseId: string; locationId: string }) {
    void this.router.navigate(['/storage/new'], { queryParams: { scan: 1, ...ids } });
  }
}
