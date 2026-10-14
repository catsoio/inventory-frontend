import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../../core/auth/auth';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { RESOURCE_KIND_LABELS, Resource } from '../../../core/models';
import { DtCol } from '../../../shared/data-table/data-table';

const COLS: DtCol<Resource>[] = [
  { key: 'code', label: 'Nr', value: (r) => r.number, fmt: (r) => r.code },
  { key: 'name', label: 'Namn', value: (r) => r.name },
  { key: 'kind', label: 'Typ', value: (r) => RESOURCE_KIND_LABELS[r.kind] },
  { key: 'color', label: 'Färg', value: (r) => r.color },
  { key: 'status', label: 'Status', value: (r) => (r.active ? 'Aktiv' : 'Arkiverad') },
];

@Component({
  selector: 'app-resource-list',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      title="Mekaniker och platser"
      [columns]="cols"
      [rows]="shown()"
      [loading]="loading()"
      [newLink]="admin ? '/resources/new' : null"
      newLabel="Ny"
      emptyText="Inga än. Lägg till de som jobbar hos er."
      searchPlaceholder="Sök namn eller nummer…"
      [archivable]="true"
      (search)="query.set($event)"
      (archivedChange)="archived.set($event); load()"
      (rowClick)="open($event)"
    >
      <ng-template #cell let-r="row" let-col="col" let-text="text">
        @if (col.key === 'color') {
          <span
            class="inline-block h-4 w-4 rounded-full align-middle"
            [style.background]="text"
          ></span>
        } @else if (col.key === 'status') {
          <app-pill [tone]="r.active ? 'green' : 'gray'">{{ text }}</app-pill>
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class ResourceList {
  private readonly auth = inject(Auth);
  /** Bara ägare lägger till och ändrar. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(WorkshopApi);
  private readonly router = inject(Router);

  readonly cols = COLS;
  private readonly items = signal<Resource[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly archived = signal(false);
  /** Få rader, så sökningen görs här i stället för mot servern. */
  readonly shown = computed(() => {
    const q = this.query().toLowerCase();
    return this.items().filter((r) => !q || `${r.name} ${r.code}`.toLowerCase().includes(q));
  });

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.resources(this.archived()).subscribe((r) => {
      this.items.set(r);
      this.loading.set(false);
    });
  }

  open(r: Resource) {
    this.router.navigate(['/resources', r.id]);
  }
}
