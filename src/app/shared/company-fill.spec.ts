import { FormControl, FormGroup } from '@angular/forms';
import type { CompanyInfo } from '../core/models';
import { COMPANY_OWNED, fillCompany, listFields } from './company-fill';

const volvo: CompanyInfo = {
  orgNo: '556012-5790',
  name: 'Aktiebolaget Volvo',
  form: 'Publikt aktiebolag',
  address: 'Amazonvägen 8',
  postalCode: '418 78',
  city: 'Göteborg',
  phone: '031660000',
  email: null,
  vatNumber: 'SE556012579001',
  fTax: true,
  active: true,
  statusNote: null,
};

const customerForm = (over: Record<string, string> = {}): FormGroup =>
  new FormGroup<Record<string, FormControl>>({
    orgNo: new FormControl('5560125790'),
    name: new FormControl(''),
    vatNumber: new FormControl(''),
    address: new FormControl(''),
    postalCode: new FormControl(''),
    city: new FormControl(''),
    phone: new FormControl(''),
    email: new FormControl(''),
    ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, new FormControl(v)])),
  });

describe('fillCompany', () => {
  it('fyller tomma fält, markerar dem ändrade och rör inte det registret saknar', () => {
    const form = customerForm({ email: 'info@volvo.se' });
    const r = fillCompany(form, volvo, 'blank');

    expect(r.filled).toEqual(['name', 'vatNumber', 'address', 'postalCode', 'city', 'phone']);
    expect(r.differs).toEqual([]);
    expect(form.value).toMatchObject({
      name: 'Aktiebolaget Volvo',
      vatNumber: 'SE556012579001',
      address: 'Amazonvägen 8',
      postalCode: '418 78',
      city: 'Göteborg',
      phone: '031660000',
      email: 'info@volvo.se',
    });
    expect(form.get('name')!.dirty).toBe(true);
    expect(form.get('email')!.dirty).toBe(false);
  });

  it('lämnar det någon skrivit men säger att det skiljer sig', () => {
    const form = customerForm({ name: 'Volvo', address: 'Amazonvägen 8', phone: '031-66 00 00' });
    const r = fillCompany(form, volvo, 'blank');

    expect(r.differs).toEqual(['name']);
    expect(form.value.name).toBe('Volvo');
    // Samma adress och samma telefonnummer med annat skrivsätt är inte en skillnad.
    expect(r.filled).not.toContain('address');
    expect(r.filled).not.toContain('phone');
  });

  it('ersätter allt registret har ett värde för i läget all', () => {
    const form = customerForm({ name: 'Volvo', address: 'Gamla vägen 1', email: 'a@b.se' });
    const r = fillCompany(form, volvo, 'all');

    expect(r.differs).toEqual([]);
    expect(r.filled).toContain('name');
    expect(r.filled).toContain('address');
    expect(form.value.name).toBe('Aktiebolaget Volvo');
    expect(form.value.address).toBe('Amazonvägen 8');
    // Registret saknar e-post, så den som står kvar.
    expect(form.value.email).toBe('a@b.se');
  });

  it('ersätter de egna fälten även i läget blank men lämnar telefon och e-post som skrivits', () => {
    const form = customerForm({
      name: 'Förra bolaget AB',
      address: 'Gamla vägen 1',
      phone: '070-111 22 33',
    });
    const r = fillCompany(form, volvo, 'blank', COMPANY_OWNED);

    expect(form.value.name).toBe('Aktiebolaget Volvo');
    expect(form.value.address).toBe('Amazonvägen 8');
    expect(form.value.phone).toBe('070-111 22 33');
    expect(r.differs).toEqual(['phone']);
  });

  it('låter registrets F-skatt gälla även om rutan redan är satt', () => {
    const form = customerForm();
    form.addControl('fTax', new FormControl(true));
    const r = fillCompany(form, { ...volvo, fTax: false }, 'blank');
    expect(r.filled).toContain('fTax');
    expect(form.value.fTax).toBe(false);

    const unknown = fillCompany(form, { ...volvo, fTax: null }, 'blank');
    expect(unknown.filled).not.toContain('fTax');
    expect(form.value.fTax).toBe(false);
  });

  it('skriver organisationsnumret som det trycks, utan att räknas som ifyllt', () => {
    const form = customerForm();
    const r = fillCompany(form, volvo, 'blank');
    expect(form.value.orgNo).toBe('556012-5790');
    expect(r.filled).not.toContain('orgNo' as never);
  });

  it('berör bara fält som finns i formuläret', () => {
    const form = new FormGroup({ orgNo: new FormControl('5560125790'), name: new FormControl('') });
    expect(fillCompany(form, volvo, 'blank').filled).toEqual(['name']);
  });
});

describe('listFields', () => {
  it('räknar upp på svenska', () => {
    expect(listFields([])).toBe('');
    expect(listFields(['city'])).toBe('ort');
    expect(listFields(['address', 'city', 'phone'])).toBe('adress, ort och telefon');
  });
});
