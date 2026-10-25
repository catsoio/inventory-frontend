import { isoWeek, startOfWeek, weekKey, weekRange } from './dates';
import {
  overdueList,
  pickupForecast,
  seasonMix,
  shelves,
  topSizes,
  treadBuckets,
  wornSets,
} from './hotel';
import { byBrand, byRim, bySize, dotAges, dotDate, seasonUnits, toOrder } from './stock';
import { monthlySeries, weeklySeries } from './sales';
import type { Article, GroupedReport, StorageDeposit } from '../models';

const iso = (d: Date) => d.toISOString();
// Måndag 26 oktober 2026, 10:15 (vecka 44).
const now = new Date(2026, 9, 26, 10, 15);

const deposit = (over: Partial<StorageDeposit> = {}): StorageDeposit =>
  ({
    id: 'x',
    status: 'stored',
    quantity: 4,
    overdue: false,
    expectedPickupAt: null,
    location: 'Däckhotellet · Hylla H-02',
    tyres: { season: 'winter', width: 205, profile: 55, rimDiameter: 16, sizeLabel: '205/55 R16' },
    ...over,
  }) as StorageDeposit;

const article = (over: Partial<Article> = {}): Article =>
  ({
    active: true,
    brand: 'Nokian',
    quantity: 4,
    reorderLevel: 4,
    stockLevel: 'in_stock',
    label: 'x',
    tyre: { width: 205, profile: 55, rimDiameter: 16, season: 'winter', studded: false },
    ...over,
  }) as Article;

