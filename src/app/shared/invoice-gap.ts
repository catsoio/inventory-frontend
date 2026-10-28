import type { Customer, SellerDetails } from '../core/models';
import type { CalloutFix } from './callout/callout-fix';

/** Något som hindrar en faktura eller ett kvitto, och vart man går för att rätta det. */
export interface Gap {
  text: string;
  fixes: CalloutFix[];
}

type CustomerGapInput = Pick<
  Customer,
  'id' | 'type' | 'name' | 'orgNo' | 'address' | 'postalCode' | 'city'
>;

/**
 * Det som saknas hos kunden för att en faktura ska gå att skicka, annars null. En faktura ska nå
 * någon, så den nämner köparens namn och adress; ett företag identifieras dessutom med
 * organisationsnummer. Samma regler som servern (`InvoiceService.snapshot`), så att man får veta
 * innan man bokför. Ett kvitto kräver inget av detta. Länken öppnar kundkortet med det tomma fältet
 * markerat.
 */
export function invoiceGap(c: CustomerGapInput | null): Gap | null {
  if (!c) return null;
  const address = !!(c.address && c.postalCode && c.city);
  const company = c.type === 'company';
  if (company && !(c.orgNo && address)) {
    return {
      text: `${c.name} saknar organisationsnummer eller adress. Fyll i det på kundkortet innan du skriver en faktura.`,
      fixes: [customerFix(c.id, c.orgNo ? 'address' : 'orgNo')],
    };
  }
  if (!address) {
    return {
      text: `${c.name} saknar adress. Fyll i den på kundkortet innan du skriver en faktura, eller välj kvitto.`,
      fixes: [customerFix(c.id, 'address')],
    };
  }
  return null;
}

/** Länk till kundkortet; `focus` är fältet som ska få markören (`customer-card` läser det). */
export const customerFix = (customerId: string, focus: string): CalloutFix => ({
  label: 'Öppna kundkortet',
  icon: 'person',
  link: ['/customers', customerId],
  queryParams: { focus },
});

/** Verkstadens egna uppgifter som varje faktura och kvitto bär (samma lista som servern). */
export function missingSellerFields(
  s: Pick<SellerDetails, 'name' | 'orgNo' | 'vatNumber' | 'address' | 'postalCode' | 'city'>,
): string[] {
  const gaps: string[] = [];
  if (!s.name) gaps.push('företagsnamn');
  if (!s.orgNo) gaps.push('organisationsnummer');
  if (!s.vatNumber) gaps.push('momsregistreringsnummer');
  if (!s.address || !s.postalCode || !s.city) gaps.push('adress');
  return gaps;
}

/**
 * Det verkstaden själv måste fylla i innan något kan bokföras (Inställningar → Företaget).
 * Bara ägaren kan ändra dem: en annan får veta vem som ska göra det.
 */
export function sellerGap(
  s: Parameters<typeof missingSellerFields>[0] | null,
  isOwner: boolean,
  openSettings: () => void,
): Gap | null {
  if (!s) return null;
  const missing = missingSellerFields(s);
  if (!missing.length) return null;
  const list = missing.join(', ');
  return isOwner
    ? {
        text: `Verkstadens ${list} saknas. Fyll i det under Inställningar → Företaget innan du bokför en faktura eller ett kvitto.`,
        fixes: [{ label: 'Öppna Företaget', icon: 'settings', click: openSettings }],
      }
    : {
        text: `Verkstadens ${list} saknas. Be ägaren fylla i det under Inställningar → Företaget innan något kan bokföras.`,
        fixes: [],
      };
}
