import type { PriceRule, Vehicle } from './models';
import {
  campaignActive,
  fromPrice,
  pickRule,
  priceContextOf,
  priceOfService,
  priceTitle,
  rimDiameterOfCar,
  today,
  vehicleClassOfCar,
  type PricedService,
} from './service-pricing';

const rule = (over: Partial<PriceRule> = {}): PriceRule => ({
  vehicleClass: null,
  rimFrom: null,
  rimTo: null,
  unit: 'vehicle',
  quantity: 1,
  price: 40000,
  ...over,
});

const on = '2026-11-04';
const car = { vehicleClass: 'passenger' as const, rimDiameter: 16, on };
const service = (over: Partial<PricedService> = {}): PricedService => ({
  priceFrom: null,
  ...over,
});

// Samma fall som backendens `service-pricing.spec.ts`: de två ska räkna likadant.
describe('pickRule', () => {
  it('tar regeln för bilens klass och en storlek inom bandet', () => {
    const rules = [
      rule({ vehicleClass: 'passenger', rimTo: 16, price: 40000 }),
      rule({ vehicleClass: 'passenger', rimFrom: 17, rimTo: 18, price: 50000 }),
      rule({ vehicleClass: 'passenger', rimFrom: 19, price: 60000 }),
    ];
    expect(pickRule(rules, { vehicleClass: 'passenger', rimDiameter: 16 })?.price).toBe(40000);
    expect(pickRule(rules, { vehicleClass: 'passenger', rimDiameter: 18 })?.price).toBe(50000);
    expect(pickRule(rules, { vehicleClass: 'passenger', rimDiameter: 21 })?.price).toBe(60000);
  });

  it('föredrar klass och band framför en regel för alla, och den första av två lika', () => {
    const rules = [
      rule({ price: 30000 }),
      rule({ vehicleClass: 'passenger', price: 40000 }),
      rule({ vehicleClass: 'passenger', rimTo: 17, price: 45000 }),
    ];
    expect(pickRule(rules, car)?.price).toBe(45000);
    expect(pickRule(rules, { vehicleClass: 'trailer', rimDiameter: 13 })?.price).toBe(30000);
    expect(pickRule([rule({ price: 1 }), rule({ price: 2 })], car)?.price).toBe(1);
  });

  it('hoppar över ett band när storleken är okänd och en klass bilen inte har', () => {
    const rules = [
      rule({ vehicleClass: 'passenger', rimTo: 16, price: 1 }),
      rule({ vehicleClass: 'trailer', price: 2 }),
    ];
    expect(pickRule(rules, { vehicleClass: 'passenger', rimDiameter: null })).toBeNull();
    expect(pickRule(rules, { vehicleClass: 'large', rimDiameter: 16 })).toBeNull();
  });
});

describe('priceOfService', () => {
  it('prissätter en punktering per däck och en husvagn per hjul', () => {
    const s = service({
      prices: [
        rule({ vehicleClass: 'passenger', unit: 'wheel', quantity: 1, price: 25000 }),
        rule({ vehicleClass: 'trailer', unit: 'wheel', quantity: 2, price: 15000 }),
      ],
    });
    expect(priceOfService(s, { ...car, vehicleClass: 'passenger' })).toMatchObject({
      unit: 'wheel',
      quantity: 1,
      total: 25000,
    });
    expect(priceOfService(s, { ...car, vehicleClass: 'trailer' })).toMatchObject({
      quantity: 2,
      total: 30000,
    });
  });

  it('ger inget pris för en klass åtgärden inte är prissatt för', () => {
    const s = service({ prices: [rule({ vehicleClass: 'passenger' })] });
    expect(priceOfService(s, { ...car, vehicleClass: 'motorcycle' })).toBeNull();
    expect(priceOfService(s, { ...car, vehicleClass: null })).toBeNull();
  });

  it('tar åtgärdens eget pris utan regler: mallens arbetsrad först, sedan priceFrom', () => {
    const withLines = service({
      priceFrom: 99900,
      lines: [
        {
          type: 'part',
          unitPrice: 5000,
          code: null,
          description: '',
          articleId: null,
          quantity: 1,
          minutes: null,
        },
        {
          type: 'labour',
          unitPrice: 35000,
          code: null,
          description: '',
          articleId: null,
          quantity: 1,
          minutes: null,
        },
      ],
    });
    expect(priceOfService(withLines, car)).toMatchObject({ unitPrice: 35000, basis: 'service' });
    expect(priceOfService(service({ priceFrom: 99900 }), car)?.unitPrice).toBe(99900);
    expect(priceOfService(service(), car)).toBeNull();
  });

  describe('kampanj', () => {
    const base = service({ prices: [rule({ price: 39900 })] });

    it('ersätter priset medan den gäller och säger det', () => {
      const s = {
        ...base,
        campaign: {
          price: 24900,
          percent: null,
          from: '2026-10-01',
          to: '2026-12-31',
          label: 'Öppningserbjudande',
        },
      };
      expect(priceOfService(s, car)).toMatchObject({
        unitPrice: 24900,
        listUnitPrice: 39900,
        campaign: { label: 'Öppningserbjudande', to: '2026-12-31' },
      });
    });

    it('tar en procent av i hela kronor', () => {
      const s = {
        ...base,
        campaign: { price: null, percent: 15, from: null, to: null, label: null },
      };
      expect(priceOfService(s, car)?.unitPrice).toBe(33900);
    });

    it('gäller bara mellan datumen, båda dagarna med, och höjer aldrig ett pris', () => {
      const s = {
        ...base,
        campaign: { price: 100, percent: null, from: '2026-11-05', to: '2026-11-10', label: null },
      };
      expect(priceOfService(s, { ...car, on: '2026-11-04' })?.unitPrice).toBe(39900);
      expect(priceOfService(s, { ...car, on: '2026-11-05' })?.unitPrice).toBe(100);
      expect(priceOfService(s, { ...car, on: '2026-11-10' })?.unitPrice).toBe(100);
      expect(priceOfService(s, { ...car, on: '2026-11-11' })?.unitPrice).toBe(39900);
      const raising = {
        ...base,
        campaign: { price: 99900, percent: null, from: null, to: null, label: null },
      };
      expect(priceOfService(raising, car)).toMatchObject({ unitPrice: 39900, campaign: null });
    });

    it('är ingen kampanj utan pris eller procent', () => {
      expect(
        campaignActive({ price: null, percent: null, from: null, to: null, label: null }, on),
      ).toBe(false);
      expect(campaignActive(null, on)).toBe(false);
    });
  });
});

