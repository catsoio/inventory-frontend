import type { CarListing } from '../core/models';
import {
  ageBand,
  carTodo,
  daysInStock,
  longestInStock,
  recentInquiries,
  soldBetween,
  stockFigures,
} from './car-stock';

const TODAY = new Date(2026, 10, 6); // 6 nov 2026

const car = (over: Partial<CarListing> = {}): CarListing =>
  ({
    id: 'c',
    regNo: 'ABC123',
    heading: 'Volvo V70',
    status: 'active',
    inquiries: [],
    purchase: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    soldAt: null,
    inspectionDue: null,
    economy: { totalCost: null },
    ...over,
  }) as CarListing;

const bought = (date: string, over: Partial<CarListing> = {}) =>
  car({
    purchase: { price: 100_000, vatRate: 0, date, seller: 'Anna', sellerId: '811218-9876' },
    ...over,
  });

describe('bilarnas tid i lager', () => {
  it('räknar kalenderdagar från inköpsdagen, annars från dagen bilen lades in', () => {
    expect(daysInStock(bought('2026-10-07'), TODAY)).toBe(30);
    expect(daysInStock(car({ createdAt: '2026-11-01T10:00:00.000Z' }), TODAY)).toBe(5);
    // Aldrig negativt, även om inköpsdatumet ligger fram i tiden.
    expect(daysInStock(bought('2026-12-01'), TODAY)).toBe(0);
  });

  it('räknar en såld bil till dagen den såldes', () => {
    const sold = bought('2026-09-01', { status: 'sold', soldAt: '2026-09-21' });
    expect(daysInStock(sold, TODAY)).toBe(20);
  });

  it('delar in åldern i fyra steg', () => {
    expect(ageBand(0)).toBe('fresh');
    expect(ageBand(29)).toBe('fresh');
    expect(ageBand(30)).toBe('normal');
    expect(ageBand(60)).toBe('old');
    expect(ageBand(89)).toBe('old');
    expect(ageBand(90)).toBe('stale');
  });
});

describe('lagret', () => {
  it('summerar bilar, bundet kapital och snittid, utan sålda bilar', () => {
    const cars = [
      bought('2026-11-01', { status: 'draft', economy: { totalCost: 100_000 } as never }),
      bought('2026-10-07', { status: 'active', economy: { totalCost: 250_000 } as never }),
      bought('2026-08-08', { status: 'reserved', economy: { totalCost: 50_000 } as never }),
      bought('2026-01-01', { status: 'sold', soldAt: '2026-02-01' }),
    ];
    const f = stockFigures(cars, TODAY);
    expect(f.count).toBe(3);
    expect(f.bought).toBe(1);
    expect(f.forSale).toBe(1);
    expect(f.reserved).toBe(1);
    expect(f.capital).toBe(400_000);
    // 5, 30 och 90 dagar.
    expect(f.avgDays).toBe(42);
    expect(f.bands).toEqual({ fresh: 1, normal: 1, old: 0, stale: 1 });
  });

  it('har inget snitt utan bilar', () => {
    expect(stockFigures([], TODAY).avgDays).toBeNull();
  });

  it('lyfter fram bilarna som stått längst', () => {
    const cars = [
      bought('2026-11-01', { id: 'a' }),
      bought('2026-06-01', { id: 'b' }),
      bought('2026-01-01', { id: 'sold', status: 'sold', soldAt: '2026-01-10' }),
    ];
    expect(longestInStock(cars, TODAY).map((x) => x.car.id)).toEqual(['b', 'a']);
  });

  it('tar frågor från senaste veckan, nyast först', () => {
    const q = (at: string) => ({ name: 'Eva', phone: '0701', email: null, message: null, at });
    const cars = [
      car({ id: 'a', inquiries: [q('2026-11-05T09:00:00.000Z'), q('2026-10-20T09:00:00.000Z')] }),
      car({ id: 'b', inquiries: [q('2026-11-06T08:00:00.000Z')] }),
    ];
    const r = recentInquiries(cars, TODAY, 7);
    expect(r.map((x) => x.car.id)).toEqual(['b', 'a']);
  });

  it('plockar sålda bilar i perioden', () => {
    const cars = [
      car({ id: 'a', status: 'sold', soldAt: '2026-11-03' }),
      car({ id: 'b', status: 'sold', soldAt: '2026-10-31' }),
      car({ id: 'c', status: 'active' }),
    ];
    expect(soldBetween(cars, '2026-11-01', '2026-11-30').map((c) => c.id)).toEqual(['a']);
  });
});

describe('det som väntar i bilarna', () => {
  it('räknar fast bilar, säljare som saknas och besiktningar', () => {
    const cars = [
      // Står 100 dagar.
      bought('2026-07-28', { id: 'old' }),
      // Köpt utan moms, ingen säljare angiven.
      car({
        id: 'vmb',
        purchase: { price: 1, vatRate: 0, date: '2026-11-01', seller: null, sellerId: null },
      }),
      // Besiktningen har gått ut.
      bought('2026-11-02', { id: 'insp', inspectionDue: '2026-10-01' }),
      // Inköpt för 20 dagar sedan men aldrig utlagd.
      bought('2026-10-17', { id: 'draft', status: 'draft' }),
      // Såld bil räknas inte.
      bought('2026-01-01', { status: 'sold', soldAt: '2026-02-01', inspectionDue: '2026-01-01' }),
    ];
    expect(carTodo(cars, TODAY)).toEqual({
      sellersMissing: 1,
      idle: 1,
      inspectionSoon: 1,
      unlisted: 1,
    });
  });
});
