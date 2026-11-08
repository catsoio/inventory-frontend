import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { appLocale } from '../../core/i18n/locale';
import { PurchaseCardApi } from '../../core/api/purchase-card-api';
import { PurchaseCard } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import { SharedModule } from '../../shared/shared-module';

const kr = new KrPipe();
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(appLocale()) : '–';

const statusOf = (c: PurchaseCard) => (c.status === 'draft' ? 'Utkast' : 'Bokfört');

const COLS: DtCol<PurchaseCard>[] = [
  { key: 'code', label: 'Nr', value: (c) => c.number },
  {
    key: 'date',
    label: 'Datum',
    value: (c) => c.purchasedAt ?? c.createdAt,
    fmt: (c) => day(c.purchasedAt ?? c.createdAt),
  },
  { key: 'supplier', label: 'Leverantör', value: (c) => c.supplier?.name ?? '' },
  { key: 'reference', label: 'Referens', value: (c) => c.reference ?? '' },
  { key: 'lines', label: 'Rader', right: true, value: (c) => c.lines.length },
  { key: 'units', label: 'Antal', right: true, value: (c) => c.units },
  {
    key: 'total',
    label: 'Summa exkl. moms',
    right: true,
    value: (c) => c.total,
    fmt: (c) => kr.transform(c.total),
  },
  { key: 'document', label: 'Dokument', value: (c) => c.documentCode ?? '' },
  { key: 'status', label: 'Status', value: statusOf },
];

type Filter = 'all' | 'draft' | 'posted';

/** Inköpskorten: utkast och bokförda inköp, en rad per kort, som försäljningslistan. */
@Component({
  selector: 'app-purchase-list',
  imports: [SharedModule],
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-list-page
      title="Inköp"
      [columns]="cols"
      [rows]="items()"
      [loading]="loading()"
      newLink="/purchases/new"
      newLabel="Nytt inköp"
      emptyText="Inga inköp än. Skapa ett med knappen."
      searchPlaceholder="Sök nummer, leverantör eller referens…"
      (search)="q.set($event); load()"
      (rowClick)="router.navigate(['/purchases', $event.id])"
    >
      <div actions>
        <a mat-stroked-button routerLink="/purchases/documents">Äldre inköp</a>
      </div>
      <div class="mb-3 flex shrink-0 flex-wrap items-center gap-3">
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [value]="filter()"
          (change)="filter.set($event.value); load()"
          aria-label="Visa"
        >
          <mat-button-toggle value="all">Alla</mat-button-toggle>
          <mat-button-toggle value="draft">Utkast</mat-button-toggle>
          <mat-button-toggle value="posted">Bokförda</mat-button-toggle>
        </mat-button-toggle-group>
        <span class="text-sm text-gray-600">{{ items().length }} st · {{ sum() }}</span>
      </div>
      <ng-template #card let-c="row">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="font-semibold">{{ c.code }}</span>
              <span class="text-xs text-gray-500">{{ dateOf(c) }}</span>
            </div>
            <div class="truncate text-sm text-gray-700">
              {{ c.supplier?.name ?? 'Okänd leverantör' }}
            </div>
            <div class="text-xs text-gray-500">{{ c.lines.length }} rader, {{ c.units }} st</div>
          </div>
          <div class="shrink-0 text-right">
            <div class="font-semibold tabular-nums">{{ kr(c.total) }}</div>
            <app-pill class="mt-1 inline-block" [tone]="c.status === 'draft' ? 'amber' : 'green'">{{
              statusOf(c)
            }}</app-pill>
          </div>
        </div>
      </ng-template>
      <ng-template #cell let-c="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="c.status === 'draft' ? 'amber' : 'green'">{{ text }}</app-pill>
        } @else if (col.key === 'code') {
          {{ c.code }}
        } @else if (col.key === 'supplier' || col.key === 'reference') {
          {{ text || '–' }}
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class PurchaseList {
  private readonly api = inject(PurchaseCardApi);
  readonly router = inject(Router);
  readonly cols = COLS;
  readonly statusOf = statusOf;
  readonly kr = (ore: number) => kr.transform(ore);
  readonly dateOf = (c: PurchaseCard) => day(c.purchasedAt ?? c.createdAt);
  readonly items = signal<PurchaseCard[]>([]);
  readonly loading = signal(true);
  readonly q = signal('');
  readonly filter = signal<Filter>(this.initialFilter());
  readonly sum = computed(() => kr.transform(this.items().reduce((s, c) => s + c.total, 0)));

  constructor() {
    this.load();
  }

  private initialFilter(): Filter {
    const v = inject(ActivatedRoute).snapshot.queryParamMap.get('show');
    return v === 'draft' || v === 'posted' ? v : 'all';
  }

  load() {
    const f = this.filter();
    this.loading.set(true);
    this.api
      .list({
        q: this.q() || undefined,
        status: f === 'all' ? undefined : f,
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
