import type { OrderTotals } from '../core/models';

/**
 * Moms. Försäljningspriser lagras och visas INKL. moms (brutto): det admin säger i telefon
 * är det som sparas. Nettot och momsen räknas baklänges per momssats på summan av de
 * brutto-belopp som har samma sats och avrundas en gång (som Skatteverket vill se den på
 * fakturan), inte rad för rad. 25 % är normalsatsen och gäller nästan allt en verkstad
 * säljer. Inköpspriser och snittkostnad är fortfarande exkl. moms.
 */
export const STANDARD_VAT = 25;
export const VAT_OPTIONS = [25, 12, 6, 0];

/** Momsen som ingår i ett belopp inkl. moms (öre): 995 kr innehåller 199 kr. */
export const vatIn = (grossOre: number, rate = STANDARD_VAT) =>
  Math.round((grossOre * rate) / (100 + rate));

/** Belopp inkl. moms utan momsen (öre). */
export const netOf = (grossOre: number, rate = STANDARD_VAT) => grossOre - vatIn(grossOre, rate);

/** Moms på ett nettobelopp (öre); för inköp, som är exkl. moms. */
export const vatOfNet = (netOre: number, rate = STANDARD_VAT) =>
  Math.round((netOre * rate) / 100);

export interface PricedRow {
  quantity: number;
  /** Öre per enhet, inkl. moms. */
  unitPrice: number;
  discountPercent?: number;
  vatRate?: number;
}

export const rowGross = (r: PricedRow) =>
  Math.round((r.quantity * r.unitPrice * (100 - (r.discountPercent ?? 0))) / 100);

/** Rabatt på hela dokumentet, efter radernas egna: procent, eller öre inkl. moms. */
export interface DocumentDiscount {
  type: 'percent' | 'amount';
  value: number;
}

/**
 * Vad varje rad kostar efter radens egen rabatt och sin del av dokumentrabatten. Rabatten
 * fördelas efter radernas pris och sista raden tar avrundningen, så raderna alltid summerar
 * till exakt dokumentets total. Samma beräkning som backend.
 */
export function rowAmounts(rows: PricedRow[], discount?: DocumentDiscount | null): number[] {
  const own = rows.map(rowGross);
  const sum = own.reduce((a, b) => a + b, 0);
  if (!discount || sum <= 0 || discount.value <= 0) return own;
  const off =
    discount.type === 'percent'
      ? Math.round((sum * Math.min(discount.value, 100)) / 100)
      : Math.min(Math.round(discount.value), sum);
  let left = off;
  const last = own
    .map((g, i) => (g > 0 ? i : -1))
    .filter((i) => i >= 0)
    .pop();
  return own.map((g, i) => {
    if (g <= 0) return g;
    const share = i === last ? left : Math.round((off * g) / sum);
    left -= share;
    return g - share;
  });
}

/** Samma beräkning som backend, för att visa summan medan man skriver. */
export function totalsOf(rows: PricedRow[], discount?: DocumentDiscount | null): OrderTotals {
  const amounts = rowAmounts(rows, discount);
  const buckets = new Map<number, number>();
  let before = 0;
  let total = 0;
  rows.forEach((r, i) => {
    before += Math.round(r.quantity * r.unitPrice);
    total += amounts[i];
    const rate = r.vatRate ?? STANDARD_VAT;
    buckets.set(rate, (buckets.get(rate) ?? 0) + amounts[i]);
  });
  const byRate = [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, gross]) => ({ rate, base: netOf(gross, rate), vat: vatIn(gross, rate) }));
  const vat = byRate.reduce((s, b) => s + b.vat, 0);
  return { gross: before, discount: before - total, net: total - vat, vat, total, byRate };
}
