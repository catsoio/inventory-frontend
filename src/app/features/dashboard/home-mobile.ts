import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Booking, WorkOrder } from '../../core/models';
import { Scanner } from '../../core/scan/scanner';
import { GlobalSearch } from '../../core/search/global-search';
import { openBooking } from '../../shared/booking-dialog/open-booking';
import { HomeData } from './home-data';

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

/** Så många kommande tider visas direkt; resten finns under Tider. */
const MAX_COMING = 6;

/** Så många order visas på Hem; resten finns under Arbetsorder. */
const MAX_ORDERS = 5;

/**
 * Hem på mobil: det man gör i farten. Sök eller skanna direkt (regnummer, etikett, streckkod), fyra
 * genvägar och dagens tider med en knapp för att checka in bilen. Ingen ekonomi, ingen att göra-lista
 * (det som väntar syns som prickar i "Mer") och ingen planering.
 */
@Component({
  selector: 'app-home-mobile',
  standalone: false,
  host: { class: 'flex flex-col gap-5 pb-4' },
  template: `
    <div class="flex gap-2.5">
      <button
        type="button"
        class="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-xl bg-white px-4 text-left text-gray-500 shadow-sm ring-1 ring-gray-200 active:bg-gray-50"
        (click)="search.open()"
      >
        <mat-icon class="text-gray-400">search</mat-icon>
        <span class="truncate text-[15px]">Sök regnr eller kund…</span>
      </button>
      <button
        type="button"
        class="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white shadow-sm active:opacity-90"
        (click)="scanner.openDialog()"
      >
        <mat-icon>qr_code_scanner</mat-icon> Skanna
      </button>
    </div>

    <div class="grid grid-cols-4 gap-2.5">
      @for (a of actions; track a.label) {
        @if (a.link) {
          <a [routerLink]="a.link" class="action">
            <mat-icon>{{ a.icon }}</mat-icon>
            <span>{{ a.label }}</span>
          </a>
        } @else {
          <button type="button" class="action" (click)="newBooking()">
            <mat-icon>{{ a.icon }}</mat-icon>
            <span>{{ a.label }}</span>
          </button>
        }
      }
    </div>

    <section>
      <div class="mb-2 flex items-baseline gap-2 px-1">
        <h2 class="text-sm font-semibold">Idag</h2>
        <span class="text-xs text-gray-500">
          @if (data.bookingsLoaded()) {
            {{ data.today().length }} {{ data.today().length === 1 ? 'bokning' : 'bokningar' }},
            {{ data.left() }} kvar
          }
        </span>
        <span class="flex-1"></span>
        <a routerLink="/bookings" class="text-xs font-medium text-brand">Alla tider</a>
      </div>

      <div class="flex flex-col gap-2">
        @if (earlier().length) {
          <button
            type="button"
            class="flex h-10 items-center justify-center gap-1 rounded-xl text-sm font-medium text-gray-600 active:bg-gray-100"
            (click)="showEarlier.set(!showEarlier())"
          >
            <mat-icon class="!h-5 !w-5 !text-xl">{{
              showEarlier() ? 'expand_less' : 'expand_more'
            }}</mat-icon>
            {{ showEarlier() ? 'Dölj' : 'Visa' }} {{ earlier().length }} tidigare
          </button>
        }
        @for (b of shown(); track b.id) {
          @let isNext = data.next()?.id === b.id;
          <div
            class="rounded-xl bg-white shadow-sm"
            [class]="isNext ? 'ring-2 ring-brand' : 'ring-1 ring-black/5'"
            [class.opacity-60]="b.status === 'done' || (data.past(b) && !isNext)"
          >
            <button
              type="button"
              class="flex w-full items-start gap-3 p-3 text-left"
              (click)="open(b)"
            >
              <span class="w-12 shrink-0 pt-0.5 text-[15px] font-semibold tabular-nums">{{
                hhmm(b.start)
              }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-medium">{{ b.title }}</span>
                <span class="mt-1 flex items-center gap-2">
                  @if (b.regNo) {
                    <app-reg-plate [value]="b.regNo" size="sm" class="shrink-0" />
                  }
                  <span class="truncate text-sm text-gray-600"
                    >{{ b.customerName }}{{ b.resourceName ? ' · ' + b.resourceName : '' }}</span
                  >
                </span>
              </span>
              @if (b.status === 'done') {
                <app-pill tone="green">Klar</app-pill>
              } @else if (b.status === 'arrived') {
                <app-pill tone="amber">Här</app-pill>
              }
            </button>
            @if (isNext) {
              <div class="flex gap-2 border-t border-gray-100 p-2">
                @if (b.status === 'booked') {
                  <button
                    type="button"
                    class="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white active:opacity-90"
                    (click)="data.setStatus(b, 'arrived')"
                  >
                    <mat-icon class="!h-5 !w-5 !text-xl">login</mat-icon> Anlänt
                  </button>
                } @else {
                  <button
                    type="button"
                    class="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white active:opacity-90"
                    (click)="data.setStatus(b, 'done')"
                  >
                    <mat-icon class="!h-5 !w-5 !text-xl">check</mat-icon> Klar
                  </button>
                }
                @if (b.phone) {
                  <a
                    [href]="'tel:' + b.phone"
                    class="grid h-11 w-12 place-items-center rounded-lg bg-gray-100 text-gray-700 active:bg-gray-200"
                    [attr.aria-label]="'Ring ' + b.customerName"
                  >
                    <mat-icon>call</mat-icon>
                  </a>
                }
              </div>
            }
          </div>
        } @empty {
          @if (data.bookingsLoaded()) {
            <p class="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm ring-1 ring-black/5">
              {{ earlier().length ? 'Inget mer idag.' : 'Inga bokningar idag.' }}
            </p>
          }
        }
        @if (hidden() > 0) {
          <a
            routerLink="/bookings"
            class="flex h-11 items-center justify-center rounded-xl bg-white text-sm font-medium text-brand shadow-sm ring-1 ring-black/5 active:bg-gray-50"
            >+ {{ hidden() }} till idag, se alla tider</a
          >
        }
      </div>
    </section>

    @if (data.workOrdersOn && data.ordersLoaded()) {
      <section>
        <div class="mb-2 flex items-baseline gap-2 px-1">
          <h2 class="text-sm font-semibold">Order på gång</h2>
          <span class="text-xs text-gray-500">{{ data.orders().length }} st</span>
          <span class="flex-1"></span>
          <a routerLink="/workorders" class="text-xs font-medium text-brand">Alla order</a>
        </div>
        <div class="flex flex-col gap-2">
          @for (o of ordersShown(); track o.id) {
            <a
              [routerLink]="['/workorders', o.id]"
              class="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5 active:bg-gray-50"
            >
              <app-reg-plate [value]="o.regNo" size="sm" class="shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-medium">{{ o.vehicle || '–' }}</span>
                <span class="block truncate text-sm text-gray-600"
                  >{{ o.customerName }}{{ o.resourceName ? ' · ' + o.resourceName : '' }}</span
                >
                @if (late(o)) {
                  <span class="block text-xs font-medium text-red-700">Försenad</span>
                } @else if (o.pickupAt) {
                  <span class="block text-xs text-gray-500">Klar senast {{ due(o.pickupAt) }}</span>
                }
              </span>
              @if (o.status === 'waiting_parts' || o.hasMissing) {
                <app-pill tone="amber">Del saknas</app-pill>
              } @else if (o.status === 'in_progress') {
                <app-pill tone="blue">Pågår</app-pill>
              } @else {
                <app-pill tone="gray">Öppen</app-pill>
              }
            </a>
          } @empty {
            <p class="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm ring-1 ring-black/5">
              Inga order på gång.
            </p>
          }
          @if (ordersHidden() > 0) {
            <a
              routerLink="/workorders"
              class="flex h-11 items-center justify-center rounded-xl bg-white text-sm font-medium text-brand shadow-sm ring-1 ring-black/5 active:bg-gray-50"
              >+ {{ ordersHidden() }} till, se alla order</a
            >
          }
        </div>
      </section>
    }
  `,
  styles: `
    .action {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      aspect-ratio: 1;
      padding: 6px 4px;
      border-radius: var(--radius-ui, 12px);
      background: #fff;
      box-shadow: 0 0 0 1px rgb(15 23 42 / 0.06);
      font-size: 12.5px;
      font-weight: 600;
      text-align: center;
      line-height: 1.15;
    }
    .action:active {
      background: #f3f4f6;
    }
    .action mat-icon {
      flex: none;
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: var(--mat-sys-primary);
    }
  `,
})
export class HomeMobile {
  readonly data = inject(HomeData);
  readonly search = inject(GlobalSearch);
  readonly scanner = inject(Scanner);
  private readonly dialog = inject(MatDialog);
  readonly hhmm = hhmm;

