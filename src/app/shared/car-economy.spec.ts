import { CarBooks, carEconomy } from './car-economy';

const kr = (n: number) => n * 100;

const books = (over: Partial<CarBooks> = {}): CarBooks => ({
  price: null,
  soldPrice: null,
  status: 'active',
  purchase: null,
  costs: [],
  vatScheme: 'margin',
  ...over,
});

const bought = (price: number, vatRate = 0) => ({
  price,
  vatRate,
  date: null,
  seller: null,
  sellerId: null,
});

describe('carEconomy (samma tal som backend)', () => {
  it('VMB: moms på marginalen, kostnaderna sänker den inte men deras moms dras av', () => {
    const e = carEconomy(
      books({
        price: kr(40000),
        purchase: bought(kr(20000)),
        costs: [{ id: 'a', label: 'Vinterdäck', amount: kr(4000), vatRate: 25 }],
      }),
    );
    expect(e.outputVat).toBe(kr(4000));
    expect(e.inputVat).toBe(kr(800));
    expect(e.vatToPay).toBe(kr(3200));
    expect(e.profit).toBe(kr(12800));
    expect(e.marginPercent).toBe(35.6);
    expect(e.markupPercent).toBe(55.2);
  });

  it('VMB: ingen moms och ingen avräkning vid förlust', () => {
    const e = carEconomy(books({ price: kr(40000), purchase: bought(kr(50000)) }));
    expect(e.outputVat).toBe(0);
    expect(e.profit).toBe(-kr(10000));
  });

  it('vanlig moms: 25 % på hela priset, avdrag för all moms som betalats in', () => {
    const e = carEconomy(
      books({
        vatScheme: 'standard',
        price: kr(100000),
        purchase: bought(kr(60000), 25),
        costs: [{ id: 'a', label: 'Verkstad', amount: kr(10000), vatRate: 25 }],
      }),
    );
    expect(e.outputVat).toBe(kr(20000));
    expect(e.vatToPay).toBe(kr(6000));
    expect(e.profit).toBe(kr(24000));
  });

  it('räknar på försäljningspriset bara när bilen är såld', () => {
    const deal = books({ price: kr(40000), soldPrice: kr(35000), purchase: bought(kr(20000)) });
    expect(carEconomy(deal).basis).toBe('asking');
    expect(carEconomy({ ...deal, status: 'sold' }).basis).toBe('sold');
  });

  it('har ingen vinst förrän inköpet och priset finns', () => {
    expect(carEconomy(books({ price: kr(40000) })).profit).toBeNull();
    expect(carEconomy(books({ purchase: bought(kr(20000)) })).profit).toBeNull();
  });
});
