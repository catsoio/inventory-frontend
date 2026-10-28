import { describe, expect, it } from 'vitest';
import { invoiceGap, missingSellerFields, sellerGap } from './invoice-gap';

const anna = {
  id: 'c1',
  type: 'private' as const,
  name: 'Anna Lindqvist',
  orgNo: null,
  address: null,
  postalCode: null,
  city: null,
};

describe('invoiceGap', () => {
  it('sends a private customer without address to the customer card, address field marked', () => {
    const g = invoiceGap(anna)!;
    expect(g.text).toContain('Anna Lindqvist saknar adress');
    expect(g.fixes[0]).toMatchObject({
      link: ['/customers', 'c1'],
      queryParams: { focus: 'address' },
    });
  });

  it('marks the org number first for a company that lacks it', () => {
    const g = invoiceGap({ ...anna, type: 'company', name: 'Taxi AB' })!;
    expect(g.fixes[0].queryParams).toEqual({ focus: 'orgNo' });
    const g2 = invoiceGap({ ...anna, type: 'company', orgNo: '556123-4567' })!;
    expect(g2.fixes[0].queryParams).toEqual({ focus: 'address' });
  });

  it('is silent when nothing is missing, and with no customer', () => {
    expect(
      invoiceGap({ ...anna, address: 'Vägen 1', postalCode: '123 45', city: 'Solna' }),
    ).toBeNull();
    expect(invoiceGap(null)).toBeNull();
  });
});

describe('sellerGap', () => {
  const empty = { name: '', orgNo: '', vatNumber: null, address: '', postalCode: '', city: '' };

  it('lists what the workshop has not filled in, as the server does', () => {
    expect(missingSellerFields(empty)).toEqual([
      'företagsnamn',
      'organisationsnummer',
      'momsregistreringsnummer',
      'adress',
    ]);
  });

  it('gives the owner a way to the settings and others a name to ask', () => {
    let opened = 0;
    const owner = sellerGap(empty, true, () => opened++)!;
    owner.fixes[0].click!();
    expect(opened).toBe(1);
    const staff = sellerGap(empty, false, () => opened++)!;
    expect(staff.fixes).toEqual([]);
    expect(staff.text).toContain('Be ägaren');
  });

  it('is silent when the details are complete', () => {
    expect(
      sellerGap(
        { name: 'A', orgNo: '1', vatNumber: 'SE1', address: 'a', postalCode: '1', city: 'c' },
        true,
        () => {},
      ),
    ).toBeNull();
  });
});
