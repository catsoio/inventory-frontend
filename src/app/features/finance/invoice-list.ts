import { appLocale } from '../../core/i18n/locale';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { paymentLabel } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import {
  InvoiceStatus,
  STATUS_TEXT,
  STATUS_TONE,
  dueNote,
  invoiceStatus,
} from '../../shared/invoice-status';
import { InvoiceItem, invoiceFigures, loadInvoices } from './invoices';

const kr = new KrPipe();
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(appLocale()) : '–';

const KIND_TEXT = { invoice: 'Faktura', receipt: 'Kvitto' } as const;
/** Det som kräver något av ägaren först: förfallet, sedan obetalt, sist betalt. */
const STATUS_ORDER: Record<InvoiceStatus, number> = { overdue: 0, open: 1, paid: 2 };

const COLS: DtCol<InvoiceItem>[] = [
  { key: 'code', label: 'Nr', value: (o) => o.code },
  { key: 'kind', label: 'Typ', value: (o) => KIND_TEXT[o.kind] },
  { key: 'customer', label: 'Kund', value: (o) => o.customerName },
  { key: 'regNo', label: 'Regnr', value: (o) => o.regNo },
  {
    key: 'date',
    label: 'Datum',
    value: (o) => o.invoicedAt ?? '',
    fmt: (o) => day(o.invoicedAt),
  },
  {
    key: 'due',
    label: 'Förfaller',
    value: (o) => o.dueAt ?? '',
    fmt: (o) => (o.kind === 'invoice' ? day(o.dueAt) : '–'),
  },
  {
    key: 'gross',
    label: 'Belopp',
    right: true,
    value: (o) => o.total,
    fmt: (o) => kr.transform(o.total),
  },
  {
    key: 'status',
    label: 'Status',
    value: (o) => STATUS_ORDER[invoiceStatus(o)],
    fmt: (o) => STATUS_TEXT[invoiceStatus(o)],
  },
];

type StatusFilter = 'all' | 'unpaid' | 'overdue' | 'paid';
type KindFilter = 'all' | 'invoice' | 'receipt';

/**
 * Fakturor och kvitton på ett ställe, som en kundreskontra: vad som är obetalt, vad som är sent
 * och vad som kommit in. En faktura har förfallodatum och kan vara förfallen; ett kvitto är betalt
 * redan när det skrivs. Klick öppnar säljkortet (eller den äldre fakturan) bakom.
 */
