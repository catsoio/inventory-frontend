import { Component, Input, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CarListing, LISTING_STATUS_LABELS, ListingStatus } from '../../core/models';
import { daysInStock } from '../../shared/car-stock';
import { carColorHex } from '../../shared/car-color';
import { agoText } from './ago';

const TONE: Record<ListingStatus, 'green' | 'amber' | 'gray' | 'blue'> = {
  draft: 'gray',
  active: 'green',
  reserved: 'amber',
  sold: 'blue',
};

/**
 * Bilens kort bredvid listan (som arbetsordernas snabbpanel): bild, nyckeluppgifter, ekonomin och
 * de som hört av sig med namn och kontaktuppgifter. Allt ligger redan på bilen i listan, så
 * panelen hämtar inget. Bilens kort öppnas för att ändra något.
 */
@Component({
  selector: 'app-car-quick',
  standalone: false,
  host: { class: 'block' },
  template: `
    @if (car; as c) {
      <article class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
        <app-photo-gallery [urls]="photos()" />

        <div class="flex flex-col gap-4 p-4">
          <header>
            <div class="flex flex-wrap items-center gap-2">
              <app-reg-plate [value]="c.regNo" size="sm" />
              <app-pill [tone]="tone(c.status)">{{ statusText(c.status) }}</app-pill>
            </div>
            <h2 class="mt-2 text-lg leading-tight font-semibold">{{ c.heading }}</h2>
            @if (c.variant) {
              <p class="text-sm text-gray-500">{{ c.variant }}</p>
            }
          </header>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            @for (f of facts(); track f[0]) {
              <div>
                <dt class="text-xs text-gray-500">{{ f[0] }}</dt>
                <dd class="font-medium">
                  @if (f[0] === 'Färg' && c.color) {
                    <span
                      class="mr-1.5 inline-block h-3 w-3 rounded-full align-middle ring-1 ring-black/20"
                      [style.background]="hex(c.color)"
                    ></span>
                  }
                  {{ f[1] }}
                </dd>
              </div>
            }
          </dl>

          <section class="rounded-lg bg-gray-50 p-3 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">{{ c.status === 'sold' ? 'Såld för' : 'Pris' }}</span>
              <span class="font-semibold">{{
                (c.status === 'sold' ? c.soldPrice : c.price) | kr
              }}</span>
            </div>
            @if (c.economy.totalCost != null) {
              <div class="flex justify-between">
                <span class="text-gray-500">Kostnad</span>
                <span>{{ c.economy.totalCost | kr }}</span>
              </div>
            }
            @if (c.economy.profit != null) {
              <div class="flex justify-between">
                <span class="text-gray-500">Vinst</span>
                <span [class]="c.economy.profit < 0 ? 'text-red-700' : 'text-green-700'">{{
                  c.economy.profit | kr
                }}</span>
              </div>
            }
            @if (c.status !== 'sold') {
              <div class="flex justify-between">
                <span class="text-gray-500">I lager</span>
                <span>{{ days() }} {{ days() === 1 ? 'dag' : 'dagar' }}</span>
              </div>
            }
          </section>

          <section>
            <h3 class="mb-2 flex items-center gap-2 text-sm font-semibold">
              Intresserade
              <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">{{
                c.inquiries.length
              }}</span>
            </h3>
            @if (c.inquiries.length === 0) {
              <p class="text-sm text-gray-500">
                Ingen har hört av sig än.
                @if (c.status === 'draft') {
                  Bilen är inte utlagd till salu.
                }
              </p>
            } @else {
              <ul class="flex flex-col divide-y divide-gray-100">
                @for (q of inquiries(); track q.at + q.phone) {
                  <li class="py-2 text-sm">
                    <div class="flex items-baseline justify-between gap-2">
                      <span class="font-medium">{{ q.name }}</span>
                      <span class="text-xs text-gray-500">{{ ago(q.at) }}</span>
                    </div>
                    <div class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <a class="text-blue-700 hover:underline" [href]="'tel:' + q.phone">{{
                        q.phone
                      }}</a>
                      @if (q.email) {
                        <a class="text-blue-700 hover:underline" [href]="'mailto:' + q.email">{{
                          q.email
                        }}</a>
                      }
                    </div>
                    @if (q.message) {
                      <p class="mt-1 text-gray-600">{{ q.message }}</p>
                    }
                  </li>
                }
              </ul>
              @if (c.inquiries.length > shown) {
                <p class="pt-1 text-xs text-gray-500">
                  Visar de {{ shown }} senaste.
                  <a [routerLink]="['/dealership/cars', c.id]" class="text-blue-700 underline"
                    >Se alla på bilens kort</a
                  >
                </p>
              }
            }
          </section>

          <footer class="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            <a mat-flat-button color="primary" [routerLink]="['/dealership/cars', c.id]">
              <mat-icon>open_in_new</mat-icon> Öppna bilen
            </a>
            @if (c.soldCardId || c.dealCardId) {
              <a mat-stroked-button [routerLink]="['/sales', c.soldCardId || c.dealCardId]">
                Öppna affären
              </a>
            } @else if (c.status === 'active' || c.status === 'reserved') {
              <a mat-stroked-button routerLink="/sales/new" [queryParams]="{ carId: c.id }">
                Starta affär
              </a>
            }
          </footer>
        </div>
      </article>
    }
  `,
})
export class CarQuick {
  private readonly current = signal<CarListing | null>(null);

  @Input() set car(c: CarListing | null) {
    this.current.set(c);
  }
  get car(): CarListing | null {
    return this.current();
  }

  /** Så många frågor visas i panelen; resten finns på bilens kort. */
  readonly shown = 5;
  readonly hex = carColorHex;
  readonly tone = (s: ListingStatus) => TONE[s];
  readonly statusText = (s: ListingStatus) => LISTING_STATUS_LABELS[s];
  readonly ago = (iso: string) => agoText(iso);

  readonly photos = computed(() =>
    (this.current()?.imageUrls ?? []).map((u) => environment.apiUrl + u),
  );
  readonly days = computed(() => {
    const c = this.current();
    return c ? daysInStock(c) : 0;
  });
  /** Nyast först. */
  readonly inquiries = computed(() =>
    [...(this.current()?.inquiries ?? [])]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, this.shown),
  );

  readonly facts = computed<[string, string][]>(() => {
    const c = this.current();
    if (!c) return [];
    const rows: [string, string | null][] = [
      ['Årsmodell', c.year ? String(c.year) : null],
      [
        'Miltal',
        c.mileageKm != null ? `${Math.round(c.mileageKm / 10).toLocaleString('sv-SE')} mil` : null,
      ],
      ['Drivmedel', c.fuel],
      ['Växellåda', c.gearbox],
      ['Färg', c.color],
      ['Besiktning', c.inspectionDue],
    ];
    return rows.filter((r): r is [string, string] => !!r[1]);
  });
}
