import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { CUSTOMER_TYPE_LABELS, Customer } from '../../../core/models';
import { DtCol } from '../../../shared/data-table/data-table';

const COLS: DtCol<Customer>[] = [
  { key: 'code', label: 'Nr', value: (c) => c.number, fmt: (c) => c.code },
  { key: 'name', label: 'Namn', value: (c) => c.name },
  { key: 'type', label: 'Typ', value: (c) => CUSTOMER_TYPE_LABELS[c.type] },
  { key: 'phone', label: 'Telefon', value: (c) => c.phone ?? '', fmt: (c) => c.phone || '–' },
  { key: 'email', label: 'E-post', value: (c) => c.email ?? '', fmt: (c) => c.email || '–' },
  { key: 'status', label: 'Status', value: (c) => (c.active ? 'Aktiv' : 'Arkiverad') },
];

@Component({
  selector: 'app-customer-list',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      title="Kunder"
      [columns]="cols"
      [rows]="items()"
      [loading]="loading()"
      newLink="/customers/new"
      newLabel="Ny kund"
      emptyText="Inga kunder hittades."
      searchPlaceholder="Sök namn, telefon, e-post eller KU-nummer…"
      [archivable]="true"
      (search)="query.set($event); load()"
      (archivedChange)="archived.set($event); load()"
      (rowClick)="open($event)"
    >
      <ng-template #cell let-c="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="c.active ? 'green' : 'gray'">{{ text }}</app-pill>
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class CustomerList {
  private readonly api = inject(WorkshopApi);
  private readonly router = inject(Router);

  readonly cols = COLS;
  readonly items = signal<Customer[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly archived = signal(false);

  load() {
    this.loading.set(true);
    this.api
      .customers({ q: this.query(), includeArchived: this.archived(), limit: 100 })
      .subscribe((p) => {
        this.items.set(p.items);
        this.loading.set(false);
      });
  }

  open(c: Customer) {
    this.router.navigate(['/customers', c.id]);
  }
}
