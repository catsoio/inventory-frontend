import { appLocale } from '../../core/i18n/locale';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { SalesCardItem } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';

const kr = new KrPipe();
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(appLocale()) : '–';

const statusOf = (c: SalesCardItem) =>
  c.status === 'draft' ? 'Utkast' : c.paidAt ? 'Betald' : 'Obetald';

const COLS: DtCol<SalesCardItem>[] = [
  { key: 'code', label: 'Nr', value: (c) => c.number },
  {
    key: 'date',
    label: 'Datum',
    value: (c) => c.invoicedAt ?? c.createdAt,
    fmt: (c) => day(c.invoicedAt ?? c.createdAt),
  },
  { key: 'customer', label: 'Kund', value: (c) => c.customerName ?? 'Kontant' },
  { key: 'regNo', label: 'Regnr', value: (c) => c.regNo ?? '' },
  { key: 'lines', label: 'Rader', right: true, value: (c) => c.lineCount },
  {
    key: 'total',
    label: 'Att betala',
    right: true,
    value: (c) => c.total,
    fmt: (c) => kr.transform(c.total),
  },
  { key: 'invoice', label: 'Dokument', value: (c) => c.invoiceCode ?? '' },
  { key: 'status', label: 'Status', value: statusOf },
];

type Filter = 'all' | 'draft' | 'unpaid' | 'paid';

/** Alla säljkort: utkast, bokförda och betalda. En affär per kort. */
@Component({
  selector: 'app-sales-list',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-list-page
      title="Försäljning"
      [columns]="cols"
      [rows]="items()"
      [loading]="loading()"
      newLink="/sales/new"
      newLabel="Nytt säljkort"
      emptyText="Inga säljkort än. Skapa ett med knappen, eller från en arbetsorder eller ett däckhotell."
      searchPlaceholder="Sök nummer, kund eller regnr…"
      (search)="q.set($event); load()"
      (rowClick)="router.navigate(['/sales', $event.id])"
    >
      <div class="mb-3 flex shrink-0 flex-wrap items-center gap-3">
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [value]="filter()"
          (change)="filter.set($event.value); load()"
          aria-label="Visa"
        >
          <mat-button-toggle value="all">Alla</mat-button-toggle>
          <mat-button-toggle value="draft">Utkast</mat-button-toggle>
          <mat-button-toggle value="unpaid">Obetalda</mat-button-toggle>
          <mat-button-toggle value="paid">Betalda</mat-button-toggle>
        </mat-button-toggle-group>
        <span class="text-sm text-gray-600">{{ items().length }} st · {{ sum() }}</span>
        <span class="flex-1"></span>
        <a mat-button routerLink="/sales-legacy">
          <mat-icon>history</mat-icon> Äldre försäljningar
        </a>
      </div>
      <!-- Mobil: ett kompakt kort i stället för alla kolumner under varandra. -->
      <ng-template #card let-c="row">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="font-semibold">{{ c.code }}</span>
              <span class="text-xs text-gray-500">{{ dateOf(c) }}</span>
            </div>
            <div class="truncate text-sm text-gray-700">{{ c.customerName ?? 'Kontantkund' }}</div>
            @if (c.regNo) {
              <app-reg-plate class="mt-1" [value]="c.regNo" size="sm" />
            }
          </div>
          <div class="shrink-0 text-right">
            <div class="font-semibold tabular-nums">{{ kr(c.total) }}</div>
            <app-pill
              class="mt-1 inline-block"
              [tone]="c.status === 'draft' ? 'gray' : c.paidAt ? 'green' : 'amber'"
              >{{ statusOf(c) }}</app-pill
            >
          </div>
        </div>
      </ng-template>
      <ng-template #cell let-c="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="c.status === 'draft' ? 'gray' : c.paidAt ? 'green' : 'amber'">{{
            text
          }}</app-pill>
        } @else if (col.key === 'code') {
          {{ c.code }}
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class SalesList {
  private readonly api = inject(SalesCardApi);
  readonly router = inject(Router);
  readonly cols = COLS;
  readonly statusOf = statusOf;
  readonly kr = (ore: number) => kr.transform(ore);
  readonly dateOf = (c: SalesCardItem) => day(c.invoicedAt ?? c.createdAt);
  readonly items = signal<SalesCardItem[]>([]);
  readonly loading = signal(true);
  readonly q = signal('');
  /** Startfilter från adressen (`?show=unpaid`), t.ex. från Hem. */
  readonly filter = signal<Filter>(this.initialFilter());
  readonly sum = computed(() => kr.transform(this.items().reduce((s, c) => s + c.total, 0)));

  constructor() {
    this.load();
  }

  private initialFilter(): Filter {
    const v = inject(ActivatedRoute).snapshot.queryParamMap.get('show');
    return v === 'draft' || v === 'unpaid' || v === 'paid' ? v : 'all';
  }

  load() {
    const f = this.filter();
    this.loading.set(true);
    this.api
      .list({
        q: this.q() || undefined,
        status: f === 'draft' ? 'draft' : undefined,
        paid: f === 'paid' ? true : f === 'unpaid' ? false : undefined,
        limit: 100,
      })
      .subscribe({
        next: (p) => {
          this.items.set(p.items);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
