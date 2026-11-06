import { productOf, toExternal, toInternal } from './products';

describe('produktadresser', () => {
  it('lägger prefixet på Axles och Halls sidor och låter det gemensamma vara', () => {
    expect(toExternal('/workorders/3?tab=1')).toBe('/axle/workorders/3?tab=1');
    expect(toExternal('/dashboard')).toBe('/axle');
    expect(toExternal('/dealership/sales')).toBe('/hall/sales');
    expect(toExternal('/dealership')).toBe('/hall');
    expect(toExternal('/customers/1')).toBe('/customers/1');
    expect(toExternal('/finance')).toBe('/axle/finance');
    expect(toExternal('/sales')).toBe('/axle/sales');
    expect(toExternal('/dealership/finance')).toBe('/hall/finance');
    expect(toExternal('/suppliers')).toBe('/suppliers');
  });

  it('låter dokumenten och bokföringen vara gemensamma', () => {
    expect(toExternal('/sales/new?carId=1')).toBe('/sales/new?carId=1');
    expect(toExternal('/sales/abc')).toBe('/sales/abc');
    expect(toExternal('/finance/invoices')).toBe('/finance/invoices');
    expect(toExternal('/finance/receipts')).toBe('/finance/receipts');
    expect(toExternal('/bookkeeping')).toBe('/bookkeeping');
    expect(productOf('/sales/new')).toBeNull();
    expect(productOf('/finance/invoices?status=unpaid')).toBeNull();
    expect(productOf('/bookkeeping')).toBeNull();
    // Listan och översikten är Axles.
    expect(productOf('/sales')).toBe('axle');
    expect(productOf('/finance')).toBe('axle');
  });

  it('tar bort det igen', () => {
    expect(toInternal('/axle/workorders/3?tab=1')).toBe('/workorders/3?tab=1');
    expect(toInternal('/axle')).toBe('/dashboard');
    expect(toInternal('/hall')).toBe('/dealership');
    expect(toInternal('/hall/site')).toBe('/dealership/site');
    expect(toInternal('/hall/finance')).toBe('/dealership/finance');
    expect(toInternal('/axle/finance/receipts')).toBe('/finance/receipts');
    expect(toInternal('/finance/receipts')).toBe('/finance/receipts');
    expect(toInternal('/customers')).toBe('/customers');
    expect(toInternal('/q/abc')).toBe('/q/abc');
  });

  it('är varandras motsatser', () => {
    for (const u of [
      '/dashboard',
      '/inventory/ART-1',
      '/dealership/cars/new',
      '/vehicles',
      '/finance',
      '/finance/invoices',
      '/sales/new',
      '/',
    ]) {
      expect(toInternal(toExternal(u))).toBe(u);
    }
  });

  it('vet vilken produkt en sida hör till', () => {
    expect(productOf('/storage')).toBe('axle');
    expect(productOf('/dealership/sales?x=1')).toBe('hall');
    expect(productOf('/customers')).toBeNull();
  });
});
