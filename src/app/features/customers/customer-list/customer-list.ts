import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Subject, debounceTime, merge, startWith, switchMap, tap } from 'rxjs';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { CUSTOMER_TYPE_LABELS, Customer } from '../../../core/models';
import { DtCol } from '../../../shared/data-table/data-table';
import { CustomerDialog } from '../../../shared/customer-dialog/customer-dialog';

const COLS: DtCol<Customer>[] = [
  { key: 'code', label: 'Nr', value: (c) => c.number, fmt: (c) => c.code },
  { key: 'name', label: 'Namn', value: (c) => c.name },
  { key: 'type', label: 'Typ', value: (c) => CUSTOMER_TYPE_LABELS[c.type] },
  { key: 'phone', label: 'Telefon', value: (c) => c.phone ?? '', fmt: (c) => c.phone || '–' },
  { key: 'email', label: 'E-post', value: (c) => c.email ?? '', fmt: (c) => c.email || '–' },
  {
    key: 'active',
    label: 'Status',
    value: (c) => (c.active ? 'Aktiv' : 'Arkiverad'),
  },
];

@Component({
  selector: 'app-customer-list',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      <h1 class="mr-2 text-2xl font-semibold">Kunder</h1>
      <div class="relative max-w-md min-w-56 flex-1">
        <mat-icon class="pointer-events-none absolute top-2 left-2 text-gray-400">search</mat-icon>
        <input
          type="search"
          [formControl]="search"
          placeholder="Sök namn, telefon, e-post eller KU-nummer…"
          class="focus:ring-brand h-10 w-full rounded-xl border-0 bg-white pr-3 pl-10 shadow-sm ring-1 ring-gray-200 outline-none focus:ring-2"
        />
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" [checked]="archived()" (change)="toggleArchived()" />
        Visa arkiverade
      </label>
      <span class="flex-1"></span>
      <button mat-flat-button color="primary" (click)="create()">
        <mat-icon>add</mat-icon> Ny kund
      </button>
    </div>
    <app-data-table
      class="min-h-0 flex-1"
      [columns]="cols"
      [rows]="items()"
      [clickable]="true"
      [emptyText]="loading() ? 'Laddar…' : 'Inga kunder hittades.'"
      (rowClick)="open($event)"
    >
      <ng-template #cell let-c="row" let-col="col" let-text="text">
        @if (col.key === 'active') {
          <app-pill [tone]="c.active ? 'green' : 'gray'">{{ text }}</app-pill>
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-data-table>
  `,
})
export class CustomerList implements OnInit {
  private readonly api = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly cols = COLS;
  readonly search = new FormControl('', { nonNullable: true });
  readonly archived = signal(false);
  readonly items = signal<Customer[]>([]);
  readonly loading = signal(true);
  private readonly refresh = new Subject<void>();

  ngOnInit() {
    merge(this.search.valueChanges.pipe(debounceTime(250)), this.refresh)
      .pipe(
        startWith(null),
        tap(() => this.loading.set(true)),
        switchMap(() =>
          this.api.customers({
            q: this.search.value.trim(),
            includeArchived: this.archived(),
            limit: 100,
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((p) => {
        this.items.set(p.items);
        this.loading.set(false);
      });
  }

  toggleArchived() {
    this.archived.update((a) => !a);
    this.refresh.next();
  }

  open(c: Customer) {
    this.router.navigate(['/customers', c.id]);
  }

  create() {
    this.dialog
      .open<CustomerDialog, unknown, Customer>(CustomerDialog, {
        data: { name: this.search.value.trim() },
        width: '560px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((c) => c && this.open(c));
  }
}
