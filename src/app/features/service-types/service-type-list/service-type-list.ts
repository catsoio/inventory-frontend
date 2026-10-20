import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../../core/auth/auth';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { ServiceType } from '../../../core/models';
import { DtCol } from '../../../shared/data-table/data-table';
import { KrPipe } from '../../../shared/kr-pipe';

const kr = new KrPipe();

const COLS: DtCol<ServiceType>[] = [
  { key: 'code', label: 'Nr', value: (t) => t.number, fmt: (t) => t.code },
  { key: 'name', label: 'Åtgärd', value: (t) => t.name },
  {
    key: 'minutes',
    label: 'Standardtid',
    right: true,
    value: (t) => t.durationMinutes,
    fmt: (t) => `${t.durationMinutes} min`,
  },
  {
    key: 'price',
    label: 'Pris inkl. moms',
    right: true,
    value: (t) => t.priceFrom ?? 0,
    fmt: (t) =>
      t.priceFrom === null
        ? '–'
        : kr.transform(t.priceFrom) +
          (t.priceTo !== null && t.priceTo !== t.priceFrom ? ` – ${kr.transform(t.priceTo)}` : ''),
  },
  { key: 'status', label: 'Status', value: (t) => (t.active ? 'Aktiv' : 'Arkiverad') },
];

@Component({
  selector: 'app-service-type-list',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      title="Åtgärder"
      [columns]="cols"
      [rows]="shown()"
      [loading]="loading()"
      [newLink]="admin ? '/service-types/new' : null"
      newLabel="Ny åtgärd"
      emptyText="Inga än, t.ex. Däckbyte, Service, Hjulinställning."
      searchPlaceholder="Sök åtgärd eller nummer…"
      [archivable]="true"
      (search)="query.set($event)"
      (archivedChange)="archived.set($event); load()"
      (rowClick)="open($event)"
    >
      <ng-template #cell let-t="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="t.active ? 'green' : 'gray'">{{ text }}</app-pill>
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class ServiceTypeList {
  private readonly auth = inject(Auth);
  /** Bara ägare lägger till och ändrar. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(WorkshopApi);
  private readonly router = inject(Router);

  readonly cols = COLS;
  private readonly items = signal<ServiceType[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly archived = signal(false);
  readonly shown = computed(() => {
    const q = this.query().toLowerCase();
    return this.items().filter((t) => !q || `${t.name} ${t.code}`.toLowerCase().includes(q));
  });

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.serviceTypes(this.archived()).subscribe((r) => {
      this.items.set(r);
      this.loading.set(false);
    });
  }

  open(t: ServiceType) {
    this.router.navigate(['/service-types', t.id]);
  }
}
