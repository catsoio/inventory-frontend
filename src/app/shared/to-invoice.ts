import { differenceInCalendarMonths } from 'date-fns';
import type { UnbilledCustomer, UnbilledOrder } from '../core/models';
import type { PillTone } from './pill/pill';

/**
 * Var en klar arbetsorder som inte är fakturerad står (Business Centrals "Levererat ej
 * fakturerat"). En definition som menyns siffra, Hem och listan Att fakturera läser:
 *  - `waiting`: kunden har samlingsfaktura och arbetet gjordes den här månaden. Ordern följer med
 *    månadens samlingsfaktura och väntar inte på någon än.
 *  - `due`: ska faktureras nu. En vanlig kund direkt, en kund med samlingsfaktura när månaden är slut.
 *  - `late`: borde redan ha fakturerats: månaden efter den då arbetet gjordes är slut, så även en
 *    månadsvis samlingsfaktura borde ha gått ut. Det är vår gräns för god affärssed, inte en
 *    lagstadgad frist (se docs/axle/regler.md i backend, "När fakturan ska utfärdas").
 */
export type InvoiceState = 'waiting' | 'due' | 'late';

export function invoiceStateOf(
  order: Pick<UnbilledOrder, 'doneAt'>,
  collective: boolean,
  today: Date = new Date(),
): InvoiceState {
  const months = differenceInCalendarMonths(today, new Date(order.doneAt));
  if (months >= 2) return 'late';
  if (collective && months <= 0) return 'waiting';
  return 'due';
}

export const INVOICE_STATE_TEXT: Record<InvoiceState, string> = {
  waiting: 'Väntar på samlingsfaktura',
  due: 'Att fakturera',
  late: 'Borde ha fakturerats',
};

export const INVOICE_STATE_TONE: Record<InvoiceState, PillTone> = {
  waiting: 'gray',
  due: 'amber',
  late: 'red',
};

/** Det som väntar på dig: order utan påbörjad faktura som ska faktureras nu, och hur många av dem som är sena. */
export interface ToInvoiceSummary {
  due: number;
  late: number;
  /** Öre inkl. moms för de som ska faktureras nu. */
  amount: number;
}

export function toInvoiceSummary(
  customers: UnbilledCustomer[],
  today: Date = new Date(),
): ToInvoiceSummary {
  const out: ToInvoiceSummary = { due: 0, late: 0, amount: 0 };
  for (const g of customers) {
    for (const o of g.orders) {
      // En order på ett utkast räknas under säljkortens utkast, inte här.
      if (o.card) continue;
      const state = invoiceStateOf(o, g.customer.collectiveInvoice, today);
      if (state === 'waiting') continue;
      out.due += 1;
      if (state === 'late') out.late += 1;
      out.amount += o.total;
    }
  }
  return out;
}
