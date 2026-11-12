import { Injectable, computed, inject, signal } from '@angular/core';
import { format, startOfMonth } from 'date-fns';
import { catchError, of } from 'rxjs';
import { CarApi } from '../../core/api/car-api';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { Auth } from '../../core/auth/auth';
import { CarListing } from '../../core/models';
import { Todo } from '../../core/todo';
import {
  askingValue,
  inStock,
  longestInStock,
  purchaseFigures,
  purchasedBetween,
  recentInquiries,
  soldBetween,
  stockFigures,
} from '../../shared/car-stock';
import type { Attention } from '../dashboard/home-data';

/**
 * Det Halls startsida visar, hämtat en gång för både dator- och mobilvyn. Allt räknas ur bilarnas
 * egna böcker (`shared/car-stock.ts`): en bilhandlare tänker i lager, tid i lager och marginal, inte
 * i dagens bokningar. Bilarna hämtas i en lista (en handlare har några hundra, inte tusentals).
 */
@Injectable()
export class HallData {
  private readonly api = inject(CarApi);
  private readonly cards = inject(SalesCardApi);
  private readonly todo = inject(Todo);
  private readonly auth = inject(Auth);

  /** Pengarna (obetalda affärer) är för ägaren. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();

  readonly cars = signal<CarListing[]>([]);
  readonly loaded = signal(false);
  readonly unpaid = signal<{ count: number; amount: number; more: boolean } | null>(null);

  private readonly today = new Date();

  readonly stock = computed(() => stockFigures(this.cars(), this.today));
  readonly longest = computed(() => longestInStock(this.cars(), this.today, 5));
  /** Frågor från intresserade senaste veckan, nyast först. */
  readonly inquiries = computed(() => recentInquiries(this.cars(), this.today, 7));

  /** De senast sålda bilarna, senast först. */
  readonly recentSold = computed(() =>
    soldBetween(this.cars(), '0000-01-01', '9999-12-31').slice(0, 5),
  );

  /** Månadens sålda bilar: antal, sålt för och vinst (öre). */
  readonly month = computed(() => {
    const from = format(startOfMonth(this.today), 'yyyy-MM-dd');
    const sold = soldBetween(this.cars(), from, format(this.today, 'yyyy-MM-dd'));
    return {
      count: sold.length,
      revenue: sold.reduce((s, c) => s + (c.soldPrice ?? 0), 0),
      profit: sold.reduce((s, c) => s + (c.economy.profit ?? 0), 0),
    };
  });

  /** Lagrets värde till annonspris (öre), för bilarna som har ett pris. */
  readonly asking = computed(() => askingValue(this.cars()));

  /** Månadens inköp: antal bilar, vad som betalats (öre) och hur många som saknar inköpspris. */
  readonly bought = computed(() => {
    const from = format(startOfMonth(this.today), 'yyyy-MM-dd');
    const cars = purchasedBetween(this.cars(), from, format(this.today, 'yyyy-MM-dd'));
    const figures = purchaseFigures(cars);
    return { count: cars.length, spent: figures.total, unpriced: cars.length - figures.count };
  });

  /** Snittet av vad bilarna i lager kostade i inköp (öre). */
  readonly purchaseAvg = computed(() => purchaseFigures(this.cars().filter(inStock)));

  /** "Att göra": Halls del av samma lista som menyns siffror (`core/todo.ts`). */
  attention(desktop: boolean): Attention[] {
    const tone = { urgent: 'bad', wait: 'warn', info: 'info' } as const;
    return this.todo
      .itemsFor('hall')
      .filter((t) => !t.desktopOnly || desktop)
      .map((t) => ({
        key: t.key,
        icon: t.icon,
        tone: tone[t.urgency],
        text: t.text,
        link: t.link,
        params: t.params,
      }));
  }

  /** Sant när bilarna hämtats, så att "Inget att göra" inte visas för tidigt. */
  readonly ready = this.loaded;

  constructor() {
    this.api
      .list()
      .pipe(catchError(() => of([] as CarListing[])))
      .subscribe((l) => {
        this.cars.set(l);
        this.loaded.set(true);
      });
    if (this.admin) {
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
  }
}