@Component({
  selector: 'app-invoice-list',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-finance-tabs />
    <div class="mb-4 grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
      <button type="button" class="block min-w-0 text-left" (click)="status.set('unpaid')">
        <app-stat
          label="Obetalt"
          [value]="loading() ? '–' : money(figures().unpaid.sum)"
          [hint]="
            loading()
              ? ''
              : figures().unpaid.count + (figures().unpaid.count === 1 ? ' faktura' : ' fakturor')
          "
          [status]="figures().unpaid.count ? 'warn' : 'none'"
        />
      </button>
      <button type="button" class="block min-w-0 text-left" (click)="status.set('overdue')">
        <app-stat
          label="Förfallet"
          [value]="loading() ? '–' : money(figures().overdue.sum)"
          [hint]="overdueHint()"
          [status]="figures().overdue.count ? 'bad' : 'none'"
        />
      </button>
      <div class="min-w-0 max-md:hidden">
        <app-stat
          label="Betalt senaste 30 dagarna"
          [value]="loading() ? '–' : money(figures().paidRecently.sum)"
          [hint]="loading() ? '' : figures().paidRecently.count + ' st, inkl. moms'"
        />
      </div>
    </div>
    <div class="min-h-0 flex-1">
      <app-list-page
        title=""
        [columns]="cols"
        [rows]="shown()"
        [loading]="loading()"
        newLink="/sales/new"
        [newQuery]="{ kind: 'invoice' }"
        newLabel="Ny faktura"
        [newFab]="false"
        emptyText="Inget att visa. Fakturor och kvitton skapas när ett säljkort bokförs."
        searchPlaceholder="Sök nummer, kund eller regnr…"
        (search)="query.set($event)"
        (rowClick)="open($event)"
      >
        <div class="mb-3 flex shrink-0 flex-wrap items-center gap-3">
          <mat-button-toggle-group
            hideSingleSelectionIndicator
            [value]="status()"
            (change)="status.set($event.value)"
            aria-label="Status"
          >
            <mat-button-toggle value="all">Alla</mat-button-toggle>
            <mat-button-toggle value="unpaid">Obetalda</mat-button-toggle>
            <mat-button-toggle value="overdue">Förfallna</mat-button-toggle>
            <mat-button-toggle value="paid">Betalda</mat-button-toggle>
          </mat-button-toggle-group>
          <mat-button-toggle-group
            class="max-md:!hidden"
            hideSingleSelectionIndicator
            [value]="kind()"
            (change)="kind.set($event.value)"
            aria-label="Typ"
          >
            <mat-button-toggle value="all">Alla typer</mat-button-toggle>
            <mat-button-toggle value="invoice">Fakturor</mat-button-toggle>
            <mat-button-toggle value="receipt">Kvitton</mat-button-toggle>
          </mat-button-toggle-group>
          <span class="text-sm text-gray-600">{{ summary() }}</span>
          <span class="flex-1"></span>
          <a mat-stroked-button routerLink="/finance/invoices/new" class="max-md:!hidden">
            <mat-icon>history</mat-icon> Lägg till gammal faktura
          </a>
        </div>
        <!-- Mobil: ett kompakt kort i stället för alla kolumner under varandra. -->
        <ng-template #card let-o="row">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="font-semibold">{{ o.code }}</span>
                <span class="text-xs text-gray-500">{{ kindText(o) }} · {{ dateOf(o) }}</span>
              </div>
              <div class="truncate text-sm text-gray-700">{{ o.customerName }}</div>
              <div class="truncate text-xs text-gray-500">
                {{ o.ref }}{{ o.regNo ? ' · ' + o.regNo : '' }}
              </div>
              @if (note(o); as n) {
                <div
                  class="text-xs"
                  [class]="statusOf(o) === 'overdue' ? 'font-medium text-red-700' : 'text-gray-500'"
                >
                  Förfaller {{ dayText(o.dueAt) }} · {{ n }}
                </div>
              }
            </div>
            <div class="shrink-0 text-right">
              <div class="font-semibold tabular-nums">{{ money(o.total) }}</div>
              <app-pill class="mt-1 inline-block" [tone]="tone(o)">{{ statusText(o) }}</app-pill>
            </div>
          </div>
        </ng-template>
        <ng-template #cell let-o="row" let-col="col" let-text="text">
          @switch (col.key) {
            @case ('code') {
              <span class="font-medium">{{ o.code }}</span>
              <span class="block text-xs text-gray-500">{{ o.ref }}</span>
            }
            @case ('kind') {
              <app-pill [tone]="o.kind === 'invoice' ? 'blue' : 'gray'">{{ text }}</app-pill>
            }
            @case ('due') {
              {{ text }}
              @if (note(o); as n) {
                <span
                  class="block text-xs"
                  [class]="statusOf(o) === 'overdue' ? 'font-medium text-red-700' : 'text-gray-500'"
                  >{{ n }}</span
                >
              }
            }
            @case ('status') {
              <app-pill [tone]="tone(o)">{{ text }}</app-pill>
              @if (o.paidAt) {
                <span class="block text-xs text-gray-500">{{ paidDetail(o) }}</span>
              }
            }
            @default {
              {{ text }}
            }
          }
        </ng-template>
      </app-list-page>
    </div>
  `,
})
export class InvoiceList {
  private readonly api = inject(WorkOrderApi);
  private readonly cardsApi = inject(SalesCardApi);
  readonly router = inject(Router);
  readonly cols = COLS;
  readonly money = (ore: number) => kr.transform(ore);
  readonly dayText = day;
  readonly dateOf = (o: InvoiceItem) => day(o.invoicedAt);
  readonly kindText = (o: InvoiceItem) => KIND_TEXT[o.kind];
  readonly statusOf = (o: InvoiceItem) => invoiceStatus(o);
  readonly statusText = (o: InvoiceItem) => STATUS_TEXT[invoiceStatus(o)];
  readonly tone = (o: InvoiceItem) => STATUS_TONE[invoiceStatus(o)];
  readonly note = (o: InvoiceItem) => dueNote(o);
  /** "12 okt · Swish", under Betald. */
  readonly paidDetail = (o: InvoiceItem) =>
    [
      o.paidAt &&
        new Date(o.paidAt).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' }),
      o.paymentMethod && paymentLabel(o.kind, o.paymentMethod),
    ]
      .filter(Boolean)
      .join(' · ');

  private readonly items = signal<InvoiceItem[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly status = signal<StatusFilter>(
    ((q) => (q === 'unpaid' || q === 'overdue' || q === 'paid' ? q : 'all'))(
      inject(ActivatedRoute).snapshot.queryParamMap.get('status'),
    ),
  );
  readonly kind = signal<KindFilter>('all');

  /** Siffrorna gäller alla dokument, inte bara de som filtret visar. */
  readonly figures = computed(() => invoiceFigures(this.items()));
  readonly overdueHint = computed(() => {
    if (this.loading()) return '';
    const o = this.figures().overdue;
    if (!o.count) return 'Inget är sent';
    return `${o.count} st · äldst ${o.oldestDays} ${o.oldestDays === 1 ? 'dag' : 'dagar'}`;
  });

  readonly shown = computed(() => {
    const q = this.query().toLowerCase();
    const s = this.status();
    const k = this.kind();
    return this.items().filter((o) => {
      const st = invoiceStatus(o);
      return (
        (k === 'all' || o.kind === k) &&
        (s === 'all' ||
          (s === 'paid' && st === 'paid') ||
          (s === 'unpaid' && st !== 'paid') ||
          (s === 'overdue' && st === 'overdue')) &&
        (!q || `${o.code} ${o.customerName} ${o.regNo} ${o.ref}`.toLowerCase().includes(q))
      );
    });
  });

  /** "5 st · 12 300 kr kvar att betala": summan förklarar sig själv efter vad man tittar på. */
  readonly summary = computed(() => {
    const rows = this.shown();
    const sum = kr.transform(rows.reduce((s, o) => s + o.total, 0));
    const what =
      this.status() === 'paid' ? 'betalt' : this.status() === 'all' ? 'totalt' : 'kvar att betala';
    return `${rows.length} st · ${sum} ${what}`;
  });

  constructor() {
    loadInvoices(this.api, this.cardsApi).subscribe({
      next: (l) => {
        this.items.set(l);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(o: InvoiceItem) {
    void this.router.navigate(o.source === 'card' ? ['/sales', o.id] : ['/finance/invoices', o.id]);
  }
}
