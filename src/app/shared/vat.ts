import type { OrderTotals } from '../core/models';

/**
 * Moms. Försäljningspriser lagras och visas INKL. moms (brutto): det admin säger i telefon
 * är det som sparas. Nettot och momsen räknas baklänges per momssats på summan av de
 * brutto-belopp som har samma sats och avrundas en gång (som Skatteverket vill se den på
 * fakturan), inte rad för rad. 25 % är normalsatsen och gäller nästan allt en verkstad
 * säljer. Inköpspriser och snittkostnad är fortfarande exkl. moms.
 *
 * Ett dokument kan i stället vara prissatt EXKL. moms (`pricesIncludeVat: false`, som en
 * bilverkstad prissätter: "10 929,13 + moms"). Då är raderna netto och momsen läggs på per sats
 * på summan. Spegel av backend `domain/tables/vat.ts`: ändra båda.
 */
export const STANDARD_VAT = 25;
export const VAT_OPTIONS = [25, 12, 6, 0];

/** Momsen som ingår i ett belopp inkl. moms (öre): 995 kr innehåller 199 kr. */
export const vatIn = (grossOre: number, rate = STANDARD_VAT) =>
  Math.round((grossOre * rate) / (100 + rate));

/** Belopp inkl. moms utan momsen (öre). */
export const netOf = (grossOre: number, rate = STANDARD_VAT) => grossOre - vatIn(grossOre, rate);

/** Moms på ett nettobelopp (öre); för inköp, som är exkl. moms. */
export const vatOfNet = (netOre: number, rate = STANDARD_VAT) => Math.round((netOre * rate) / 100);

export interface PricedRow {
  quantity: number;
  /** Öre per enhet, i dokumentets prisläge. */
  unitPrice: number;
  discountPercent?: number;
  vatRate?: number;
  /** Jobbet (prisgruppen) raden hör till. */
  group?: string | null;
}

/** Ett jobb med fast pris: kostar exakt `fixedPrice` hur raderna än summerar. */
export interface PriceGroup {
  id: string;
  fixedPrice: number | null;
}

export interface PricingMode {
  pricesIncludeVat?: boolean;
  roundToKrona?: boolean;
  groups?: PriceGroup[];
}

export const rowGross = (r: PricedRow) =>
  Math.round((r.quantity * r.unitPrice * (100 - (r.discountPercent ?? 0))) / 100);

/** Moms på ett nettobelopp, en gång per sats. */
export const vatOn = vatOfNet;

/** Ett pris inkl. moms i dokumentets prisläge: netto om dokumentet är exkl. moms. */
export const inMode = (grossOre: number, pricesIncludeVat: boolean, rate = STANDARD_VAT) =>
  pricesIncludeVat ? grossOre : netOf(grossOre, rate);

/** Rabatt på hela dokumentet, efter radernas egna: procent, eller öre i dokumentets prisläge. */
export interface DocumentDiscount {
  type: 'percent' | 'amount';
  value: number;
}

/** Fördelar `target` efter vikterna; sista viktade raden tar avrundningen. Utan vikt delas lika. */
export function spread(amounts: number[], target: number): number[] {
  if (!amounts.length) return [];
  const sum = amounts.reduce((a, b) => a + b, 0);
  const weights = sum > 0 ? amounts.map((a) => Math.max(a, 0)) : amounts.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const last = weights
    .map((w, i) => (w > 0 ? i : -1))
    .filter((i) => i >= 0)
    .pop();
  let left = target;
  return weights.map((w, i) => {
    if (w <= 0) return 0;
    const share = i === last ? left : Math.round((target * w) / total);
    left -= share;
    return share;
  });
}

/**
 * Vad varje rad kostar efter radens egen rabatt, jobbets fasta pris (fördelat efter vikt) och
 * sin del av dokumentrabatten. Raderna summerar alltid till exakt dokumentets total.
 */
export function rowAmounts(
  rows: PricedRow[],
  discount?: DocumentDiscount | null,
  groups?: PriceGroup[] | null,
): number[] {
  const own = rows.map(rowGross);
  for (const g of groups ?? []) {
    if (g.fixedPrice === null || g.fixedPrice === undefined) continue;
    const idx = rows.map((r, i) => (r.group === g.id ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const shares = spread(
      idx.map((i) => own[i]),
      g.fixedPrice,
    );
    idx.forEach((i, k) => (own[i] = shares[k]));
  }
  const sum = own.reduce((a, b) => a + b, 0);
  if (!discount || sum <= 0 || discount.value <= 0) return own;
  const off =
    discount.type === 'percent'
      ? Math.round((sum * Math.min(discount.value, 100)) / 100)
      : Math.min(Math.round(discount.value), sum);
  const shares = spread(
    own.map((a) => Math.max(a, 0)),
    off,
  );
  return own.map((a, i) => a - shares[i]);
}

/** Delsumma per jobb (grupp-id). */
export function groupAmounts(rows: PricedRow[], amounts: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  rows.forEach((r, i) => {
    if (!r.group) return;
    out[r.group] = (out[r.group] ?? 0) + amounts[i];
  });
  return out;
}

/** Samma beräkning som backend, för att visa summan medan man skriver. */
export function totalsOf(
  rows: PricedRow[],
  discount?: DocumentDiscount | null,
  mode: PricingMode = {},
): OrderTotals {
  const incl = mode.pricesIncludeVat ?? true;
  const amounts = rowAmounts(rows, discount, mode.groups);
  const buckets = new Map<number, number>();
  let before = 0;
  let sum = 0;
  rows.forEach((r, i) => {
    before += Math.round(r.quantity * r.unitPrice);
    sum += amounts[i];
    const rate = r.vatRate ?? STANDARD_VAT;
    buckets.set(rate, (buckets.get(rate) ?? 0) + amounts[i]);
  });
  const byRate = [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, amount]) =>
      incl
        ? { rate, base: netOf(amount, rate), vat: vatIn(amount, rate) }
        : { rate, base: amount, vat: vatOn(amount, rate) },
    );
  const vat = byRate.reduce((s, b) => s + b.vat, 0);
  const net = byRate.reduce((s, b) => s + b.base, 0);
  const exact = net + vat;
  const total = mode.roundToKrona ? Math.round(exact / 100) * 100 : exact;
  return {
    gross: before,
    discount: before - sum,
    net,
    vat,
    rounding: total - exact,
    total,
    byRate,
    pricesIncludeVat: incl,
  };
}

/** "inkl. moms" eller "exkl. moms" för ett dokument. */
export const vatLabel = (pricesIncludeVat: boolean | undefined) =>
  pricesIncludeVat === false ? 'exkl. moms' : 'inkl. moms';
