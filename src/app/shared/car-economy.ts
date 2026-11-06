import type { CarEconomy, CarListing } from '../core/models';
import { STANDARD_VAT, netOf, vatIn } from './vat';

/**
 * Vad en bil ger verkstaden, räknat på det som står i formuläret medan man skriver. Spegel av
 * backend `domain/tables/car-economy.ts` (där regeln och källorna står): ändra båda.
 *
 * Kort: VMB = 20 % av (pris − inköpspris), inget om marginalen är negativ; kostnader sänker inte
 * marginalen men momsen på dem dras av. Vanlig moms = 25 % av hela priset, och momsen på inköp och
 * kostnader dras av. Vinsten är det som blir kvar när momsen till staten är betald.
 */
export type CarBooks = Pick<
  CarListing,
  'price' | 'soldPrice' | 'status' | 'purchase' | 'costs' | 'vatScheme'
>;

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

export function carEconomy(c: CarBooks): CarEconomy {
  const sold = c.status === 'sold' && c.soldPrice !== null;
  const salePrice = sold ? c.soldPrice : c.price;
  const basis = salePrice === null ? null : sold ? 'sold' : 'asking';

  const costsNet = c.costs.reduce((sum, x) => sum + netOf(x.amount, x.vatRate), 0);
  const costsVat = c.costs.reduce((sum, x) => sum + vatIn(x.amount, x.vatRate), 0);
  const purchaseNet = c.purchase ? netOf(c.purchase.price, c.purchase.vatRate) : null;
  const inputVat = costsVat + (c.purchase ? vatIn(c.purchase.price, c.purchase.vatRate) : 0);
  const totalCost = purchaseNet === null ? null : purchaseNet + costsNet;

  let outputVat: number | null = null;
  if (salePrice !== null) {
    if (c.vatScheme === 'margin') {
      outputVat = c.purchase ? Math.round(Math.max(0, salePrice - c.purchase.price) * 0.2) : null;
    } else {
      outputVat = vatIn(salePrice, STANDARD_VAT);
    }
  }

  const vatToPay = outputVat === null ? null : outputVat - inputVat;
  const revenue = salePrice !== null && outputVat !== null ? salePrice - outputVat : null;
  const profit = revenue !== null && totalCost !== null ? revenue - totalCost : null;

  return {
    basis,
    salePrice,
    purchaseNet,
    costsNet,
    totalCost,
    outputVat,
    inputVat,
    vatToPay,
    profit,
    marginPercent:
      profit !== null && revenue !== null && revenue > 0
        ? oneDecimal((profit / revenue) * 100)
        : null,
    markupPercent:
      profit !== null && totalCost !== null && totalCost > 0
        ? oneDecimal((profit / totalCost) * 100)
        : null,
  };
}
