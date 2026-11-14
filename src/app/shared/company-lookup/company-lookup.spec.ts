import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { WorkshopApi } from '../../core/api/workshop-api';
import type { CompanyInfo, CompanyLookup } from '../../core/models';
import { CompanyLookupStatus } from './company-lookup';

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

const found: CompanyLookup = { status: 'found', company: volvo, problem: null };

function setup(
  answer: CompanyLookup,
  initial = '',
  lock = false,
  prefill: Record<string, string> = {},
) {
  const lookupCompany = vi.fn().mockReturnValue(of(answer));
  TestBed.configureTestingModule({
    imports: [CompanyLookupStatus],
    providers: [{ provide: WorkshopApi, useValue: { lookupCompany } }],
  });
  const form = new FormGroup({
    orgNo: new FormControl(initial),
    name: new FormControl(''),
    address: new FormControl(''),
    city: new FormControl(''),
    phone: new FormControl(''),
  });
  form.patchValue(prefill);
  const fixture = TestBed.createComponent(CompanyLookupStatus);
  fixture.componentRef.setInput('form', form);
  fixture.componentRef.setInput('lock', lock);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const type = (text: string) => {
    const ctrl = form.controls.orgNo;
    ctrl.markAsDirty();
    ctrl.setValue(text);
  };
  const settle = () => {
    vi.advanceTimersByTime(700);
    fixture.detectChanges();
  };
  return { form, fixture, el, lookupCompany, type, settle };
}

