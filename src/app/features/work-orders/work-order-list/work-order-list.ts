import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { Auth } from '../../../core/auth/auth';
import { WORK_ORDER_STATUS_LABELS, WorkOrder, WorkOrderStatus } from '../../../core/models';
import { DtCol } from '../../../shared/data-table/data-table';

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '–');

const COLS: DtCol<WorkOrder>[] = [
  { key: 'code', label: 'Nr', value: (o) => o.number, fmt: (o) => o.code },
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
    key: 'pickup',
    label: 'Klar senast',
    value: (o) => o.pickupAt ?? '',
    fmt: (o) => date(o.pickupAt),
  },
  { key: 'status', label: 'Status', value: (o) => WORK_ORDER_STATUS_LABELS[o.status] },
];

const TONES: Record<string, 'blue' | 'amber' | 'green' | 'gray'> = {
  open: 'blue',
  in_progress: 'amber',
  waiting_parts: 'amber',
  done: 'green',
  cancelled: 'gray',
};

@Component({
  selector: 'app-work-order-list',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      class="min-w-0"
      title="Arbetsorder"
      [columns]="cols"
      [rows]="items()"
      [loading]="loading()"
      newLink="/workorders/new"
      newLabel="Ny arbetsorder"
      emptyText="Inga arbetsorder hittades."
      searchPlaceholder="Sök kund, regnr, mekaniker eller AO-nummer…"
      (search)="query.set($event); load()"
      [highlight]="isSelected"
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
        <mat-button-toggle value="waiting_parts">Väntar på del</mat-button-toggle>
        <mat-button-toggle value="done">Klara</mat-button-toggle>
        <mat-button-toggle value="action">Behöver åtgärd</mat-button-toggle>
      </mat-button-toggle-group>
      <ng-template #cell let-o="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="tones[o.status]">{{ text }}</app-pill>
          @if (o.hasMissing && o.status !== 'done' && o.status !== 'cancelled') {
            <app-pill tone="amber" class="ml-1">Del saknas</app-pill>
          }
        } @else if (col.key === 'regNo') {
          <app-reg-plate [value]="text" size="sm" />
        } @else {
          {{ text }}
        }
      </ng-template>
      <aside
        detail
        class="hidden min-h-0 w-[38%] max-w-[32rem] min-w-[24rem] shrink-0 overflow-y-auto lg:block"
      >
        @if (selected(); as id) {
          <app-work-order-quick [orderId]="id" (changed)="load()" />
        } @else {
          <div
            class="flex flex-col items-center gap-2 rounded-xl bg-white p-10 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/5"
          >
            <mat-icon class="!h-10 !w-10 !text-4xl text-gray-300">handyman</mat-icon>
            Välj en arbetsorder i listan för att byta status och mekaniker, bocka av rader och lägga
            till rader här.
          </div>
        }
      </aside>
    </app-list-page>
  `,
})
export class WorkOrderList {
  private readonly api = inject(WorkOrderApi);
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);

  constructor() {
    // Mekanikern arbetar från sin egen mobillista, inte planeringstabellen.
    if (this.auth.isMechanic()) this.router.navigateByUrl('/workorders/mine', { replaceUrl: true });
  }

  readonly cols = COLS;
  readonly tones = TONES;
  readonly items = signal<WorkOrder[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly status = signal<WorkOrderStatus | 'action' | ''>('');

  load() {
    this.loading.set(true);
    this.api
      .list({
        q: this.query(),
        // "Behöver åtgärd" = ej klara order med en del som måste beställas.
        status: this.status() === 'action' ? '' : (this.status() as WorkOrderStatus | ''),
        needsAction: this.status() === 'action' || undefined,
        limit: 100,
      })
      .subscribe((p) => {
        this.items.set(p.items);
        this.loading.set(false);
        // En enda träff öppnas direkt i panelen.
        if (p.items.length === 1 && this.wide()) this.selected.set(p.items[0].id);
      });
  }

  private wide = () => window.matchMedia('(min-width: 1024px)').matches;

  /** Order som visas i panelen (bred skärm). */
  readonly selected = signal<string | null>(null);
  readonly isSelected = (o: WorkOrder) => o.id === this.selected();

  /** Bred skärm: visa i panelen. Smal skärm: öppna hela ordern. */
  open(o: WorkOrder) {
    if (this.wide()) this.selected.set(o.id);
    else this.router.navigate(['/workorders', o.id]);
  }
}
