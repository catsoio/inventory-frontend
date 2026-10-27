import { differenceInCalendarDays } from 'date-fns';
import type { InvoiceKind } from '../core/models';
import type { PillTone } from './pill/pill';

/** Vad en faktura eller ett kvitto behöver för att veta hur det ligger till med betalningen. */
export interface Billable {
  kind: InvoiceKind;
  /** Förfallodatum. Bara en faktura har ett. */
  dueAt: string | null;
  paidAt: string | null;
}

/** Betald; förfallen (en faktura som inte betalats i tid); eller obetald och inom tiden. */
export type InvoiceStatus = 'paid' | 'overdue' | 'open';

/**
 * Dagar efter förfallodatumet (negativt = dagar kvar), räknat i kalenderdagar. Null när dokumentet
 * inte har något förfallodatum.
 */
export function daysPastDue(o: Pick<Billable, 'dueAt'>, today = new Date()): number | null {
  return o.dueAt ? differenceInCalendarDays(today, new Date(o.dueAt)) : null;
}

export function invoiceStatus(o: Billable, today = new Date()): InvoiceStatus {
  if (o.paidAt) return 'paid';
  const late = o.kind === 'invoice' ? daysPastDue(o, today) : null;
  return late !== null && late > 0 ? 'overdue' : 'open';
}

/** "5 dagar sen", "idag", "om 12 dagar". Tomt för det som är betalt och för kvitton. */
export function dueNote(o: Billable, today = new Date()): string {
  if (o.paidAt || o.kind !== 'invoice') return '';
  const late = daysPastDue(o, today);
  if (late === null) return '';
  const n = Math.abs(late);
  const days = `${n} ${n === 1 ? 'dag' : 'dagar'}`;
  return late > 0 ? `${days} sen` : late === 0 ? 'idag' : `om ${days}`;
}

/** Så heter statusen i listor och på kort. */
export const STATUS_TEXT: Record<InvoiceStatus, string> = {
  paid: 'Betald',
  overdue: 'Förfallen',
  open: 'Obetald',
};

/** Förfallet är rött, obetalt gult och betalt grönt; färgen följs alltid av ordet ovan. */
export const STATUS_TONE: Record<InvoiceStatus, PillTone> = {
  paid: 'green',
  overdue: 'red',
  open: 'amber',
};
