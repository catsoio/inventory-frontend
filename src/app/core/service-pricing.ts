import type {
  PriceCampaign,
  PriceRule,
  ServicePrice,
  ServiceType,
  Vehicle,
  VehicleClass,
} from './models';

/**
 * Vad en åtgärd kostar för en bil. Spegel av backends `domain/tables/service-pricing.ts`:
 * ändra båda. Priser i öre inkl. moms.
 */

export interface PriceContext {
  /** Bilens klass; null när ingen bil är vald. */
  vehicleClass: VehicleClass | null;
  /** Största fälgen på bilen, tum; null när okänd. */
  rimDiameter: number | null;
  /** Dagens datum, YYYY-MM-DD. */
  on: string;
}

/** Delarna av en åtgärd som priset beror på. */
export type PricedService = Pick<ServiceType, 'priceFrom' | 'prices' | 'campaign' | 'lines'>;

/** Dagens datum i Stockholm, YYYY-MM-DD (svensk datumform oavsett appens språk). */
export const today = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(now);

export function campaignActive(
  c: PriceCampaign | null | undefined,
  on: string,
): c is PriceCampaign {
  if (!c || (c.price == null && c.percent == null)) return false;
  return (!c.from || c.from <= on) && (!c.to || on <= c.to);
}

/** Kampanjen höjer aldrig ett pris; en procent avrundas till hela kronor. */
function campaignPrice(list: number, c: PriceCampaign): number {
  const cut =
    c.price != null ? c.price : Math.round((list * (1 - (c.percent ?? 0) / 100)) / 100) * 100;
  return Math.min(list, cut);
}

const banded = (r: PriceRule) => r.rimFrom != null || r.rimTo != null;
const specificity = (r: PriceRule) => (r.vehicleClass ? 2 : 0) + (banded(r) ? 1 : 0);

/** Regeln som passar bilen: klassen (eller alla) och en fälgstorlek inom bandet. Mest specifik vinner. */
export function pickRule(
  rules: readonly PriceRule[],
  ctx: Pick<PriceContext, 'vehicleClass' | 'rimDiameter'>,
): PriceRule | null {
  let best: PriceRule | null = null;
  for (const r of rules) {
    if (r.vehicleClass && r.vehicleClass !== ctx.vehicleClass) continue;
    if (banded(r)) {
      const d = ctx.rimDiameter;
      if (d == null) continue;
      if (r.rimFrom != null && d < r.rimFrom) continue;
      if (r.rimTo != null && d > r.rimTo) continue;
    }
    if (!best || specificity(r) > specificity(best)) best = r;
  }
  return best;
}

function priced(
  list: number,
  unit: ServicePrice['unit'],
  quantity: number,
  basis: ServicePrice['basis'],
  campaign: PriceCampaign | null | undefined,
  on: string,
): ServicePrice {
  const live = campaignActive(campaign, on) ? campaign : null;
  const unitPrice = live ? campaignPrice(list, live) : list;
  return {
    unit,
    quantity,
    unitPrice,
    listUnitPrice: list,
    total: unitPrice * quantity,
    campaign: live && unitPrice < list ? { label: live.label, to: live.to } : null,
    basis,
  };
}

const wheels = (r: PriceRule) => (r.unit === 'wheel' ? Math.max(1, r.quantity) : 1);

/** Vad åtgärden kostar för bilen, eller null när den är prissatt per klass men inte för den här bilen. */
export function priceOfService(s: PricedService, ctx: PriceContext): ServicePrice | null {
  const rules = s.prices ?? [];
  if (rules.length) {
    const rule = pickRule(rules, ctx);
    return rule ? priced(rule.price, rule.unit, wheels(rule), 'rule', s.campaign, ctx.on) : null;
  }
  const own = s.lines?.find((l) => l.type === 'labour')?.unitPrice ?? s.priceFrom;
  return own == null ? null : priced(own, 'vehicle', 1, 'service', s.campaign, ctx.on);
}

/** Det lägsta åtgärden kan kosta: vad "från" visar. */
export function fromPrice(s: PricedService, on: string): ServicePrice | null {
  const rules = s.prices ?? [];
  if (!rules.length) return priceOfService(s, { vehicleClass: null, rimDiameter: null, on });
  let low: ServicePrice | null = null;
  for (const r of rules) {
    const p = priced(r.price, r.unit, wheels(r), 'rule', s.campaign, on);
    if (!low || p.total < low.total) low = p;
  }
  return low;
}

/** Största fälgen på en bil; också för en bil sparad före registrets fulla post. */
export function rimDiameterOfCar(v: Pick<Vehicle, 'tech' | 'rimSize' | 'tyreSize'>): number | null {
  const sizes = (v.tech?.axles ?? [])
    .map((a) => a.rim?.diameter ?? a.tyre?.diameter ?? null)
    .filter((d): d is number => d !== null);
  if (sizes.length) return Math.max(...sizes);
  const rim =
    /[x×]\s*(\d{2}(?:[.,]\d)?)(?!\d)/i.exec(v.rimSize ?? '') ??
    /(\d{2}(?:[.,]\d)?)\s*[x×]/i.exec(v.rimSize ?? '');
  if (rim) return Number(rim[1].replace(',', '.'));
  const tyre = /R\s*(\d{2})/i.exec(v.tyreSize ?? '');
  return tyre ? Number(tyre[1]) : null;
}

/** Bilens prisklass: det man satt för hand, annars det registret säger. */
export const vehicleClassOfCar = (
  v: Pick<Vehicle, 'tech' | 'classOverride'> | null | undefined,
): VehicleClass | null => v?.classOverride ?? v?.tech?.vehicleClass ?? null;

/** Det en bil ger prisberäkningen. Ingen bil ger en tom kontext (bara regler för alla klasser passar då). */
export function priceContextOf(
  v: Pick<Vehicle, 'tech' | 'classOverride' | 'rimSize' | 'tyreSize'> | null | undefined,
  on: string = today(),
): PriceContext {
  return {
    vehicleClass: vehicleClassOfCar(v),
    rimDiameter: v ? rimDiameterOfCar(v) : null,
    on,
  };
}

/** "Däckbyte (4 hjul)" när priset är per hjul; annars namnet som det är. */
export const priceTitle = (name: string, p: ServicePrice | null): string =>
  p && p.unit === 'wheel' ? `${name} (${p.quantity} hjul)` : name;
