import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay, tap } from 'rxjs';
import { AxleApi } from '../api/axle-api';
import { StorageApi } from '../api/storage-api';
import { Auth } from '../auth/auth';
import { Article, GroupedReport, StockHistoryPoint, StorageDeposit } from '../models';
import { addDays, startOfWeek, ymd } from './dates';
import { loadAll } from './load-all';

/**
 * Underlag för översikterna och diagrammen. Hämtar hela listor en gång och delar dem mellan
 * sidorna en kort stund, så att Hem, Lager och Däckhotell inte hämtar samma sak flera gånger
 * när man hoppar mellan dem. Allt räknas ut i webbläsaren (några hundra till tusen poster).
 */
@Injectable({ providedIn: 'root' })
export class Insights {
  private readonly auth = inject(Auth);
  private readonly storage = inject(StorageApi);
  private readonly inventory = inject(AxleApi);
  private readonly memo = new Map<string, { at: number; value$: Observable<unknown> }>();

  /** Delar svaret mellan anropare i `ttl` ms. Ett fel sparas inte. */
  private cached<T>(
    key: string,
    ttl: number,
    fresh: boolean,
    make: () => Observable<T>,
  ): Observable<T> {
    const k = `${this.auth.garage()?.id ?? ''}:${key}`;
    const hit = this.memo.get(k);
    if (hit && !fresh && Date.now() - hit.at < ttl) return hit.value$ as Observable<T>;
    const value$ = make().pipe(
      tap({ error: () => this.memo.delete(k) }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.memo.set(k, { at: Date.now(), value$ });
    return value$;
  }

  /** Alla inlagrade däckset. */
  storedDeposits(fresh = false): Observable<StorageDeposit[]> {
    return this.cached('deposits', 45_000, fresh, () =>
      loadAll((offset, limit) => this.storage.deposits({ status: 'stored', limit, offset })),
    );
  }

  /** Alla aktiva artiklar. */
  articles(fresh = false): Observable<Article[]> {
    return this.cached('articles', 45_000, fresh, () =>
      loadAll((offset, limit) => this.inventory.articles({ limit, offset })),
    );
  }

  /** Försäljning och inköp per vecka, `weeks` veckor bakåt (bara ägare). */
  weekly(now: Date, weeks = 12, fresh = false): Observable<GroupedReport> {
    const from = addDays(startOfWeek(now), -7 * (weeks - 1));
    return this.cached(`weekly:${weeks}`, 60_000, fresh, () =>
      this.inventory.reportBy('week', ymd(from), ymd(now)),
    );
  }

  /** Försäljning och inköp per dag, `days` dagar bakåt, för månadsdiagram (bara ägare). */
  daily(now: Date, days = 365, fresh = false): Observable<GroupedReport> {
    const from = addDays(now, -(days - 1));
    return this.cached(`daily:${days}`, 5 * 60_000, fresh, () =>
      this.inventory.reportBy('day', ymd(from), ymd(now)),
    );
  }

  /** Lagrets värde och antal per dag, `days` dagar bakåt (bara ägare). */
  stockHistory(now: Date, days = 90, fresh = false): Observable<StockHistoryPoint[]> {
    const from = addDays(now, -(days - 1));
    return this.cached(`history:${days}`, 5 * 60_000, fresh, () =>
      this.inventory.stockHistory(ymd(from), ymd(now)),
    );
  }

  /** Märken efter försäljning under perioden, bäst först (bara ägare). */
  brandSales(from: Date, to: Date, fresh = false): Observable<GroupedReport> {
    return this.cached(`brands:${ymd(from)}:${ymd(to)}`, 60_000, fresh, () =>
      this.inventory.reportBy('brand', ymd(from), ymd(to)),
    );
  }
}
