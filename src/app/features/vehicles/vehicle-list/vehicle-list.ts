import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { Vehicle } from '../../../core/models';
import { DtCol } from '../../../shared/data-table/data-table';

const COLS: DtCol<Vehicle>[] = [
  { key: 'code', label: 'Nr', value: (v) => v.number, fmt: (v) => v.code },
  { key: 'regNo', label: 'Regnr', value: (v) => v.regNo },
  {
    key: 'car',
    label: 'Bil',
    value: (v) => [v.make, v.model, v.year].filter(Boolean).join(' '),
    fmt: (v) => [v.make, v.model, v.year].filter(Boolean).join(' ') || '–',
  },
  { key: 'owner', label: 'Ägare', value: (v) => v.customer?.name ?? '' },
  { key: 'notes', label: 'Anmärkning', value: (v) => v.notes ?? '', fmt: (v) => v.notes || '–' },
  { key: 'status', label: 'Status', value: (v) => (v.active ? 'Aktiv' : 'Arkiverad') },
];

@Component({
  selector: 'app-vehicle-list',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      title="Bilar"
      [columns]="cols"
      [rows]="items()"
      [loading]="loading()"
      newLink="/vehicles/new"
      newLabel="Ny bil"
      emptyText="Inga bilar hittades."
      searchPlaceholder="Sök regnr, märke, modell eller chassinummer…"
      [archivable]="true"
      (search)="query.set($event); load()"
      (archivedChange)="archived.set($event); load()"
      (rowClick)="open($event)"
    >
      <!-- Mobil: skylt, bil och ägare med en knapp för att ringa ägaren. -->
      <ng-template #card let-v="row">
        <div class="flex items-center gap-3">
          <app-reg-plate [value]="v.regNo" class="shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium">{{ car(v) }}</div>
            <div class="truncate text-sm text-gray-600">{{ v.customer?.name || '–' }}</div>
          </div>
          @if (v.customer?.phone) {
            <a
              [href]="'tel:' + v.customer.phone"
              class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"
              [attr.aria-label]="'Ring ' + v.customer.name"
              (click)="$event.stopPropagation()"
            >
              <mat-icon>call</mat-icon>
            </a>
          }
        </div>
      </ng-template>
      <ng-template #cell let-v="row" let-col="col" let-text="text">
        @if (col.key === 'regNo') {
          <app-reg-plate [value]="text" size="sm" />
        } @else if (col.key === 'status') {
          <app-pill [tone]="v.active ? 'green' : 'gray'">{{ text }}</app-pill>
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class VehicleList {
  private readonly api = inject(WorkshopApi);
  private readonly router = inject(Router);

  readonly cols = COLS;
  readonly car = (v: Vehicle) => [v.make, v.model, v.year].filter(Boolean).join(' ') || '–';
  readonly items = signal<Vehicle[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly archived = signal(false);

  load() {
    this.loading.set(true);
    this.api
      .vehicles({ q: this.query(), includeArchived: this.archived(), limit: 100 })
      .subscribe((p) => {
        this.items.set(p.items);
        this.loading.set(false);
      });
  }

  open(v: Vehicle) {
    this.router.navigate(['/vehicles', v.id]);
  }
}
