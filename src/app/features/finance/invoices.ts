import { Observable, expand, map, reduce } from 'rxjs';
import { EMPTY } from 'rxjs';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { InventoryApi } from '../../core/api/inventory-api';
import { TradeKind, TradeRow, WorkOrder } from '../../core/models';

/** Moms på ordern: normalsats 25 %, samma som fakturan. */
export const grossOf = (netOre: number) => Math.round(netOre * 1.25);

/** Alla utfärdade fakturor och kvitton (klara order med dokument), nyast först. */
export function loadInvoices(api: WorkOrderApi): Observable<WorkOrder[]> {
  const PAGE = 100;
  return api.list({ status: 'done', limit: PAGE, offset: 0 }).pipe(
    expand((p) => {
      const next = p.pagination.offset + p.pagination.limit;
      return next < p.pagination.total && next < 1000
        ? api.list({ status: 'done', limit: PAGE, offset: next })
        : EMPTY;
    }),
    reduce((all, p) => all.concat(p.items), [] as WorkOrder[]),
    map((all) =>
      all
        .filter((o) => !!o.invoiceCode)
        .sort((a, b) => (b.invoicedAt ?? '').localeCompare(a.invoicedAt ?? '')),
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