  readonly actions: {
    label: string;
    icon: string;
    link: string | null;
  }[] = [
    { label: 'Ny order', icon: 'handyman', link: '/workorders/new' },
    { label: 'Ny bokning', icon: 'event', link: null },
    { label: 'Sälj', icon: 'point_of_sale', link: '/sales/new' },
    { label: 'Ta emot', icon: 'move_to_inbox', link: '/inventory/receive' },
  ];

  constructor() {
    this.data.loadOrders(true);
  }

  // --- order på gång: försenade först, sedan den som ska vara klar först ---

  private readonly sorted = computed(() =>
    this.data
      .orders()
      .filter(
        (o) => o.status === 'open' || o.status === 'in_progress' || o.status === 'waiting_parts',
      )
      .sort(
        (a, b) =>
          Number(this.late(b)) - Number(this.late(a)) ||
          (a.pickupAt ?? '9999').localeCompare(b.pickupAt ?? '9999') ||
          a.receivedAt.localeCompare(b.receivedAt),
      ),
  );
  readonly ordersShown = computed(() => this.sorted().slice(0, MAX_ORDERS));
  readonly ordersHidden = computed(() => Math.max(this.sorted().length - MAX_ORDERS, 0));

  late(o: WorkOrder): boolean {
    return !!o.pickupAt && new Date(o.pickupAt).getTime() < this.data.now();
  }

