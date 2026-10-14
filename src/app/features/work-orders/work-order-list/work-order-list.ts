import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { WORK_ORDER_STATUS_LABELS, WorkOrder, WorkOrderStatus } from '../../../core/models';
import { DtCol } from '../../../shared/data-table/data-table';
import { KrPipe } from '../../../shared/kr-pipe';

const kr = new KrPipe();
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '–');

const COLS: DtCol<WorkOrder>[] = [
  { key: 'code', label: 'Nr', value: (o) => o.number, fmt: (o) => o.code },
  {
    key: 'received',
    label: 'Inlämnad',
    value: (o) => o.receivedAt,
    fmt: (o) => date(o.receivedAt),
  },
  { key: 'pickup', label: 'Hämtas', value: (o) => o.pickupAt ?? '', fmt: (o) => date(o.pickupAt) },
  { key: 'regNo', label: 'Regnr', value: (o) => o.regNo },
  { key: 'car', label: 'Bil', value: (o) => o.vehicle ?? '', fmt: (o) => o.vehicle || '–' },
  { key: 'customer', label: 'Kund', value: (o) => o.customerName },
  {
    key: 'resource',
    label: 'Mekaniker',
    value: (o) => o.resourceName ?? '',
    fmt: (o) => o.resourceName || '–',
  },
  {
    key: 'price',
    label: 'Pris exkl. moms',
    right: true,
    value: (o) => o.quote ?? o.priceFrom ?? 0,
    fmt: (o) =>
      o.quote !== null
        ? kr.transform(o.quote)
        : o.priceFrom === null
          ? '–'
          : kr.transform(o.priceFrom) +
            (o.priceTo !== null && o.priceTo !== o.priceFrom
              ? ` – ${kr.transform(o.priceTo)}`
              : ''),
  },
  { key: 'status', label: 'Status', value: (o) => WORK_ORDER_STATUS_LABELS[o.status] },
];

const TONES: Record<string, 'blue' | 'amber' | 'green' | 'gray'> = {
  open: 'blue',
  in_progress: 'amber',
  done: 'green',
  cancelled: 'gray',
};

@Component({
  selector: 'app-work-order-list',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      title="Arbetsorder"
      [columns]="cols"
      [rows]="items()"
      [loading]="loading()"
      newLink="/workorders/new"
      newLabel="Ny arbetsorder"
      emptyText="Inga arbetsorder hittades."
      searchPlaceholder="Sök kund, regnr, mekaniker eller AO-nummer…"
      (search)="query.set($event); load()"
      (rowClick)="open($event)"
    >
      <mat-button-toggle-group
        class="mb-3 self-start"
        hideSingleSelectionIndicator
        [value]="status()"
        (change)="status.set($event.value); load()"
        aria-label="Status"
      >
        <mat-button-toggle value="">Alla</mat-button-toggle>
        <mat-button-toggle value="open">Öppna</mat-button-toggle>
        <mat-button-toggle value="in_progress">Pågår</mat-button-toggle>
        <mat-button-toggle value="done">Klara</mat-button-toggle>
      </mat-button-toggle-group>
      <ng-template #cell let-o="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="tones[o.status]">{{ text }}</app-pill>
        } @else if (col.key === 'regNo') {
          <app-reg-plate [value]="text" size="sm" />
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class WorkOrderList {
  private readonly api = inject(WorkOrderApi);
  private readonly router = inject(Router);

  readonly cols = COLS;
  readonly tones = TONES;
  readonly items = signal<WorkOrder[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly status = signal<WorkOrderStatus | ''>('');

  load() {
    this.loading.set(true);
    this.api.list({ q: this.query(), status: this.status(), limit: 100 }).subscribe((p) => {
      this.items.set(p.items);
      this.loading.set(false);
    });
  }

  open(o: WorkOrder) {
    this.router.navigate(['/workorders', o.id]);
  }
}
