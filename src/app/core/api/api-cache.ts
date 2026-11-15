import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injectable, Injector, inject } from '@angular/core';
import { Observable, Subject, defer, map, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Auth } from '../auth/auth';

/** Så länge ett register (mekaniker, lager, åtgärder, företagsuppgifter) får stå utan att ändras här. */
export const REFERENCE_TTL = 5 * 60_000;

export interface CacheOptions {
  /**
   * Adresserna (utan serveradressen, t.ex. `inventory/resources`) som svaret hör till. En lyckad
   * ändring (POST, PUT, PATCH, DELETE) på en adress under en av dem, eller ovanför den, gör svaret
   * ogiltigt.
   */
  tags: string[];
  /** Hur länge svaret gäller om ingen ändring sker härifrån (ms); något en kollega ändrar syns då. */
  ttl?: number;
  /** Hoppa över det sparade svaret och hämta på nytt (en uppdateringsknapp). */
  fresh?: boolean;
  /**
   * Ge varje som frågar en egen kopia (standard). Av för stora listor som bara läses: den som ändrar
   * dem på plats ändrar då det alla andra ser.
   */
  copy?: boolean;
}

interface Entry {
  at: number;
  tags: string[];
  value$: Observable<unknown>;
}

/**
 * Samma adress inom `ttl` hämtas en gång och delas mellan alla som frågar. Ligger bara i minnet (aldrig
 * i webbläsarens lagring: det är kunddata), per användare och garage, och försvinner när sidan laddas om.
 *
 * Det är för register som ändras sällan och läses överallt. Det man arbetar i (listor, kort) hämtas
 * alltid på nytt. Allt som ändrar något går genom {@link apiCacheInterceptor}, som tömmer det
 * ändringen rör, så att man aldrig ser sin egen gamla uppgift.
 */
@Injectable({ providedIn: 'root' })
export class ApiCache {
  // Auth hämtas först när den behövs: Auth använder AxleApi, som använder cachen, så en direkt
  // injektion blir en cirkel (NG0200).
  private readonly injector = inject(Injector);
  private readonly entries = new Map<string, Entry>();
  private readonly written = new Subject<string>();

  /** Varje lyckad ändring, som adress. Todo lyssnar för att räkna om siffrorna i menyn. */
  readonly writes$ = this.written.asObservable();

  private keyOf(key: string): string {
    const auth = this.injector.get(Auth);
    return `${auth.user()?.id ?? ''}:${auth.garage()?.id ?? ''}:${key}`;
  }

  /**
   * Svaret på `make()`, delat. Var och en som prenumererar får en egen kopia, så att den som ändrar
   * listan eller objektet på plats inte ändrar det någon annan ser. Ett fel sparas inte.
   */
  get<T>(key: string, make: () => Observable<T>, options: CacheOptions): Observable<T> {
    return defer(() => {
      const k = this.keyOf(key);
      const hit = this.entries.get(k);
      const ttl = options.ttl ?? REFERENCE_TTL;
      if (hit && !options.fresh && Date.now() - hit.at < ttl) return hit.value$ as Observable<T>;
      const entry: Entry = { at: Date.now(), tags: options.tags, value$: undefined as never };
      entry.value$ = make().pipe(
        tap({
          error: () => {
            if (this.entries.get(k) === entry) this.entries.delete(k);
          },
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.entries.set(k, entry);
      return entry.value$ as Observable<T>;
    }).pipe(map((v) => (options.copy === false ? v : structuredClone(v))));
  }

  /** En ändring har gått igenom på `path`: töm det den rör och säg det till dem som lyssnar. */
  wrote(path: string): void {
    for (const [k, e] of this.entries) {
      if (e.tags.some((t) => related(t, path))) this.entries.delete(k);
    }
    this.written.next(path);
  }

  /** Töm det som hör till de här adresserna (för det som ändras utan att gå genom appen). */
  invalidate(...tags: string[]): void {
    for (const [k, e] of this.entries) {
      if (e.tags.some((t) => tags.some((x) => related(t, x)))) this.entries.delete(k);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Samma adress, eller den ena ligger under den andra (hela segment: `a/b` hör till `a`, inte `ab`). */
function related(tag: string, path: string): boolean {
  return path === tag || path.startsWith(tag + '/') || tag.startsWith(path + '/');
}

const API = `${environment.apiUrl}/inventory`;

/** Adressen som cachen känner den: utan serveradress och utan frågetecken. */
export function pathOf(url: string): string {
  return url.slice(environment.apiUrl.length + 1).split(/[?#]/)[0];
}

/** Berättar för cachen när något ändrats, så att den tömmer det ändringen rör. */
export const apiCacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || !req.url.startsWith(API)) {
    return next(req);
  }
  const cache = inject(ApiCache);
  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) cache.wrote(pathOf(req.url));
    }),
  );
};
