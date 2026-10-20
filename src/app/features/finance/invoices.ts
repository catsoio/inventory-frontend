import { Observable, expand, forkJoin, map, reduce } from 'rxjs';
import { EMPTY } from 'rxjs';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { InventoryApi } from '../../core/api/inventory-api';
import { SalesCardItem, TradeKind, TradeRow, WorkOrder } from '../../core/models';

/** Ett utfärdat dokument, från ett säljkort eller (äldre) en arbetsorder. Belopp i öre inkl. moms. */
export interface InvoiceItem {
  /** Kortets eller ordern id. */
  id: string;
  kind: 'card' | 'order';
  code: string;
  invoicedAt: string | null;
  paidAt: string | null;
  customerName: string;
  regNo: string;
  /** SK-00042 eller AO-00042. */
  ref: string;
  total: number;
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
        .map(
          (o): InvoiceItem => ({
            id: o.id,
            kind: 'order',
            code: o.invoiceCode!,
            invoicedAt: o.invoicedAt ?? null,
            paidAt: o.paidAt ?? null,
            customerName: o.customerName,
            regNo: o.regNo,
            ref: o.code,
            total: o.price ?? 0,
          }),
        ),
    ),
  );
  const fromCards = cards.list({ status: 'posted', limit: 200, offset: 0 }).pipe(
    expand((p) => {
      const next = p.pagination.offset + p.pagination.limit;
      return next < p.pagination.total && next < 1000
        ? cards.list({ status: 'posted', limit: 200, offset: next })
        : EMPTY;
    }),
    reduce((all, p) => all.concat(p.items), [] as SalesCardItem[]),
    map((all) =>
      all.map(
        (c): InvoiceItem => ({
          id: c.id,
          kind: 'card',
          code: c.invoiceCode ?? c.code,
          invoicedAt: c.invoicedAt,
          paidAt: c.paidAt,
          customerName: c.customerName ?? 'Kontantkund',
          regNo: c.regNo ?? '',
          ref: c.code,
          total: c.total,
        }),
      ),
    ),
  );
  return forkJoin([fromOrders, fromCards]).pipe(
    map(([a, b]) =>
      [...a, ...b].sort((x, y) => (y.invoicedAt ?? '').localeCompare(x.invoicedAt ?? '')),
    ),
  );
}

/** Alla försäljningar eller inköp (upp till 1000 dokument), för diagram per månad. */
export function loadTrades(api: InventoryApi, kind: TradeKind): Observable<TradeRow[]> {
  const PAGE = 100;
  return api.tradeRows(kind, { limit: PAGE, offset: 0 }).pipe(
    expand((p) => {
      const next = p.pagination.offset + p.pagination.limit;
      return next < p.pagination.total && next < 1000
        ? api.tradeRows(kind, { limit: PAGE, offset: next })
        : EMPTY;
    }),
    reduce((all, p) => all.concat(p.items), [] as TradeRow[]),
  );
}
