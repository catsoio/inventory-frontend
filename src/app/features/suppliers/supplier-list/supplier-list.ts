import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { Supplier } from '../../../core/models';
import { DtCol } from '../../../shared/data-table/data-table';

const COLS: DtCol<Supplier>[] = [
  { key: 'code', label: 'Nr', value: (s) => s.number, fmt: (s) => s.code },
  { key: 'name', label: 'Namn', value: (s) => s.name },
  { key: 'orgNo', label: 'Org.nr', value: (s) => s.orgNo ?? '', fmt: (s) => s.orgNo || '–' },
  { key: 'phone', label: 'Telefon', value: (s) => s.phone ?? '', fmt: (s) => s.phone || '–' },
  { key: 'email', label: 'E-post', value: (s) => s.email ?? '', fmt: (s) => s.email || '–' },
  { key: 'status', label: 'Status', value: (s) => (s.active ? 'Aktiv' : 'Arkiverad') },
];

@Component({
  selector: 'app-supplier-list',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      title="Leverantörer"
      [columns]="cols"
      [rows]="items()"
      [loading]="loading()"
      newLink="/suppliers/new"
      newLabel="Ny leverantör"
      emptyText="Inga leverantörer hittades."
      searchPlaceholder="Sök namn, telefon, e-post eller LEV-nummer…"
      [archivable]="true"
      (search)="query.set($event); load()"
      (archivedChange)="archived.set($event); load()"
      (rowClick)="open($event)"
    >
      <ng-template #cell let-s="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="s.active ? 'green' : 'gray'">{{ text }}</app-pill>
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class SupplierList {
  private readonly api = inject(WorkshopApi);
  private readonly router = inject(Router);

  readonly cols = COLS;
  readonly items = signal<Supplier[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly archived = signal(false);

  load() {
    this.loading.set(true);
    this.api
      .suppliers({ q: this.query(), includeArchived: this.archived(), limit: 100 })
      .subscribe({
        next: (p) => {
          this.items.set(p.items);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  open(s: Supplier) {
    this.router.navigate(['/suppliers', s.id]);
  }
}