describe('fromPrice', () => {
  it('är den lägsta summan över reglerna, med ett pris per hjul räknat på vanligt antal hjul', () => {
    const s = service({
      prices: [
        rule({ vehicleClass: 'passenger', unit: 'vehicle', price: 60000 }),
        rule({ vehicleClass: 'passenger', unit: 'wheel', quantity: 4, price: 12000 }),
        rule({ vehicleClass: 'trailer', unit: 'wheel', quantity: 2, price: 20000 }),
      ],
    });
    expect(fromPrice(s, on)).toMatchObject({ total: 40000, unit: 'wheel', quantity: 2 });
  });

  it('faller tillbaka på åtgärdens eget pris, och är null utan något', () => {
    expect(fromPrice(service({ priceFrom: 35000 }), on)?.total).toBe(35000);
    expect(fromPrice(service(), on)).toBeNull();
  });
});

describe('vad en bil ger prisberäkningen', () => {
  const tyre = (diameter: number) => ({
    raw: '',
    width: null,
    profile: null,
    diameter,
    loadIndex: null,
    speedIndex: null,
  });
  const rim = (diameter: number) => ({ raw: '', width: null, diameter, offset: null });

  it('tar den största fälgen fram eller bak', () => {
    const tech = {
      axles: [
        { tyre: tyre(17), rim: rim(17), maxLoadKg: null, trackMm: null },
        { tyre: tyre(19), rim: rim(19), maxLoadKg: null, trackMm: null },
      ],
    } as never;
    expect(rimDiameterOfCar({ tech })).toBe(19);
  });

  it('läser de sparade måtten på en bil utan registrets fulla post', () => {
    expect(rimDiameterOfCar({ rimSize: '6.5Jx17 ET40' })).toBe(17);
    expect(rimDiameterOfCar({ rimSize: '16x7J ET45' })).toBe(16);
    expect(rimDiameterOfCar({ tyreSize: '195/65 R15 91H' })).toBe(15);
    expect(rimDiameterOfCar({})).toBeNull();
  });

  it('låter en klass satt för hand gå före registrets', () => {
    const tech = { vehicleClass: 'passenger' } as never;
    expect(vehicleClassOfCar({ tech })).toBe('passenger');
    expect(vehicleClassOfCar({ tech, classOverride: 'large' })).toBe('large');
    expect(vehicleClassOfCar(null)).toBeNull();
    expect(priceContextOf(null, on)).toEqual({ vehicleClass: null, rimDiameter: null, on });
    const v = { classOverride: 'trailer', rimSize: '5Jx13' } as Vehicle;
    expect(priceContextOf(v, on)).toEqual({ vehicleClass: 'trailer', rimDiameter: 13, on });
  });
});

describe('priceTitle', () => {
  it('skriver antal hjul när priset är per hjul', () => {
    const p = priceOfService(
      service({ prices: [rule({ unit: 'wheel', quantity: 2, price: 100 })] }),
      car,
    );
    expect(priceTitle('Husvagn, däckskifte', p)).toBe('Husvagn, däckskifte (2 hjul)');
    expect(priceTitle('Däckbyte', priceOfService(service({ priceFrom: 100 }), car))).toBe(
      'Däckbyte',
    );
    expect(priceTitle('Däckbyte', null)).toBe('Däckbyte');
  });
});

describe('today', () => {
  it('är dagen i Stockholm som YYYY-MM-DD, också strax efter midnatt', () => {
    // 23:30 UTC är redan nästa dag i Stockholm (vintertid, UTC+1).
    expect(today(new Date('2026-11-04T23:30:00Z'))).toBe('2026-11-05');
    expect(today(new Date('2026-11-04T12:00:00Z'))).toBe('2026-11-04');
  });
});
