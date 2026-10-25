import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { Page } from '../models';

const LIMIT = 100;

/**
 * Hämtar alla sidor av en lista: första sidan ger antalet, resten hämtas samtidigt. Två
 * varv till servern oavsett storlek, i stället för ett per sida i tur och ordning. Tak på
 * `max` poster så att en enorm lista inte hämtas för ett diagram.
 */
export function loadAll<T>(
  page: (offset: number, limit: number) => Observable<Page<T>>,
  max = 1000,
): Observable<T[]> {
  return page(0, LIMIT).pipe(
    switchMap((first) => {
      const total = Math.min(first.pagination.total, max);
      const offsets: number[] = [];
      for (let o = LIMIT; o < total; o += LIMIT) offsets.push(o);
      if (!offsets.length) return of(first.items);
      return forkJoin(offsets.map((o) => page(o, LIMIT))).pipe(
        map((rest) => [first.items, ...rest.map((p) => p.items)].flat()),
      );
    }),
  );
}
