import { differenceInCalendarDays } from 'date-fns';
import { Observable, expand, forkJoin, map, reduce } from 'rxjs';
import { EMPTY } from 'rxjs';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { InvoiceKind, PaymentMethod, SalesCardItem, WorkOrder } from '../../core/models';
import { daysPastDue, invoiceStatus } from '../../shared/invoice-status';

/** Ett utfärdat dokument, från ett säljkort eller (äldre) en arbetsorder. Belopp i öre inkl. moms. */
export interface InvoiceItem {
  /** Kortets eller ordern id. */
  id: string;
  /** Var dokumentet ligger: på ett säljkort eller (äldre) på en arbetsorder. */
  source: 'card' | 'order';
  /** Faktura (betalas senare) eller kvitto (betalt på stället). */
  kind: InvoiceKind;
  code: string;
  invoicedAt: string | null;
  /** Förfallodatum. Bara en faktura har ett. */
  dueAt: string | null;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  customerName: string;
  regNo: string;
  /** SK-00042 eller AO-00042. */
  ref: string;
  total: number;
}

/** Vad ägaren behöver veta om fordringarna: vad som är obetalt, vad som är sent och vad som kommit in. */
export interface InvoiceFigures {
  unpaid: { count: number; sum: number };
  overdue: { count: number; sum: number; oldestDays: number };
  /** Betalt de senaste `days` dagarna. */
  paidRecently: { count: number; sum: number };
}

/** Fakturorna (kundreskontran): det som betalas senare. Ett kvitto är betalt på stället och hör inte dit. */
export const onlyInvoices = (items: InvoiceItem[]) => items.filter((o) => o.kind === 'invoice');

/** Kvittona: försäljning som betalades på stället. */
export const onlyReceipts = (items: InvoiceItem[]) => items.filter((o) => o.kind === 'receipt');

export function invoiceFigures(
  items: InvoiceItem[],
  today = new Date(),
  days = 30,
): InvoiceFigures {
  const out: InvoiceFigures = {
    unpaid: { count: 0, sum: 0 },
    overdue: { count: 0, sum: 0, oldestDays: 0 },
    paidRecently: { count: 0, sum: 0 },
  };
  for (const o of onlyInvoices(items)) {
    const status = invoiceStatus(o, today);
    if (status === 'paid') {
      if (o.paidAt && differenceInCalendarDays(today, new Date(o.paidAt)) < days) {
        out.paidRecently.count++;
        out.paidRecently.sum += o.total;
      }
      continue;
    }
    out.unpaid.count++;
    out.unpaid.sum += o.total;
    if (status === 'overdue') {
      out.overdue.count++;
      out.overdue.sum += o.total;
      out.overdue.oldestDays = Math.max(out.overdue.oldestDays, daysPastDue(o, today) ?? 0);
    }
  }
  return out;
}

/** Alla utfärdade fakturor och kvitton (säljkort och äldre arbetsorder), nyast först. */
export function loadInvoices(orders: WorkOrderApi, cards: SalesCardApi): Observable<InvoiceItem[]> {
  const PAGE = 100;
  const fromOrders = orders.list({ status: 'done', limit: PAGE, offset: 0 }).pipe(
    expand((p) => {
      const next = p.pagination.offset + p.pagination.limit;
      return next < p.pagination.total && next < 1000
        ? orders.list({ status: 'done', limit: PAGE, offset: next })
        : EMPTY;
    }),
    reduce((all, p) => all.concat(p.items), [] as WorkOrder[]),
    map((all) =>
      all
        .filter((o) => !!o.invoiceCode)
        .map((o): InvoiceItem => ({
          id: o.id,
          source: 'order',
          // Äldre svar saknar typen: en faktura är det som har ett förfallodatum.
          kind: o.invoiceKind ?? (o.invoiceDueAt ? 'invoice' : 'receipt'),
          code: o.invoiceCode!,
          invoicedAt: o.invoicedAt ?? null,
          dueAt: o.invoiceDueAt ?? null,
          paidAt: o.paidAt ?? null,
          paymentMethod: o.paymentMethod ?? null,
          customerName: o.customerName,
          regNo: o.regNo,
          ref: o.code,
          total: o.invoiceTotal ?? o.price ?? 0,
        })),
    ),
  );
  const fromCards = cards.list({ status: 'posted', limit: PAGE, offset: 0 }).pipe(
    expand((p) => {
      const next = p.pagination.offset + p.pagination.limit;
      return next < p.pagination.total && next < 1000
        ? cards.list({ status: 'posted', limit: PAGE, offset: next })
        : EMPTY;
    }),
    reduce((all, p) => all.concat(p.items), [] as SalesCardItem[]),
    map((all) =>
      all.map((c): InvoiceItem => ({
        id: c.id,
        source: 'card',
        kind: c.kind ?? (c.dueAt ? 'invoice' : 'receipt'),
        code: c.documentCode ?? c.code,
        invoicedAt: c.invoicedAt,
        dueAt: c.dueAt ?? null,
        paidAt: c.paidAt,
        paymentMethod: c.paymentMethod ?? null,
        customerName: c.customerName ?? 'Kontantkund',
        regNo: c.regNo ?? '',
        ref: c.code,
        total: c.total,
      })),
    ),
  );
  return forkJoin([fromOrders, fromCards]).pipe(
    map(([a, b]) =>
      [...a, ...b].sort((x, y) => (y.invoicedAt ?? '').localeCompare(x.invoicedAt ?? '')),
    ),
  );
}
