import type { Customer } from '../core/models';

/**
 * Det som saknas hos kunden för att en faktura ska gå att skicka, annars null. En faktura ska nå
 * någon, så den nämner köparens namn och adress; ett företag identifieras dessutom med
 * organisationsnummer. Samma regler som servern (`InvoiceService.snapshot`), så att man får veta
 * innan man bokför. Ett kvitto kräver inget av detta.
 */
export function invoiceGap(
  c: Pick<Customer, 'type' | 'name' | 'orgNo' | 'address' | 'postalCode' | 'city'> | null,
): string | null {
  if (!c) return null;
  const address = !!(c.address && c.postalCode && c.city);
  if (c.type === 'company' && !(c.orgNo && address)) {
    return `${c.name} saknar organisationsnummer eller adress. Fyll i det på kundkortet innan du skriver en faktura.`;
  }
  if (!address) {
    return `${c.name} saknar adress. Fyll i den på kundkortet innan du skriver en faktura, eller välj kvitto.`;
  }
  return null;
}
