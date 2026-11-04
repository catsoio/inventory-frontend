import type { ServicePrice } from '../../core/models';
import { campaignNote, priceText, problems, toE164, type RequestDraft } from './booking-form';

const window = { from: '2026-11-05', to: '2027-01-03' };

const ok: RequestDraft = {
  serviceId: 'hjulbyte',
  hasCar: true,
  name: 'Anna Svensson',
  phone: '070-123 45 67',
  email: '',
  day: '2026-11-12',
  part: 'morning',
  consent: true,
};

const price = (over: Partial<ServicePrice> = {}): ServicePrice => ({
  unit: 'vehicle',
  quantity: 1,
  unitPrice: 35000,
  listUnitPrice: 35000,
  total: 35000,
  campaign: null,
  basis: 'rule',
  ...over,
});

describe('toE164', () => {
  it('gör ett svenskt mobilnummer till internationellt format', () => {
    expect(toE164('070-123 45 67')).toBe('+46701234567');
    expect(toE164('0046 70 123 45 67')).toBe('+46701234567');
    expect(toE164('+46 70 123 45 67')).toBe('+46701234567');
  });

  it('nekar fasta nummer, för korta nummer och strunt', () => {
    expect(toE164('08-123 456')).toBeNull();
    expect(toE164('0701')).toBeNull();
    expect(toE164('abc')).toBeNull();
    expect(toE164('')).toBeNull();
  });
});

describe('problems', () => {
  it('är tom när allt är ifyllt', () => {
    expect(problems(ok, window)).toEqual([]);
  });

  it('säger vad som saknas, med texter till kunden', () => {
    expect(
      problems(
        {
          ...ok,
          serviceId: null,
          hasCar: false,
          name: ' ',
          phone: '123',
          day: '',
          part: '',
          consent: false,
        },
        window,
      ),
    ).toHaveLength(7);
    expect(problems({ ...ok, name: 'A' }, window)).toEqual(['Skriv ditt namn.']);
    expect(problems({ ...ok, phone: '08-123 456' }, window)).toEqual([
      'Skriv ett mobilnummer, så vi kan nå dig.',
    ]);
  });

  it('godtar dagarna i fönstret, båda ändar med, och inget annat', () => {
    expect(problems({ ...ok, day: '2026-11-05' }, window)).toEqual([]);
    expect(problems({ ...ok, day: '2027-01-03' }, window)).toEqual([]);
    expect(problems({ ...ok, day: '2026-11-04' }, window)).toEqual([
      'Välj en dag som går att boka.',
    ]);
    expect(problems({ ...ok, day: '2027-01-04' }, window)).toEqual([
      'Välj en dag som går att boka.',
    ]);
  });

  it('kontrollerar e-posten bara när den är ifylld', () => {
    expect(problems({ ...ok, email: '' }, window)).toEqual([]);
    expect(problems({ ...ok, email: 'anna@example.se' }, window)).toEqual([]);
    expect(problems({ ...ok, email: 'anna@' }, window)).toEqual([
      'E-postadressen ser inte rätt ut.',
    ]);
  });
});

describe('priceText', () => {
  const from = { from: price({ total: 30000 }) };

  it('visar det exakta priset för en uppslagen bil', () => {
    expect(priceText(from, price(), true)).toBe('350 kr');
  });

  it('skriver antal hjul när priset är per hjul', () => {
    const p = price({ unit: 'wheel', quantity: 4, unitPrice: 12500, total: 50000 });
    expect(priceText(from, p, true)).toBe('500 kr (4 hjul à 125 kr)');
    // Ett hjul behöver ingen förklaring.
    expect(priceText(from, price({ unit: 'wheel', quantity: 1 }), true)).toBe('350 kr');
  });

  it('säger att priset lämnas på förfrågan när bilen inte har något', () => {
    expect(priceText(from, null, true)).toBe('Pris lämnas på förfrågan');
    expect(priceText({ from: null }, undefined, false)).toBe('Pris lämnas på förfrågan');
  });

  it('visar "från" utan bil, och tusentalen med blanksteg', () => {
    expect(priceText(from, undefined, false)).toBe('från 300 kr');
    expect(priceText({ from: price({ total: 123400 }) }, undefined, false)).toBe('från 1 234 kr');
  });
});

describe('campaignNote', () => {
  it('nämner kampanjen med slutdatum', () => {
    expect(campaignNote(price({ campaign: { label: 'Höstkampanj', to: '2026-12-31' } }))).toBe(
      'Höstkampanj till 2026-12-31',
    );
    expect(campaignNote(price({ campaign: { label: null, to: null } }))).toBe('Kampanj');
  });

  it('är tom utan kampanj', () => {
    expect(campaignNote(price())).toBeNull();
    expect(campaignNote(null)).toBeNull();
  });
});
