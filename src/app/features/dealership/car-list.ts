import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CarApi } from '../../core/api/car-api';
import { CarListing, LISTING_STATUS_LABELS, ListingStatus } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';

const kr = new KrPipe();

const TONE: Record<ListingStatus, 'green' | 'amber' | 'gray' | 'blue'> = {
  active: 'green',
  reserved: 'amber',
  draft: 'gray',
  sold: 'blue',
};

const COLS: DtCol<CarListing>[] = [
  { key: 'regNo', label: 'Regnr', value: (c) => c.regNo },
  { key: 'car', label: 'Bil', value: (c) => c.heading },
  {
    key: 'year',
    label: 'År',
    right: true,
    value: (c) => c.year ?? 0,
    fmt: (c) => `${c.year ?? '–'}`,
  },
  {
    key: 'mileage',
    label: 'Mil',
    right: true,
    value: (c) => c.mileageKm ?? 0,
    // Svenskar anger miltal i mil (10 km); registret och databasen har km.
    fmt: (c) =>
      c.mileageKm == null ? '–' : `${Math.round(c.mileageKm / 10).toLocaleString('sv-SE')}`,
  },
  {
    key: 'price',
    label: 'Pris inkl. moms',
    right: true,
    value: (c) => c.price ?? 0,
    fmt: (c) => (c.price == null ? 'På förfrågan' : kr.transform(c.price)),
  },
  { key: 'status', label: 'Status', value: (c) => LISTING_STATUS_LABELS[c.status] },
  {
    key: 'inquiries',
    label: 'Frågor',
    right: true,
    value: (c) => c.inquiries.length,
    fmt: (c) => (c.inquiries.length ? `${c.inquiries.length}` : ''),
  },
];

/** Bilhandel: bilarna verkstaden har till salu. Listan är personalens; kunderna ser webbplatsen. */
@Component({
  selector: 'app-car-list',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      title="Bilhandel"
      [columns]="cols"
      [rows]="shown()"
      [loading]="loading()"
      newLink="/dealership/new"
      newLabel="Ny bil"
      emptyText="Inga bilar än. Skriv ett registreringsnummer så hämtas uppgifterna."
      searchPlaceholder="Sök regnr, märke eller modell…"
      [defaultSort]="null"
      (search)="query.set($event)"
      (rowClick)="open($event)"
    >
      <ng-container actions>
        <select
          class="h-10 px-2 text-sm field"
          aria-label="Visa"
          [value]="status()"
          (change)="status.set($any($event.target).value)"
        >
          <option value="">Alla</option>
          @for (s of statuses; track s.value) {
            <option [value]="s.value">{{ s.label }}</option>
          }
        </select>
        <a mat-stroked-button routerLink="/dealership/site">
          <mat-icon>language</mat-icon> Webbplats
        </a>
      </ng-container>
      <ng-template #cell let-c="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="tone(c.status)">{{ text }}</app-pill>
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class CarList {
  private readonly api = inject(CarApi);
  private readonly router = inject(Router);

  readonly cols = COLS;
  readonly statuses = (Object.entries(LISTING_STATUS_LABELS) as [ListingStatus, string][]).map(
    ([value, label]) => ({ value, label }),
  );
  private readonly items = signal<CarListing[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly status = signal<'' | ListingStatus>('');
  readonly shown = computed(() => {
    const q = this.query().toLowerCase();
    const s = this.status();
    return this.items().filter(
      (c) => (!s || c.status === s) && (!q || `${c.regNo} ${c.heading}`.toLowerCase().includes(q)),
    );
  });

  constructor() {
    this.api.list().subscribe((r) => {
      this.items.set(r);
      this.loading.set(false);
    });
  }

  tone(s: ListingStatus) {
    return TONE[s];
  }

  open(c: CarListing) {
    this.router.navigate(['/dealership', c.id]);
  }
}
