import { Component, computed, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { Router } from '@angular/router';
import { format, startOfMonth } from 'date-fns';
import { CarApi } from '../../core/api/car-api';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { CarListing } from '../../core/models';
import { daysInStock } from '../../shared/car-stock';
import { KrPipe } from '../../shared/kr-pipe';

const kr = new KrPipe();

/**
 * Halls egen ekonomi: vad bilhandeln tjänat under en period och vad som ligger i lager. Räknat ur
 * bilarnas egna böcker (inköp, kostnader, såld för, moms), inte ur verkstadens ekonomi.
 */
@Component({
  selector: 'app-hall-finance',
  standalone: false,
  host: { class: 'block' },
  template: `
    <app-finance-tabs />
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <h1 class="mr-2 text-2xl font-semibold">Ekonomi</h1>
      <label class="flex items-center gap-2 text-sm">
        Från
        <input
          type="date"
          class="h-10 px-2 field"
          [value]="from()"
          (change)="from.set($any($event.target).value)"
        />
      </label>
      <label class="flex items-center gap-2 text-sm">
        Till
        <input
          type="date"
          class="h-10 px-2 field"
          [value]="to()"
          (change)="to.set($any($event.target).value)"
        />
      </label>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      @for (k of tiles(); track k.label) {
        <app-stat
          [label]="k.label"
          [value]="k.value"
          [hint]="k.sub"
          [status]="k.status ?? 'none'"
          [link]="k.link ?? null"
          [params]="k.params ?? {}"
        />
      }
    </div>

    <section class="mt-6 rounded-xl bg-white p-5 shadow-sm">
      <h2 class="mb-3 text-base font-semibold">Sålda bilar i perioden</h2>
      @if (sold().length === 0) {
        <p class="text-sm text-gray-600">Inga sålda bilar i perioden.</p>
      } @else {
        <table class="w-full text-sm">
          <thead class="text-left text-xs tracking-wide text-gray-500 uppercase">
            <tr class="border-b">
              <th class="py-1.5">Såld</th>
              <th class="py-1.5">Regnr</th>
              <th class="py-1.5">Bil</th>
              <th class="py-1.5 text-right">Såld för</th>
              <th class="py-1.5 text-right">Moms att betala</th>
              <th class="py-1.5 text-right">Vinst</th>
            </tr>
          </thead>
          <tbody>
            @for (c of sold(); track c.id) {
              <tr
                class="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                (click)="open(c)"
              >
                <td class="py-1.5">{{ c.soldAt }}</td>
                <td class="py-1.5">{{ c.regNo }}</td>
                <td class="py-1.5">{{ c.heading }}</td>
                <td class="py-1.5 text-right tabular-nums">{{ money(c.soldPrice) }}</td>
                <td class="py-1.5 text-right tabular-nums">{{ money(c.economy.vatToPay) }}</td>
                <td class="py-1.5 text-right font-medium tabular-nums">
                  {{ money(c.economy.profit) }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
})
export class HallFinance {
  private readonly api = inject(CarApi);
  private readonly router = inject(Router);

  readonly from = signal(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  readonly to = signal(format(new Date(), 'yyyy-MM-dd'));
  private readonly items = signal<CarListing[]>([]);
  private readonly cards = inject(SalesCardApi);
  /** Bilaffärer som är bokförda men inte betalda (fakturor). */
  private readonly unpaid = signal<{ count: number; amount: number; more: boolean } | null>(null);

  readonly sold = computed(() =>
    this.items()
      .filter(
        (c) => c.status === 'sold' && c.soldAt && c.soldAt >= this.from() && c.soldAt <= this.to(),
      )
      .sort((a, b) => (b.soldAt ?? '').localeCompare(a.soldAt ?? '')),
  );

  /** Bilar som köpts men inte sålts: pengar som ligger i lagret. */
  private readonly stock = computed(() =>
    this.items().filter((c) => c.status !== 'sold' && c.purchase),
  );

  readonly tiles = computed(() => {
    const sum = (list: CarListing[], f: (c: CarListing) => number) =>
      list.reduce((s, c) => s + f(c), 0);
    const sold = this.sold();
    const tied = sum(
      this.stock(),
      (c) => (c.purchase?.price ?? 0) + sum([c], (x) => x.costs.reduce((a, k) => a + k.amount, 0)),
    );
    const unpaid = this.unpaid();
    const days = sold.length ? Math.round(sum(sold, (c) => daysInStock(c)) / sold.length) : null;
    return [
      {
        label: 'Sålt för',
        value: kr.transform(sum(sold, (c) => c.soldPrice ?? 0)),
        sub:
          days == null
            ? `${sold.length} bilar`
            : `${sold.length} bilar · snitt ${days} dagar i lager`,
      },
      {
        label: 'Vinst',
        value: kr.transform(sum(sold, (c) => c.economy.profit ?? 0)),
        sub: 'efter moms och kostnader',
      },
      {
        label: 'Moms att betala',
        value: kr.transform(sum(sold, (c) => c.economy.vatToPay ?? 0)),
        sub: 'på de sålda bilarna',
      },
      {
        label: 'I lager',
        value: kr.transform(tied),
        sub: `${this.stock().length} bilar, inköp och kostnader`,
      },
      {
        label: 'Obetalt',
        value: unpaid ? kr.transform(unpaid.amount) : '–',
        sub: unpaid
          ? `${unpaid.count} ${unpaid.count === 1 ? 'faktura' : 'fakturor'}${unpaid.more ? '+' : ''}`
          : '',
        status: unpaid?.count ? ('warn' as const) : undefined,
        link: '/finance/invoices',
        params: { status: 'unpaid' },
      },
    ];
  });

  constructor() {
    this.api.list().subscribe((r) => this.items.set(r));
    this.cards
      .list({ status: 'posted', paid: false, product: 'hall', limit: 100 })
      .pipe(catchError(() => of(null)))
      .subscribe((x) =>
        this.unpaid.set(
          x
            ? {
                count: x.pagination.total,
                amount: x.items.reduce((t, c) => t + c.total, 0),
                more: x.pagination.total > x.items.length,
              }
            : null,
        ),
      );
  }

  money(n: number | null | undefined) {
    return n == null ? '–' : kr.transform(n);
  }

  open(c: CarListing) {
    void this.router.navigate(['/dealership/cars', c.id]);
  }
}
