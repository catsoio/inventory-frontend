import type { FormGroup } from '@angular/forms';
import type { CompanyInfo } from '../core/models';

/** De uppgifter ett företagsregister kan fylla i, i den ordning de räknas upp för användaren. */
export type CompanyField =
  | 'name'
  | 'vatNumber'
  | 'fTax'
  | 'address'
  | 'postalCode'
  | 'city'
  | 'phone'
  | 'email';

const FIELDS: CompanyField[] = [
  'name',
  'vatNumber',
  'fTax',
  'address',
  'postalCode',
  'city',
  'phone',
  'email',
];

/** Det som är företagets egna uppgifter och inte verkstadens: låses i ett nytt kundkort tills de hämtats. */
export const COMPANY_OWNED: CompanyField[] = ['name', 'vatNumber', 'address', 'postalCode', 'city'];

export const COMPANY_FIELD_LABELS: Record<CompanyField, string> = {
  name: 'namn',
  vatNumber: 'momsregistreringsnummer',
  fTax: 'F-skatt',
  address: 'adress',
  postalCode: 'postnummer',
  city: 'ort',
  phone: 'telefon',
  email: 'e-post',
};

export interface CompanyFill {
  /** Det som skrevs in i formuläret. */
  filled: CompanyField[];
  /** Det som redan stod ifyllt i formuläret på ett annat sätt än i registret och därför lämnades. */
  differs: CompanyField[];
}

/** Så lika att det är samma uppgift: stor eller liten bokstav och blanksteg spelar ingen roll, och ett telefonnummer jämförs på siffrorna. */
const same = (field: CompanyField, a: string, b: string): boolean =>
  field === 'phone'
    ? a.replace(/\D/g, '') === b.replace(/\D/g, '')
    : a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Fyller ett formulär med det registret vet om ett företag. Bara fält som finns i formuläret
 * berörs. `blank` skriver bara i tomma fält och lämnar det någon skrivit; `all` ersätter allt
 * registret har ett värde för. Fält i `owned` ersätts alltid, även i läget `blank` (för fält som
 * är låsta och därför aldrig skrivs av en människa). F-skatt är undantaget: det är en av/på-ruta som aldrig är tom och
 * står på dokumentet som ett påstående, så registrets svar gäller alltid. Organisationsnumret får
 * bara sitt tryckta skrivsätt (556012-5790).
 */
export function fillCompany(
  form: FormGroup,
  company: CompanyInfo,
  mode: 'blank' | 'all',
  owned: CompanyField[] = [],
): CompanyFill {
  const filled: CompanyField[] = [];
  const differs: CompanyField[] = [];

  for (const field of FIELDS) {
    const ctrl = form.get(field);
    const value = company[field];
    if (!ctrl || value === null || value === '') continue;

    if (typeof value === 'boolean') {
      if (ctrl.value !== value) {
        ctrl.setValue(value);
        ctrl.markAsDirty();
        filled.push(field);
      }
      continue;
    }
    const current = String(ctrl.value ?? '').trim();
    const replace = mode === 'all' || owned.includes(field);
    if (!current || (replace && !same(field, current, value))) {
      ctrl.setValue(value);
      ctrl.markAsDirty();
      filled.push(field);
    } else if (!same(field, current, value)) {
      differs.push(field);
    }
  }

  const org = form.get('orgNo');
  const typed = String(org?.value ?? '');
  if (org && typed !== company.orgNo && typed.replace(/\D/g, '') === company.orgNo.replace(/\D/g, '')) {
    org.setValue(company.orgNo, { emitEvent: false });
  }
  return { filled, differs };
}

/** "adress, ort och telefon" */
export function listFields(fields: CompanyField[]): string {
  const names = fields.map((f) => COMPANY_FIELD_LABELS[f]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} och ${names.at(-1)}` : (names[0] ?? '');
}