describe('datum', () => {
  it('räknar ISO-veckor, även över årsskiften', () => {
    expect(isoWeek(new Date(2026, 9, 26))).toEqual({ year: 2026, week: 44 });
    expect(isoWeek(new Date(2026, 0, 1))).toEqual({ year: 2026, week: 1 });
    expect(isoWeek(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(new Date(2024, 11, 30))).toEqual({ year: 2025, week: 1 });
  });

  it('ger samma veckonyckel som rapporten (2026-W44)', () => {
    expect(weekKey(new Date(2026, 9, 28))).toBe('2026-W44');
  });

  it('börjar veckan på måndag', () => {
    expect(startOfWeek(new Date(2026, 9, 25)).getDate()).toBe(19); // söndag
    expect(startOfWeek(new Date(2026, 9, 26)).getDate()).toBe(26); // måndag
  });

  it('skriver veckans spann', () => {
    expect(weekRange(new Date(2026, 9, 26))).toBe('26 okt–1 nov');
  });
});

describe('däckhotell', () => {
  it('delar hämtprognosen i försenade, veckor och senare', () => {
    const list = [
      deposit({ overdue: true, expectedPickupAt: iso(new Date(2026, 9, 10)) }),
      deposit({ expectedPickupAt: iso(new Date(2026, 9, 28)) }), // denna vecka
      deposit({ expectedPickupAt: iso(new Date(2026, 10, 3)) }), // v. 45
      deposit({ expectedPickupAt: iso(new Date(2026, 10, 4)) }), // v. 45
      deposit({ expectedPickupAt: iso(new Date(2027, 3, 1)) }), // senare
      deposit({ expectedPickupAt: null }), // saknar datum
      deposit({ status: 'picked_up', expectedPickupAt: iso(new Date(2026, 9, 29)) }), // räknas inte
    ];
    const f = pickupForecast(list, now, 10);
    expect(f.buckets).toHaveLength(12);
    expect(f.buckets[0].sets).toBe(1);
    expect(f.buckets[1].label).toBe('v. 44');
    expect(f.buckets[1].sets).toBe(1);
    expect(f.buckets[2].sets).toBe(2);
    expect(f.buckets[11].sets).toBe(1);
    expect(f.noDate).toBe(1);
    expect(f.buckets.reduce((t, b) => t + b.sets, 0) + f.noDate).toBe(6);
  });

  it('räknar säsong och bara fälgar', () => {
    const mix = seasonMix([
      deposit(),
      deposit({ tyres: { season: 'summer' } as StorageDeposit['tyres'] }),
      deposit({ tyres: null }),
      deposit({ status: 'picked_up' }),
    ]);
    expect(mix.map((m) => m.sets)).toEqual([1, 1, 0, 1]);
  });

  it('sorterar hyllor naturligt och tar med "Ingen plats"', () => {
    const list = shelves([
      deposit({ location: 'Däckhotellet · Hylla H-10' }),
      deposit({ location: 'Däckhotellet · Hylla H-02' }),
      deposit({ location: 'Däckhotellet · Hylla H-02' }),
      deposit({ location: null }),
    ]);
    expect(list.map((s) => [s.place, s.sets])).toEqual([
      ['Ingen plats', 1],
      ['Hylla H-02', 2],
      ['Hylla H-10', 1],
    ]);
  });

  it('listar vanligaste storlekarna', () => {
    const sizes = topSizes([
      deposit(),
      deposit(),
      deposit({
        tyres: {
          season: 'winter',
          width: 225,
          profile: 45,
          rimDiameter: 17,
        } as StorageDeposit['tyres'],
      }),
    ]);
    expect(sizes).toEqual([
      { label: '205/55 R16', sets: 2 },
      { label: '225/45 R17', sets: 1 },
    ]);
  });

  it('listar de som väntat längst först', () => {
    const od = overdueList(
      [
        deposit({ overdue: true, expectedPickupAt: iso(new Date(2026, 9, 20)) }),
        deposit({ overdue: true, expectedPickupAt: iso(new Date(2026, 9, 1)) }),
      ],
      now,
    );
    expect(od.map((o) => o.days)).toEqual([25, 6]);
  });
});

describe('lager', () => {
  const stock = [
    article(),
    article({ quantity: 2, stockLevel: 'low' }),
    article({
      quantity: 0,
      stockLevel: 'out',
      tyre: { width: 205, profile: 55, rimDiameter: 16, season: 'summer' } as Article['tyre'],
    }),
    article({
      brand: 'Michelin',
      tyre: {
        width: 225,
        profile: 45,
        rimDiameter: 17,
        season: 'winter',
        studded: true,
      } as Article['tyre'],
    }),
    article({ active: false }), // arkiverad räknas inte
    article({ tyre: null, quantity: 99 }), // inte ett däck
  ];

  it('summerar per storlek med brist och säsong', () => {
    const s = bySize(stock).find((x) => x.key === '205/55R16')!;
    expect(s).toMatchObject({ units: 6, articles: 3, low: 1, out: 1 });
    expect(s.bySeason).toEqual({ winter: 6, summer: 0, all_season: 0 });
  });

  it('summerar per fälg och räknar dubbade för sig', () => {
    const r = byRim(stock);
    expect(r.map((x) => x.rim)).toEqual([16, 17]);
    expect(r[1].studded).toBe(4);
    expect(seasonUnits(stock)).toEqual({ winter: 10, summer: 0, all_season: 0 });
  });

  it('viker ihop märkessvansen till Övriga', () => {
    expect(byBrand(stock, 7)).toEqual([
      { brand: 'Nokian', units: 6 },
      { brand: 'Michelin', units: 4 },
    ]);
    const many = Array.from({ length: 10 }, (_, i) =>
      article({ brand: `B${i}`, quantity: 10 - i }),
    );
    const folded = byBrand(many, 3);
    expect(folded).toHaveLength(4);
    expect(folded[3]).toEqual({ brand: 'Övriga', units: 7 + 6 + 5 + 4 + 3 + 2 + 1 });
  });

  it('ordnar det som ska beställas, slut först', () => {
    const order = toOrder(stock);
    expect(order.map((o) => o.article.quantity)).toEqual([0, 2]);
    expect(order[0].ratio).toBe(0);
  });
});

describe('försäljning', () => {
  it('fyller luckor i veckoserien med noll', () => {
    const report = {
      groups: [{ key: '2026-W44', soldRevenue: 500, purchasedCost: 200, soldUnits: 3 }],
    } as GroupedReport;
    const w = weeklySeries(report, now, 4);
    expect(w.labels).toEqual(['v. 41', 'v. 42', 'v. 43', 'v. 44']);
    expect(w.sold).toEqual([0, 0, 0, 500]);
    expect(w.bought).toEqual([0, 0, 0, 200]);
  });

  it('summerar dagsrapporten per kalendermånad', () => {
    const report = {
      groups: [
        { key: '2026-10-01', soldRevenue: 100, purchasedCost: 10, grossProfit: 40, soldUnits: 1 },
        { key: '2026-10-26', soldRevenue: 200, purchasedCost: 0, grossProfit: 80, soldUnits: 2 },
        { key: '2026-09-30', soldRevenue: 50, purchasedCost: 5, grossProfit: 20, soldUnits: 1 },
        { key: '2025-01-05', soldRevenue: 999, purchasedCost: 0, grossProfit: 0, soldUnits: 9 }, // utanför perioden
      ],
    } as GroupedReport;
    const m = monthlySeries(report, now, 3);
    expect(m.sold).toEqual([0, 50, 300]);
    expect(m.profit).toEqual([0, 20, 120]);
    expect(m.soldUnits).toEqual([0, 1, 3]);
  });
});

describe('sommartid', () => {
  it('lägger veckor rätt även när klockan ställs om (28 mars 2026)', () => {
    // Måndag 23 mars (före omställningen). Två veckor senare, måndag 6 april, är vecka 3 framåt.
    const march = new Date(2026, 2, 23, 10, 0);
    const f = pickupForecast(
      [deposit({ expectedPickupAt: iso(new Date(2026, 3, 6, 9, 0)) })],
      march,
      10,
    );
    expect(f.buckets.findIndex((b) => b.sets === 1)).toBe(3);
    expect(f.buckets[3].label).toBe('v. 15');
  });

  it('räknar dagar försenat utan att tappa en dag vid omställningen', () => {
    const od = overdueList(
      [deposit({ overdue: true, expectedPickupAt: iso(new Date(2026, 2, 27, 12, 0)) })],
      new Date(2026, 2, 30, 8, 0),
    );
    expect(od[0].days).toBe(3);
  });
});

describe('mönsterdjup', () => {
  const withTread = (mm: number | null) =>
    deposit({ tyres: { season: 'winter', treadDepthMm: mm } as StorageDeposit['tyres'] });

  it('delar däcken i steg och räknar de som inte mätts', () => {
    const b = treadBuckets([
      withTread(2.5),
      withTread(3),
      withTread(3.9),
      withTread(4),
      withTread(5.5),
      withTread(8),
      withTread(null),
      deposit({ tyres: null }), // bara fälgar räknas inte
      deposit({ status: 'picked_up' }),
    ]);
    expect(b.map((x) => [x.key, x.sets])).toEqual([
      ['under3', 1],
      ['from3', 2],
      ['from4', 2],
      ['over6', 1],
      ['unknown', 1],
    ]);
  });

  it('listar de slitnaste först, bara under gränsen', () => {
    const worn = wornSets([
      withTread(3.5),
      withTread(2),
      withTread(4),
      withTread(null),
      withTread(7),
    ]);
    expect(worn.map((w) => w.mm)).toEqual([2, 3.5]);
  });
});

describe('DOT och ålder', () => {
  it('läser vecka och år ur koden', () => {
    expect(dotDate('2523', now)).toEqual(new Date(2023, 0, 1 + 24 * 7));
    expect(dotDate('DOT 0120', now)).toEqual(new Date(2020, 0, 1));
    expect(dotDate('9923', now)).toBeNull(); // vecka 99 finns inte
    expect(dotDate('abc', now)).toBeNull();
    expect(dotDate(null, now)).toBeNull();
    expect(dotDate('1030', now)).toBeNull(); // 2030 är i framtiden
  });

  it('delar lagret efter däckens ålder', () => {
    const at = (dot: string | null, quantity: number) =>
      article({
        quantity,
        tyre: {
          width: 205,
          profile: 55,
          rimDiameter: 16,
          season: 'winter',
          dot,
        } as Article['tyre'],
      });
    const { buckets, unknownUnits } = dotAges(
      [
        at('2026', 4),
        at('0125', 2),
        at('2023', 3),
        at('1222', 1),
        at('0118', 5),
        at(null, 7),
        at('zzzz', 1),
      ],
      now,
    );
    // 2026 v.20 = 5 mån, 2025 v.1 = 21 mån, 2023 v.20 = 41 mån, 2022 v.12 och 2018 v.1 = över 4 år.
    expect(buckets.map((b) => b.units)).toEqual([4, 2, 0, 3, 6]);
    expect(unknownUnits).toBe(8);
  });
});