describe('CompanyLookupStatus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('slår upp ett komplett nummer som någon skrivit och fyller de tomma fälten', () => {
    const { form, el, lookupCompany, type, settle } = setup(found);
    form.controls.name.setValue('Mitt eget namn');

    type('5560125790');
    settle();

    expect(lookupCompany).toHaveBeenCalledTimes(1);
    expect(lookupCompany).toHaveBeenCalledWith('5560125790', false);
    expect(form.value.address).toBe('Amazonvägen 8');
    expect(form.value.city).toBe('Göteborg');
    // Det någon skrivit lämnas, och skillnaden erbjuds som en knapp.
    expect(form.value.name).toBe('Mitt eget namn');
    expect(el.textContent).toContain('Aktiebolaget Volvo');
    expect(el.textContent).toContain('Fyllde i adress, ort och telefon');
    expect(el.textContent).toContain('Registret har andra uppgifter för namn');
    expect(form.value.orgNo).toBe('556012-5790');
  });

  it('ersätter det som skrivits med registrets uppgifter på begäran', () => {
    const { form, fixture, el, type, settle } = setup(found);
    form.controls.name.setValue('Mitt eget namn');
    type('5560125790');
    settle();

    const replace = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Ersätt med registrets uppgifter'),
    );
    replace!.click();
    fixture.detectChanges();

    expect(form.value.name).toBe('Aktiebolaget Volvo');
    expect(el.textContent).not.toContain('Registret har andra uppgifter');
  });

  it('väntar tills man slutat skriva och slår inte upp ett ofullständigt nummer', () => {
    const { lookupCompany, type, settle } = setup(found);

    type('55601');
    settle();
    expect(lookupCompany).not.toHaveBeenCalled();

    type('5560125790');
    vi.advanceTimersByTime(300);
    type('556012-5790');
    settle();
    expect(lookupCompany).toHaveBeenCalledTimes(1);
  });

  it('slår inte upp ett nummer som bara lästs in i formuläret', () => {
    const { form, el, lookupCompany, settle } = setup(found, '556012-5790');

    form.controls.orgNo.setValue('556012-5790');
    settle();

    expect(lookupCompany).not.toHaveBeenCalled();
    // Men knappen finns, för ett nummer som redan står där.
    expect(el.textContent).toContain('Hämta uppgifter');
  });

  it('hämtar med knappen för ett nummer som redan står i formuläret', () => {
    const { form, fixture, el, lookupCompany } = setup(found, '556012-5790');

    el.querySelector('button')!.click();
    fixture.detectChanges();

    expect(lookupCompany).toHaveBeenCalledWith('556012-5790', false);
    expect(form.value.address).toBe('Amazonvägen 8');
  });

  it('visar ingenting så länge det inte finns något komplett nummer', () => {
    const { fixture, el } = setup(found);
    expect(el.classList.contains('hidden')).toBe(true);
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('säger det, och låter formuläret vara, när inget företag hittas', () => {
    const { form, el, type, settle } = setup({ status: 'not_found', company: null, problem: null });
    type('5599999991');
    settle();

    expect(el.textContent).toContain('Hittade inget företag med det numret');
    expect(form.value.address).toBe('');
  });

  it('varnar när bolaget inte är aktivt men fyller i ändå', () => {
    const bankrupt: CompanyLookup = {
      status: 'found',
      company: { ...volvo, active: false, statusNote: 'Konkurs avslutad' },
      problem: null,
    };
    const { form, el, type, settle } = setup(bankrupt);
    type('5560125790');
    settle();

    expect(el.textContent).toContain('Bolaget är inte aktivt: Konkurs avslutad.');
    expect(form.value.address).toBe('Amazonvägen 8');
  });

  it('säger till när kontrollsiffran inte stämmer', () => {
    const { el, type, settle } = setup({ status: 'invalid', company: null, problem: 'checksum' });
    type('8112189876');
    settle();

    expect(el.textContent).toContain('Kontrollsiffran stämmer inte');
  });

  it('stoppar aldrig formuläret när anropet fallerar', () => {
    const { form, el, type, lookupCompany, settle } = setup(found);
    lookupCompany.mockReturnValue(throwError(() => new Error('nere')));
    type('5560125790');
    settle();

    expect(el.textContent).toContain('Kunde inte hämta uppgifter just nu');
    expect(el.textContent).toContain('Försök igen');
    expect(form.value.address).toBe('');
  });

  describe('i ett nytt kort, där företagets egna fält är låsta', () => {
    const lockedSetup = (answer: CompanyLookup = found) => {
      const t = setup(answer, '', true);
      return { ...t, component: t.fixture.componentInstance };
    };

    it('förklarar låsningen och erbjuder "Fyll i för hand"', () => {
      const { el } = lockedSetup();
      expect(el.classList.contains('hidden')).toBe(false);
      expect(el.textContent).toContain('Företagets uppgifter fylls i av organisationsnumret.');
      expect(el.textContent).toContain('Fyll i för hand');
    });

    it('tömmer ett namn som fanns i fältet från början, så att inget låst fält saknar källa', () => {
      const { form } = setup(found, '', true, { name: 'Volvo från sökrutan', address: 'Gatan 1' });
      expect(form.value.name).toBe('');
      expect(form.value.address).toBe('');
    });

    it('ersätter de låsta fälten men lämnar telefonen som någon skrivit', () => {
      const { form, el, type, settle } = lockedSetup();
      form.controls.phone.setValue('070-111 22 33');
      type('5560125790');
      settle();

      expect(form.value.name).toBe('Aktiebolaget Volvo');
      expect(form.value.address).toBe('Amazonvägen 8');
      expect(form.value.phone).toBe('070-111 22 33');
      expect(el.textContent).toContain('Registret har andra uppgifter för telefon');
    });

    it('tömmer de låsta fälten när numret byts, så de aldrig hör till ett annat nummer', () => {
      const { form, type, settle } = lockedSetup();
      type('5560125790');
      settle();
      expect(form.value.name).toBe('Aktiebolaget Volvo');

      type('556999');
      expect(form.value.name).toBe('');
      expect(form.value.address).toBe('');
      expect(form.value.city).toBe('');
    });

    it('låser upp med "Fyll i för hand" och rör sedan inte det som skrivs', () => {
      const { form, fixture, el, component, type, settle } = lockedSetup({
        status: 'not_found',
        company: null,
        problem: null,
      });
      type('5599999991');
      settle();
      expect(el.textContent).toContain('Hittade inget företag med det numret.');

      const manual = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Fyll i för hand'),
      );
      manual!.click();
      fixture.detectChanges();
      expect(component.manual()).toBe(true);

      form.controls.name.setValue('Utländska Bolaget Ltd');
      type('5599999990');
      expect(form.value.name).toBe('Utländska Bolaget Ltd');
    });

    it('erbjuder "Hämta uppgifter" när ett nummer redan står där', () => {
      const { fixture, el, lookupCompany, form } = setup(found, '556012-5790', true);
      const fetchButton = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Hämta uppgifter'),
      );
      fetchButton!.click();
      fixture.detectChanges();
      expect(lookupCompany).toHaveBeenCalledWith('556012-5790', false);
      expect(form.value.name).toBe('Aktiebolaget Volvo');
    });
  });
});
