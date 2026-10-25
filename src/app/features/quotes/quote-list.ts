import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { QuoteApi } from '../../core/api/quote-api';
import { appLocale } from '../../core/i18n/locale';
import { QUOTE_STATUS_LABELS, Quote, QuoteShownStatus } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';

const kr = new KrPipe();
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(appLocale()) : '–';

const COLS: DtCol<Quote>[] = [
  { key: 'code', label: 'Nr', value: (q) => q.number },
  {
    key: 'date',
    label: 'Lämnat',
    value: (q) => q.givenAt ?? q.createdAt,
    fmt: (q) => day(q.givenAt),
  },
  { key: 'customer', label: 'Kund', value: (q) => q.customerName },
  { key: 'regNo', label: 'Regnr', value: (q) => q.regNo },
  { key: 'vehicle', label: 'Bil', value: (q) => q.vehicle ?? '' },
  {
    key: 'validUntil',
    label: 'Giltigt till',
    value: (q) => q.validUntil ?? '',
    fmt: (q) => day(q.validUntil),
  },
  {
    key: 'total',
    label: 'Belopp',
    right: true,
    value: (q) => q.total,
    fmt: (q) => kr.transform(q.total),
  },
  { key: 'status', label: 'Status', value: (q) => QUOTE_STATUS_LABELS[q.shownStatus] },
];

const TONES: Record<string, 'gray' | 'amber' | 'green' | 'red'> = {
  draft: 'gray',
  given: 'amber',
  approved: 'green',
  declined: 'red',
  expired: 'gray',
};

type Filter = '' | 'draft' | 'given' | 'approved' | 'declined';

/** Alla kostnadsförslag: utkast, lämnade och besvarade. */
@Component({
  selector: 'app-quote-list',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-list-page
      title="Kostnadsförslag"
      [columns]="cols"
      [rows]="items()"
      [loading]="loading()"
      newLink="/quotes/new"
      newLabel="Nytt förslag"
      emptyText="Inga kostnadsförslag än. Skapa ett med knappen."
      searchPlaceholder="Sök nummer, kund eller regnr…"
      (search)="q.set($event); load()"
      (rowClick)="router.navigate(['/quotes', $event.id])"
    >
      <div class="mb-3 flex shrink-0 flex-wrap items-center gap-3">
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [value]="filter()"
          (change)="filter.set($event.value); load()"
          aria-label="Visa"
        >
          <mat-button-toggle value="">Alla</mat-button-toggle>
          <mat-button-toggle value="draft">Utkast</mat-button-toggle>
          <mat-button-toggle value="given">Väntar på svar</mat-button-toggle>
          <mat-button-toggle value="approved">Godkända</mat-button-toggle>
          <mat-button-toggle value="declined">Nekade</mat-button-toggle>
        </mat-button-toggle-group>
        <span class="text-sm text-gray-600">{{ items().length }} st · {{ sum() }}</span>
      </div>
      <ng-template #cell let-r="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="tones[r.shownStatus]">{{ text }}</app-pill>
        } @else if (col.key === 'code') {
          {{ r.code }}
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class QuoteList {
  private readonly api = inject(QuoteApi);
  readonly router = inject(Router);
  readonly cols = COLS;
  readonly tones = TONES;
  readonly items = signal<Quote[]>([]);
  readonly loading = signal(true);
  readonly q = signal('');
  readonly filter = signal<Filter>('');
  readonly sum = computed(() => kr.transform(this.items().reduce((s, c) => s + c.total, 0)));

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api
      .list({ q: this.q() || undefined, status: this.filter() || undefined, limit: 100 })
      .subscribe({
        next: (p) => {
          this.items.set(p.items);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
