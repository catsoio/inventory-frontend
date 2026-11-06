import { totalsOf } from './vat';

describe('vinstmarginalbeskattning (VMB)', () => {
  const car = { quantity: 1, unitPrice: 4_000_000, margin: { purchase: 2_000_000 } };

  it('tar moms bara på vinsten och visar den aldrig', () => {
    const t = totalsOf([car]);
    expect(t.total).toBe(4_000_000);
    expect(t.vat).toBe(0);
    expect(t.byRate).toEqual([]);
    expect(t.margin).toEqual({ sales: 4_000_000, purchase: 2_000_000, vat: 400_000 });
  });

  it('ger ingen moms vid förlust', () => {
    const t = totalsOf([{ ...car, unitPrice: 1_500_000 }]);
    expect(t.margin?.vat).toBe(0);
  });

  it('håller bilen och vanliga rader isär', () => {
    const t = totalsOf([car, { quantity: 1, unitPrice: 12_500 }]);
    expect(t.vat).toBe(2_500);
    expect(t.total).toBe(4_012_500);
  });
});
