import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { CatalogApi } from '../../core/api/catalog-api';
import { ArticleType, SPEC_LABELS } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';

const COLS: DtCol<ArticleType>[] = [
  { key: 'code', label: 'Nr', value: (t) => t.number, fmt: (t) => t.code },
  { key: 'name', label: 'Artikeltyp', value: (t) => t.name },
  { key: 'spec', label: 'Mått', value: (t) => SPEC_LABELS[t.spec] },
  {
    key: 'required',
    label: 'Krävs',
    value: (t) => Object.values(t.fields).filter((m) => m === 'required').length,
    fmt: (t) => requiredText(t),
  },
  { key: 'status', label: 'Status', value: (t) => (t.active ? 'Aktiv' : 'Arkiverad') },
];

const NAMES = {
  brand: 'märke',
  model: 'benämning',
  sku: 'artikelnr',
  supplier: 'leverantör',
  warehouse: 'lager',
} as const;

/** "benämning, artikelnr": de fält som måste fyllas i för typen. */
function requiredText(t: ArticleType) {
  const list = (Object.keys(NAMES) as (keyof typeof NAMES)[])
    .filter((k) => t.fields[k] === 'required')
    .map((k) => NAMES[k]);
  return list.length ? list.join(', ') : '–';
}

@Component({
  selector: 'app-article-type-list',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      title="Artikeltyper"
      [columns]="cols"
      [rows]="shown()"
      [loading]="loading()"
      [newLink]="admin ? '/article-types/new' : null"
      newLabel="Ny artikeltyp"
      emptyText="Inga än."
      searchPlaceholder="Sök artikeltyp…"
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
export class ArticleTypeList {
  private readonly auth = inject(Auth);
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(CatalogApi);
  private readonly router = inject(Router);

  readonly cols = COLS;
  private readonly items = signal<ArticleType[]>([]);
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
    this.api.articleTypes(this.archived()).subscribe((r) => {
      this.items.set(r);
      this.loading.set(false);
    });
  }

  open(t: ArticleType) {
    void this.router.navigate(['/article-types', t.id]);
  }
}
