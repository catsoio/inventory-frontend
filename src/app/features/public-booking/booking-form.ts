import type { PublicBookingService, ServicePrice, VehicleClass } from '../../core/models';

/**
 * Ett svenskt mobilnummer som det skrivs ("070-123 45 67") till E.164. Spegel av backendens
 * `services/phone.ts`; null när numret inte går att skicka SMS till.
 */
export const toE164 = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  let n = raw.replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = `+${n.slice(2)}`;
  if (n.startsWith('0')) n = `+46${n.slice(1)}`;
  if (!/^\+\d{8,15}$/.test(n)) return null;
  if (n.startsWith('+46') && !/^\+467\d{8}$/.test(n)) return null;
  return n;
};

export interface RequestDraft {
  serviceId: string | null;
  /** Bilen är uppslagen, eller en klass är vald. */
  hasCar: boolean;
  name: string;
  phone: string;
  email: string;
  day: string;
  part: string;
  consent: boolean;
}

/** Det som saknas innan förfrågan kan skickas, som texter till kunden; tomt = klart att skicka. */
export function problems(d: RequestDraft, window: { from: string; to: string }): string[] {
  const out: string[] = [];
  if (!d.hasCar) out.push('Skriv ditt regnummer, eller välj vilken sorts fordon det gäller.');
  if (!d.serviceId) out.push('Välj vad du vill ha gjort.');
  if (!d.day || d.day < window.from || d.day > window.to) {
    out.push('Välj en dag som går att boka.');
  }
  if (!d.part) out.push('Välj förmiddag eller eftermiddag.');
  if (d.name.trim().length < 2) out.push('Skriv ditt namn.');
  if (!toE164(d.phone)) out.push('Skriv ett mobilnummer, så vi kan nå dig.');
  if (d.email.trim() && !/^\S+@\S+\.\S+$/.test(d.email.trim())) {
    out.push('E-postadressen ser inte rätt ut.');
  }
  if (!d.consent) out.push('Godkänn att verkstaden får kontakta dig.');
  return out;
}

const kr = (ore: number): string =>
  `${String(Math.round(ore / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} kr`;

/**
 * Priset på ett kort. Med en uppslagen bil är det exakt (och per hjul när det är så åtgärden
 * prissätts); utan bil är det det lägsta ("från"). Saknas pris står det att det lämnas på förfrågan.
 */
export function priceText(
  service: Pick<PublicBookingService, 'from'>,
  forCar: ServicePrice | null | undefined,
  carKnown: boolean,
): string {
  if (carKnown) {
    if (!forCar) return 'Pris lämnas på förfrågan';
    return forCar.unit === 'wheel' && forCar.quantity > 1
      ? `${kr(forCar.total)} (${forCar.quantity} hjul à ${kr(forCar.unitPrice)})`
      : kr(forCar.total);
  }
  const from = service.from;
  if (!from) return 'Pris lämnas på förfrågan';
  return `från ${kr(from.total)}`;
}

/** "Kampanj till 31 dec" när priset är nedsatt; annars null. */
export function campaignNote(p: ServicePrice | null | undefined): string | null {
  if (!p?.campaign) return null;
  const label = p.campaign.label?.trim() || 'Kampanj';
  return p.campaign.to ? `${label} till ${p.campaign.to}` : label;
}

/** Fordonsklasserna kunden kan välja bland när bilen inte kan slås upp. */
export const PICKABLE_CLASSES: { value: VehicleClass; label: string }[] = [
  { value: 'passenger', label: 'Personbil' },
  { value: 'large', label: 'Större bil (skåp, stor SUV, pickup)' },
  { value: 'trailer', label: 'Husvagn eller släp' },
  { value: 'motorcycle', label: 'MC eller moped' },
  { value: 'heavy', label: 'Lastbil eller buss' },
];
