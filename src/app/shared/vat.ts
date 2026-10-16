import type { OrderTotals } from '../core/models';

/**
 * Moms. Priser lagras och visas exkl. moms (netto); 25 % är normalsatsen och gäller
 * nästan allt en verkstad säljer (delar, däck, arbete, avgifter, däckhotell).
 * Summan bildas per momssats och momsen avrundas en gång per sats (som Skatteverket
 * vill se den på fakturan), inte rad för rad.
 */
export const STANDARD_VAT = 25;
export const VAT_OPTIONS = [25, 12, 6, 0];

/** Moms på ett nettobelopp (öre). */
export const vatOf = (netOre: number, rate = STANDARD_VAT) => Math.round((netOre * rate) / 100);

/** Nettobelopp + moms (öre). */
export const withVat = (netOre: number, rate = STANDARD_VAT) => netOre + vatOf(netOre, rate);

export interface PricedRow {
  quantity: number;
  /** Öre per enhet, exkl. moms. */
  unitPrice: number;
  discountPercent?: number;
  vatRate?: number;
}

export const rowNet = (r: PricedRow) =>
  Math.round((r.quantity * r.unitPrice * (100 - (r.discountPercent ?? 0))) / 100);

/** Samma beräkning som backend, för att visa summan medan man skriver. */
export function totalsOf(rows: PricedRow[]): OrderTotals {
  const buckets = new Map<number, number>();
  let before = 0;
  let net = 0;
  for (const r of rows) {
    const n = rowNet(r);
    before += Math.round(r.quantity * r.unitPrice);
    net += n;
    const rate = r.vatRate ?? STANDARD_VAT;
    buckets.set(rate, (buckets.get(rate) ?? 0) + n);
  }
  const byRate = [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, base]) => ({ rate, base, vat: vatOf(base, rate) }));
  const vat = byRate.reduce((s, b) => s + b.vat, 0);
  return { gross: before, discount: before - net, net, vat, total: net + vat, byRate };
}
