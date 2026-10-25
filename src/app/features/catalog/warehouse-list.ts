import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { CatalogApi } from '../../core/api/catalog-api';
import { Warehouse } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';

const COLS: DtCol<Warehouse>[] = [
  { key: 'code', label: 'Nr', value: (w) => w.number, fmt: (w) => w.code },
  { key: 'name', label: 'Lager', value: (w) => w.name },
  {
    key: 'kind',
    label: 'Typ',
    value: (w) => w.kind,
    fmt: (w) => (w.kind === 'own' ? 'Eget lager' : 'Kundgods'),
  },
  {
    key: 'places',
    label: 'Platser',
    right: true,
    value: (w) => w.locations.length,
  },
  { key: 'status', label: 'Status', value: (w) => (w.active ? 'Aktiv' : 'Arkiverad') },
];

@Component({
  selector: 'app-warehouse-list',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      title="Lager"
      [columns]="cols"
      [rows]="shown()"
      [loading]="loading()"
      [newLink]="admin ? '/warehouses/new' : null"
      newLabel="Nytt lager"
      emptyText="Inga än, t.ex. Huvudlager, Däckhotellet."
      searchPlaceholder="Sök lager eller plats…"
      [archivable]="true"
      (search)="query.set($event)"
      (archivedChange)="archived.set($event); load()"
      (rowClick)="open($event)"
    >
      <ng-template #cell let-w="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="w.active ? 'green' : 'gray'">{{ text }}</app-pill>
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class WarehouseList {
  private readonly auth = inject(Auth);
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(CatalogApi);
  private readonly router = inject(Router);

  readonly cols = COLS;
  private readonly items = signal<Warehouse[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly archived = signal(false);
  readonly shown = computed(() => {
    const q = this.query().toLowerCase();
    return this.items().filter(
      (w) =>
        !q ||
        `${w.name} ${w.code} ${w.locations.map((l) => l.name).join(' ')}`.toLowerCase().includes(q),
    );
  });

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.warehouses(this.archived()).subscribe((r) => {
      this.items.set(r);
      this.loading.set(false);
    });
  }

  open(w: Warehouse) {
    void this.router.navigate(['/warehouses', w.id]);
  }
}
