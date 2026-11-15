import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { appLocale } from '../../core/i18n/locale';
import {
  TOW_KIND_LABELS,
  TOW_STATUS_LABELS,
  TowApi,
  TowJob,
  TowStatus,
  TowSummary,
} from '../../core/api/tow-api';
import { DtCol } from '../../shared/data-table/data-table';
import type { PillTone } from '../../shared/pill/pill';

const when = (iso: string) =>
  new Date(iso).toLocaleString(appLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const COLS: DtCol<TowJob>[] = [
  { key: 'code', label: 'Nr', value: (j) => j.number, fmt: (j) => j.code },
  { key: 'when', label: 'Inkom', value: (j) => j.requestedAt, fmt: (j) => when(j.requestedAt) },
  { key: 'kind', label: 'Typ', value: (j) => TOW_KIND_LABELS[j.kind] },
  { key: 'customer', label: 'Kund', value: (j) => j.customerName },
  { key: 'regNo', label: 'Regnr', value: (j) => j.regNo ?? '' },
  { key: 'from', label: 'Hämtas', value: (j) => j.pickupAddress ?? '' },
  { key: 'to', label: 'Körs till', value: (j) => j.destination ?? '' },
  { key: 'status', label: 'Status', value: (j) => TOW_STATUS_LABELS[j.status] },
];

const TONES: Record<string, PillTone> = {
  new: 'amber',
  on_the_way: 'blue',
  done: 'green',
  cancelled: 'gray',
};

type Filter = 'open' | 'done' | 'cancelled' | '';
const FILTERS: Filter[] = ['open', 'done', 'cancelled', ''];

/** Bärgningsuppdragen: de som pågår först, klara och avbrutna under egna val. */
@Component({
  selector: 'app-tow-list',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-list-page
      class="min-h-0 flex-1"
      title="Bärgning"
      [columns]="cols"
      [rows]="items()"
      [loading]="loading()"
      newLink="/towing/new"
      newLabel="Nytt uppdrag"
      emptyText="Inga uppdrag här. Lägg in ett samtal med knappen."
      searchPlaceholder="Sök kund, regnr, telefon eller adress…"
      (search)="q.set($event); load()"
      (rowClick)="router.navigate(['/towing', $event.id])"
    >
      <app-segmented
        filters
        label="Visa"
        [options]="[
          { value: 'open', label: 'Pågår' },
          { value: 'done', label: 'Klara' },
          { value: 'cancelled', label: 'Avbrutna' },
          { value: '', label: 'Alla' },
        ]"
        [value]="filter()"
        (valueChange)="filter.set($any($event)); load()"
      />
      <app-summary>
        {{ items().length }} uppdrag
        @if (summary(); as s) {
          @if (s.new) {
            <span class="ml-2 text-amber-700">{{ s.new }} nya</span>
          }
        }
      </app-summary>
      <ng-template #cell let-r="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="tones[r.status]">{{ text }}</app-pill>
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class TowList {
  private readonly api = inject(TowApi);
  readonly router = inject(Router);
  readonly cols = COLS;
  readonly tones = TONES;
  readonly items = signal<TowJob[]>([]);
  readonly summary = signal<TowSummary | null>(null);
  readonly loading = signal(true);
  readonly q = signal('');
  readonly filter = signal<Filter>('open');

  load() {
    this.loading.set(true);
    const status = this.filter() || undefined;
    this.api.list({ q: this.q() || undefined, status: status as Filter & TowStatus }).subscribe({
      next: (p) => {
        this.items.set(p.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.summary().subscribe({ next: (s) => this.summary.set(s), error: () => undefined });
  }
}
