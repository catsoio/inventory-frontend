import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

/** Så länge en Hem-sida som man lämnat räknas som färsk. Därefter byggs den upp på nytt. */
const FRESH_MS = 3 * 60_000;

interface Stored {
  handle: DetachedRouteHandle;
  at: number;
}

/**
 * Hem-sidorna (Verkstad, Däckhotell, Bilhandel, Bärgning) behålls när man byter produkt, så att man
 * kommer tillbaka till samma sida utan att allt hämtas om: `data: { reuse: true }` på rutten.
 * Sidan räknas som färsk i tre minuter; är den äldre byggs den upp på nytt, och uppdateringsknappen
 * (`Refresh`) bygger alltid upp den igen. Alla andra sidor (listor, kort, formulär) byggs som vanligt.
 */
@Injectable({ providedIn: 'root' })
export class PageReuseStrategy implements RouteReuseStrategy {
  private readonly stored = new Map<string, Stored>();
  private reloading = false;

  /** Nästa navigering bygger upp alla sidor på nytt (uppdatera). */
  reloadNext(): void {
    this.reloading = true;
    for (const key of [...this.stored.keys()]) this.evict(key);
  }

  /** Efter navigeringen: tillbaka till det vanliga. */
  done(): void {
    this.reloading = false;
  }

  private static reusable(route: ActivatedRouteSnapshot): boolean {
    return route.routeConfig?.data?.['reuse'] === true;
  }

  /** Sidans adress, utan filter, som nyckel. */
  private static key(route: ActivatedRouteSnapshot): string {
    return route.pathFromRoot
      .flatMap((r) => r.url.map((s) => s.path))
      .filter(Boolean)
      .join('/');
  }

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return !this.reloading && PageReuseStrategy.reusable(route);
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const key = PageReuseStrategy.key(route);
    this.evict(key);
    if (handle) this.stored.set(key, { handle, at: Date.now() });
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    if (this.reloading || !PageReuseStrategy.reusable(route)) return false;
    const key = PageReuseStrategy.key(route);
    const hit = this.stored.get(key);
    if (hit && Date.now() - hit.at > FRESH_MS) this.evict(key);
    return this.stored.has(key);
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const key = PageReuseStrategy.key(route);
    const hit = this.stored.get(key);
    // Sidan är nu uppe igen; när man lämnar den sparas den på nytt.
    this.stored.delete(key);
    return hit?.handle ?? null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    // Vid uppdatering byggs allt under skalet upp på nytt (skalet själv, andra nivån, behålls).
    if (this.reloading && future.parent?.parent) return false;
    return future.routeConfig === curr.routeConfig;
  }

  /** En sida som aldrig kommer tillbaka förstörs, så att den inte ligger kvar i minnet. */
  private evict(key: string): void {
    const hit = this.stored.get(key);
    this.stored.delete(key);
    (
      hit?.handle as unknown as { componentRef?: { destroy(): void } } | undefined
    )?.componentRef?.destroy();
  }
}
