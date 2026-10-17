import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { InventoryApi } from '../../core/api/inventory-api';
import { TradeKind, TradeRow } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import { vatOf, withVat } from '../../shared/vat';
import { TradeDocumentDialog } from '../../shared/trade-document-dialog/trade-document-dialog';

const kr = new KrPipe();
const day = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

/** Logg över försäljningar eller inköp: en rad per dokument med löpnummer, som en reskontra. */
@Component({
  selector: 'app-trade-ledger',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      [title]="sell ? 'Försäljningar' : 'Inköp'"
      [columns]="cols()"
      [rows]="shown()"
      [loading]="loading()"
      newLink="new"
      [newLabel]="sell ? 'Ny försäljning' : 'Nytt inköp'"
      [emptyText]="sell ? 'Inga försäljningar ännu.' : 'Inga inköp ännu.'"
      [searchPlaceholder]="
        sell ? 'Sök nummer, kund, regnr eller referens…' : 'Sök nummer, leverantör eller referens…'
      "
      (search)="query.set($event)"
      (rowClick)="open($event)"
    />
  `,
})
export class TradeLedger {
  private readonly api = inject(InventoryApi);
  private readonly dialog = inject(MatDialog);

  readonly sell = inject(ActivatedRoute).snapshot.data['mode'] === 'sell';
  private readonly kind: TradeKind = this.sell ? 'sales' : 'purchases';

  readonly cols = signal<DtCol<TradeRow>[]>([
    { key: 'code', label: 'Nr', value: (r) => r.number, fmt: (r) => r.code },
    {
      key: 'date',
      label: 'Datum',
      value: (r) => r.createdAt,
      fmt: (r) => `${day(r.createdAt)} ${time(r.createdAt)}`,
    },
    ...(this.sell
      ? [
          {
            key: 'customer',
            label: 'Kund',
            value: (r: TradeRow) => r.customer?.name ?? '',
            fmt: (r: TradeRow) => r.customer?.name || 'Kontant',
          },
          {
            key: 'vehicle',
            label: 'Bil',
            value: (r: TradeRow) => r.vehicle?.regNo ?? '',
            fmt: (r: TradeRow) =>
              r.vehicle
                ? [r.vehicle.regNo, r.vehicle.make, r.vehicle.model].filter(Boolean).join(' ')
                : '–',
          },
        ]
      : [
          {
            key: 'supplier',
            label: 'Leverantör',
            value: (r: TradeRow) => r.supplier?.name ?? r.supplierName ?? '',
            fmt: (r: TradeRow) => r.supplier?.name || r.supplierName || '–',
          },
        ]),
    {
      key: 'reference',
      label: 'Referens',
      value: (r) => r.reference ?? '',
      fmt: (r) => r.reference || '–',
    },
    { key: 'lines', label: 'Rader', right: true, value: (r) => r.lines },
    { key: 'units', label: 'Antal', right: true, value: (r) => r.units },
    {
      key: 'total',
      label: 'Summa exkl. moms',
      right: true,
      value: (r) => r.total,
      fmt: (r) => kr.transform(r.total),
    },
    ...(this.sell
      ? [
          {
            key: 'vat',
            label: 'Moms 25 %',
            right: true,
            value: (r: TradeRow) => vatOf(r.total),
            fmt: (r: TradeRow) => kr.transform(vatOf(r.total)),
          },
          {
            key: 'gross',
            label: 'Inkl. moms',
            right: true,
            value: (r: TradeRow) => withVat(r.total),
            fmt: (r: TradeRow) => kr.transform(withVat(r.total)),
          },
        ]
      : []),
    { key: 'note', label: 'Anteckning', value: (r) => r.note ?? '', fmt: (r) => r.note || '–' },
  ]);

  readonly rows = signal<TradeRow[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly shown = computed(() => {
    const q = this.query().toLowerCase();
    if (!q) return this.rows();
    return this.rows().filter((r) =>
      [
        r.code,
        String(r.number),
        r.reference,
        r.customer?.name,
        r.customer?.code,
        r.vehicle?.regNo,
        r.supplier?.name,
        r.supplier?.code,
        r.supplierName,
        r.note,
      ].some((v) => v?.toLowerCase().includes(q)),
    );
  });

  constructor() {
    this.api.tradeRows(this.kind, { limit: 100 }).subscribe({
      next: (p) => {
        this.rows.set(p.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(r: TradeRow) {
    this.dialog.open(TradeDocumentDialog, {
      data: { kind: this.kind, number: r.number },
      width: '720px',
      maxWidth: '95vw',
    });
  }
}
