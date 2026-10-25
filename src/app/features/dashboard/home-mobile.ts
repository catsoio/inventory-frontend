import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Booking } from '../../core/models';
import { GlobalSearch } from '../../core/search/global-search';
import { openBooking } from '../../shared/booking-dialog/open-booking';
import { columns, kronor } from '../../shared/chart/chart-kit';
import { ACCENT, OTHER, STATUS } from '../../shared/chart/chart-theme';
import { delta } from '../../shared/stat/stat';
import { shortLabel } from '../../core/insights/hotel';
import { HomeData } from './home-data';

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

/** Så många kommande tider visas direkt; resten finns under Tider. */
const MAX_COMING = 6;

/**
 * Hem på mobil: det man gör i farten. Sök direkt, fyra genvägar, dagens tider med en knapp för att
 * checka in bilen, det som väntar och när däckseten ska hämtas. Inga tabeller och ingen planering.
 */
@Component({
  selector: 'app-home-mobile',
  standalone: false,
  host: { class: 'flex flex-col gap-5 pb-4' },
  template: `
    <button
      type="button"
      class="flex h-12 w-full items-center gap-3 rounded-xl bg-white px-4 text-left text-gray-500 shadow-sm ring-1 ring-gray-200 active:bg-gray-50"
      (click)="search.open()"
    >
      <mat-icon class="text-gray-400">search</mat-icon>
      <span class="truncate text-[15px]">Sök regnr, kund eller plats…</span>
    </button>

    <div class="grid grid-cols-2 gap-2.5">
      @for (a of actions; track a.label) {
        @if (a.link) {
          <a [routerLink]="a.link" [queryParams]="a.params" class="action">
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

    <app-panel title="Att göra" icon="task_alt">
      <app-attention-list [items]="data.attention()" [ready]="!!data.hotel() && !!data.summary()" />
    </app-panel>

    @if (data.admin) {
      <div class="grid grid-cols-2 gap-2.5">
        <app-stat
          label="Försäljning, veckan"
          [value]="weekSold()"
          [delta]="weekDelta()"
          [trend]="weekTrend()"
          hint="exkl. moms"
          link="/finance"
        />
        <app-stat
          label="Obetalt"
          [value]="data.unpaid() ? kr(data.unpaid()!.amount) : '–'"
          [hint]="data.unpaid() ? data.unpaid()!.count + ' fakturor' : ''"
          [status]="data.unpaid()?.count ? 'warn' : 'none'"
          link="/sales"
          [params]="{ show: 'unpaid' }"
        />
      </div>
    }

    <app-panel
      title="Hämtas per vecka"
      subtitle="Inlagrade däckset"
      [empty]="data.depositsLoaded() && !data.deposits().length"
      emptyText="Inga inlagrade set."
    >
      <div class="h-36">
        <app-chart [config]="pickupChart()" label="Däckset som ska hämtas per vecka" />
      </div>
      <a routerLink="/storage" class="mt-2 inline-block text-xs font-medium text-brand">
        Visa alla {{ data.hotel()?.stored ?? '' }} set
      </a>
    </app-panel>
  `,
  styles: `
    .action {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 56px;
      padding: 0 14px;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 0 0 1px rgb(15 23 42 / 0.06);
      font-size: 14.5px;
      font-weight: 600;
      text-align: left;
      line-height: 1.2;
    }
    .action:active {
      background: #f3f4f6;
    }
    .action mat-icon {
      flex: none;
      color: var(--mat-sys-primary);
    }
  `,
})
export class HomeMobile {
  readonly data = inject(HomeData);
  readonly search = inject(GlobalSearch);
  private readonly dialog = inject(MatDialog);
  readonly hhmm = hhmm;
  readonly kr = kronor;

  readonly actions: {
    label: string;
    icon: string;
    link: string | null;
    params?: Record<string, string | number>;
  }[] = [
    { label: 'Ny inlämning', icon: 'add_box', link: '/storage/new' },
    { label: 'Ny bokning', icon: 'event', link: null },
    { label: 'Nytt säljkort', icon: 'point_of_sale', link: '/sales/new' },
    { label: 'Sök däck i lager', icon: 'tire_repair', link: '/inventory', params: { focus: 1 } },
  ];

  constructor() {
    this.data.loadMoney();
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

  // --- pengar (ägaren) ---
  readonly weekSold = computed(() => {
    const w = this.data.week();
    return w ? kronor(w.sold[w.sold.length - 1]) : '–';
  });
  readonly weekDelta = computed(() => {
    const w = this.data.week();
    return w ? delta(w.sold[w.sold.length - 1], w.sold[w.sold.length - 2]) : null;
  });
  readonly weekTrend = computed(() => this.data.week()?.sold.slice(-8) ?? []);

  /** Korta etiketter, så att alla veckor ryms på en telefon. */
  readonly pickupChart = computed(() => {
    const b = this.data.forecast().buckets;
    return columns({
      labels: b.map(shortLabel),
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
}
