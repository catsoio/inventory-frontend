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
      <!-- Mobil: namn och nummer med en knapp för att ringa direkt. -->
      <ng-template #card let-c="row">
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <div class="truncate font-semibold">{{ c.name }}</div>
            <div class="truncate text-sm text-gray-600">{{ c.phone || 'Inget telefonnummer' }}</div>
            <div class="truncate text-xs text-gray-500">
              {{ c.code }} · {{ typeLabel(c) }}{{ c.active ? '' : ' · Arkiverad' }}
            </div>
          </div>
          @if (c.phone) {
            <a
              [href]="'tel:' + c.phone"
              class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"
              [attr.aria-label]="'Ring ' + c.name"
              (click)="$event.stopPropagation()"
            >
              <mat-icon>call</mat-icon>
            </a>
          }
        </div>
      </ng-template>
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
  readonly typeLabel = (c: Customer) => CUSTOMER_TYPE_LABELS[c.type];
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