  /** "idag 15:00", "i morgon 09:00" eller datum. */
  due(iso: string): string {
    const d = new Date(iso);
    const now = new Date(this.data.now());
    const days = Math.round(
      (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
        new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
        864e5,
    );
    const t = hhmm(iso);
    if (days === 0) return `idag ${t}`;
    if (days === 1) return `i morgon ${t}`;
    return `${d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')} ${t}`;
  }

  newBooking() {
    openBooking(this.dialog, null).subscribe((r) => r && this.data.loadBookings());
  }

  open(b: Booking) {
    openBooking(this.dialog, b).subscribe((r) => r && this.data.loadBookings());
  }

  // --- dagens lista: det som är kvar, avslutat gömt, högst sex ---

  readonly showEarlier = signal(false);
  readonly earlier = computed(() =>
    this.data
      .today()
      .filter((b) => b.status === 'done' || (this.data.past(b) && b.status !== 'arrived')),
  );
  private readonly coming = computed(() => {
    const gone = new Set(this.earlier().map((b) => b.id));
    return this.data.today().filter((b) => !gone.has(b.id));
  });
  readonly shown = computed(() => [
    ...(this.showEarlier() ? this.earlier() : []),
    ...this.coming().slice(0, MAX_COMING),
  ]);
  readonly hidden = computed(() => Math.max(this.coming().length - MAX_COMING, 0));
}
