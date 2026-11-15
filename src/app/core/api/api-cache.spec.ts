import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { Auth } from '../auth/auth';
import { ApiCache, pathOf } from './api-cache';
import { AxleApi } from './axle-api';

function setup(user = 'u1', garage = 'g1') {
  const who = { user, garage };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: Auth,
        useValue: { user: () => ({ id: who.user }), garage: () => ({ id: who.garage }) },
      },
    ],
  });
  return { cache: TestBed.inject(ApiCache), who };
}

/** En källa som räknar hur många gånger den frågats. */
const source = <T>(value: () => T) => {
  const make = vi.fn(() => of(value()));
  return make as typeof make & (() => Observable<T>);
};

const read = <T>(o: Observable<T>): T => {
  let out!: T;
  o.subscribe((v) => (out = v));
  return out;
};

describe('ApiCache', () => {
  it('hämtar en gång och delar svaret', () => {
    const { cache } = setup();
    const make = source(() => [1, 2]);
    const get = () => cache.get('list', make, { tags: ['inventory/things'] });
    expect(read(get())).toEqual([1, 2]);
    expect(read(get())).toEqual([1, 2]);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('ger var och en en egen kopia, så en ändring på plats syns inte för andra', () => {
    const { cache } = setup();
    const make = source(() => [{ n: 1 }]);
    const get = () => cache.get('list', make, { tags: ['inventory/things'] });
    read(get())[0].n = 99;
    expect(read(get())).toEqual([{ n: 1 }]);
  });

  it('en lyckad ändring på samma adress tömmer, även på en post under den', () => {
    const { cache } = setup();
    const make = source(() => 'x');
    const get = () => cache.get('list', make, { tags: ['inventory/resources'] });
    read(get());
    cache.wrote('inventory/resources/abc');
    read(get());
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('en ändring någon annanstans lämnar svaret', () => {
    const { cache } = setup();
    const make = source(() => 'x');
    const get = () => cache.get('list', make, { tags: ['inventory/resources'] });
    read(get());
    cache.wrote('inventory/warehouses');
    // Hela segment: resources-extra är en annan adress än resources.
    cache.wrote('inventory/resources-extra');
    read(get());
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('en ändring ovanför tömmer också (PUT inventory/settings gäller settings/pricing)', () => {
    const { cache } = setup();
    const make = source(() => 'x');
    const get = () => cache.get('pricing', make, { tags: ['inventory/settings/pricing'] });
    read(get());
    cache.wrote('inventory/settings');
    read(get());
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('hämtar om när tiden gått ut, och med fresh', () => {
    vi.useFakeTimers();
    try {
      const { cache } = setup();
      const make = source(() => 'x');
      const opts = { tags: ['inventory/things'], ttl: 1000 };
      read(cache.get('k', make, opts));
      vi.advanceTimersByTime(999);
      read(cache.get('k', make, opts));
      expect(make).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(2);
      read(cache.get('k', make, opts));
      expect(make).toHaveBeenCalledTimes(2);
      read(cache.get('k', make, { ...opts, fresh: true }));
      expect(make).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sparar inte ett fel', () => {
    const { cache } = setup();
    let fail = true;
    const make = vi.fn(() => (fail ? throwError(() => new Error('nej')) : of('ok')));
    const get = () => cache.get('k', make, { tags: ['inventory/things'] });
    get().subscribe({ error: () => {} });
    fail = false;
    expect(read(get())).toBe('ok');
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('en ändring medan svaret är på väg sparar inte det gamla svaret', () => {
    const { cache } = setup();
    const inflight = new Subject<string>();
    let n = 0;
    const make = vi.fn(() => (n++ === 0 ? inflight : of('nytt')));
    const get = () => cache.get('k', make, { tags: ['inventory/things'] });
    get().subscribe();
    cache.wrote('inventory/things/1');
    inflight.next('gammalt');
    inflight.complete();
    expect(read(get())).toBe('nytt');
  });

  it('skiljer användare och garage åt', () => {
    const { cache, who } = setup('u1', 'g1');
    const make = source(() => 'x');
    const get = () => cache.get('k', make, { tags: ['inventory/things'] });
    read(get());
    who.garage = 'g2';
    read(get());
    who.user = 'u2';
    read(get());
    expect(make).toHaveBeenCalledTimes(3);
  });

  it('berättar om varje ändring, utan frågetecken', () => {
    const { cache } = setup();
    const seen: string[] = [];
    cache.writes$.subscribe((p) => seen.push(p));
    cache.wrote('inventory/sales-cards/1');
    expect(seen).toEqual(['inventory/sales-cards/1']);
    expect(pathOf(`${environment.apiUrl}/inventory/seller?x=1`)).toBe('inventory/seller');
  });
});

describe('ApiCache med de riktiga tjänsterna', () => {
  it('skapas utan cirkel: Auth använder AxleApi, som använder cachen', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([])] });
    // NG0200 om cachen injicerar Auth direkt.
    expect(() => TestBed.inject(Auth)).not.toThrow();
    expect(TestBed.inject(AxleApi)).toBeTruthy();
    expect(TestBed.inject(ApiCache)).toBeTruthy();
  });
});
