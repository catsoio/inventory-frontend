import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AxleApi } from '../api/axle-api';
import { StorageApi } from '../api/storage-api';
import { ApiCache } from '../api/api-cache';
import { Article, GroupedReport, StockHistoryPoint, StorageDeposit } from '../models';
import { addDays, startOfWeek, ymd } from './dates';
import { loadAll } from './load-all';

/**
 * Det som flyttar lagret eller pengarna: en ändring på någon av dessa adresser gör översikterna
 * ogiltiga, så Hem visar en försäljning direkt i stället för efter en minut.
 */
const STOCK_TAGS = [
  'inventory/articles',
  'inventory/sales-cards',
  'inventory/purchase-cards',
  'inventory/work-orders',
  'inventory/storage',
  'inventory/closings',
];

/**
 * Underlag för översikterna och diagrammen. Hämtar hela listor en gång och delar dem mellan
 * sidorna en kort stund, så att Hem, Lager och Däckhotell inte hämtar samma sak flera gånger
 * när man hoppar mellan dem. Allt räknas ut i webbläsaren (några hundra till tusen poster).
 */
@Injectable({ providedIn: 'root' })
export class Insights {
  private readonly storage = inject(StorageApi);
  private readonly inventory = inject(AxleApi);
  private readonly cache = inject(ApiCache);

  /**
   * Delar svaret mellan anropare i `ttl` ms, och tömmer det när något ändras som siffrorna räknas av
   * (`tags`). Ett fel sparas inte.
   */
  private cached<T>(
    key: string,
    ttl: number,
    fresh: boolean,
    tags: string[],
    make: () => Observable<T>,
  ): Observable<T> {
    // Underlagen är stora listor som bara läses, så ingen kopia per anropare.
    return this.cache.get(key, make, { ttl, fresh, tags, copy: false });
  }

  /** Alla inlagrade däckset. */
  storedDeposits(fresh = false): Observable<StorageDeposit[]> {
    return this.cached('deposits', 45_000, fresh, ['inventory/storage'], () =>
      loadAll((offset, limit) => this.storage.deposits({ status: 'stored', limit, offset })),
    );
  }

  /** Alla aktiva artiklar. */
  articles(fresh = false): Observable<Article[]> {
    return this.cached('articles', 45_000, fresh, STOCK_TAGS, () =>
      loadAll((offset, limit) => this.inventory.articles({ limit, offset })),
    );
  }

  /** Försäljning och inköp per vecka, `weeks` veckor bakåt (bara ägare). */
  weekly(now: Date, weeks = 12, fresh = false): Observable<GroupedReport> {
    const from = addDays(startOfWeek(now), -7 * (weeks - 1));
    return this.cached(`weekly:${weeks}`, 60_000, fresh, STOCK_TAGS, () =>
      this.inventory.reportBy('week', ymd(from), ymd(now)),
    );
  }

  /** Försäljning och inköp per dag, `days` dagar bakåt, för månadsdiagram (bara ägare). */
  daily(now: Date, days = 365, fresh = false): Observable<GroupedReport> {
    const from = addDays(now, -(days - 1));
    return this.cached(`daily:${days}`, 5 * 60_000, fresh, STOCK_TAGS, () =>
      this.inventory.reportBy('day', ymd(from), ymd(now)),
    );
  }

  /** Lagrets värde och antal per dag, `days` dagar bakåt (bara ägare). */
  stockHistory(now: Date, days = 90, fresh = false): Observable<StockHistoryPoint[]> {
    const from = addDays(now, -(days - 1));
    return this.cached(`history:${days}`, 5 * 60_000, fresh, STOCK_TAGS, () =>
      this.inventory.stockHistory(ymd(from), ymd(now)),
    );
  }

  /** Märken efter försäljning under perioden, bäst först (bara ägare). */
  brandSales(from: Date, to: Date, fresh = false): Observable<GroupedReport> {
    return this.cached(`brands:${ymd(from)}:${ymd(to)}`, 60_000, fresh, STOCK_TAGS, () =>
      this.inventory.reportBy('brand', ymd(from), ymd(to)),
    );
  }
}
