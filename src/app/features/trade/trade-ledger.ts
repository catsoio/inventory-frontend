import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AxleApi } from '../../core/api/axle-api';
import { TradeKind, TradeRow } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import { TradeDocumentDialog } from '../../shared/trade-document-dialog/trade-document-dialog';
import { hostOf, safeUrl } from '../../shared/web-link';

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
      title="Inköp"
      [columns]="cols()"
      [rows]="shown()"
      [loading]="loading()"
      newLink="new"
      newLabel="Nytt inköp"
      emptyText="Inga inköp ännu."
      searchPlaceholder="Sök nummer, leverantör eller referens…"
      (search)="query.set($event)"
      (rowClick)="open($event)"
    >
      <!-- Mobilens kort: det viktigaste först, resten som en rad. -->
      <ng-template #card let-r="row">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate text-base font-semibold">{{ party(r) }}</div>
          </div>
          <div class="shrink-0 text-right">
            <div class="text-base font-semibold tabular-nums">{{ shownTotal(r) }}</div>
            <div class="text-[11px] text-gray-500">exkl. moms</div>
          </div>
        </div>
        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
          <span class="font-medium text-gray-700">{{ r.code }}</span>
          <span>·</span>
          <span>{{ when(r.createdAt) }}</span>
          <span>·</span>
          <span>{{ r.lines }} rader, {{ r.units }} st</span>
        </div>
        @if (r.reference || r.note) {
          <div class="mt-1 truncate text-xs text-gray-500">{{ r.reference || r.note }}</div>
        }
        @if (link(r); as u) {
          <a
            [href]="u"
            target="_blank"
            rel="noopener noreferrer"
            class="text-brand mt-1 inline-flex items-center gap-1 text-xs"
            (click)="$event.stopPropagation()"
            ><mat-icon class="!h-4 !w-4 !text-base">open_in_new</mat-icon>{{ host(r.url) }}</a
          >
        }
      </ng-template>
      <ng-template #cell let-r="row" let-col="col" let-text="text">
        @if (col.key === 'url' && link(r); as u) {
          <a
            [href]="u"
            target="_blank"
            rel="noopener noreferrer"
            class="text-brand inline-flex items-center gap-1 hover:underline"
            (click)="$event.stopPropagation()"
            >{{ text }}<mat-icon class="!h-4 !w-4 !text-base">open_in_new</mat-icon></a
          >
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class TradeLedger {
  private readonly api = inject(AxleApi);
  private readonly dialog = inject(MatDialog);

  readonly host = hostOf;
  readonly link = (r: TradeRow) => safeUrl(r.url);
  private readonly kind: TradeKind = 'purchases';

  readonly cols = signal<DtCol<TradeRow>[]>([
    { key: 'code', label: 'Nr', value: (r) => r.number, fmt: (r) => r.code },
    {
      key: 'date',
      label: 'Datum',
      value: (r) => r.createdAt,
      fmt: (r) => `${day(r.createdAt)} ${time(r.createdAt)}`,
    },
    {
      key: 'supplier',
      label: 'Leverantör',
      value: (r) => r.supplier?.name ?? r.supplierName ?? '',
      fmt: (r) => r.supplier?.name || r.supplierName || '–',
    },
    {
      key: 'url',
      label: 'Köpt via',
      value: (r) => hostOf(r.url),
      fmt: (r) => hostOf(r.url) || '–',
    },
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
    { key: 'note', label: 'Anteckning', value: (r) => r.note ?? '', fmt: (r) => r.note || '–' },
  ]);

  /** Kortets rubrik: leverantören. */
  party(r: TradeRow) {
    return r.supplier?.name || r.supplierName || 'Okänd leverantör';
  }
  /** Inköp visas exkl. moms. */
  shownTotal(r: TradeRow) {
    return kr.transform(r.total);
  }
  when(iso: string) {
    return `${day(iso)} ${time(iso)}`;
  }

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
