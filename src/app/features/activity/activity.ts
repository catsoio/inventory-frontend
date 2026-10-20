import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivityApi, ActivityEntry } from '../../core/api/activity-api';

const PAGE = 50;

/** Vad som ändrats, på svenska. Okända sorter visas som de heter. */
export const ENTITY_LABELS: Record<string, string> = {
  vehicles: 'Bil',
  customers: 'Kund',
  suppliers: 'Leverantör',
  storage: 'Däckhotell',
  bookings: 'Bokning',
  'work-orders': 'Arbetsorder',
  articles: 'Artikel',
  sales: 'Försäljning',
  'sales-cards': 'Säljkort',
  purchases: 'Inköp',
  resources: 'Mekaniker/plats',
  'service-types': 'Åtgärd',
  closings: 'Bokföring',
  settings: 'Inställningar',
  preferences: 'Inställningar',
  garage: 'Verkstad',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'lade till',
  update: 'ändrade',
  delete: 'tog bort',
  pay: 'markerade som betald',
  post: 'bokförde',
  pickup: 'lämnade ut',
  reopen: 'återöppnade',
  restore: 'återställde',
  receive: 'tog in',
  sell: 'sålde',
  return: 'tog emot retur på',
  'write-off': 'kasserade',
  adjust: 'inventerade',
  void: 'annullerade',
  reset: 'nollställde',
  block: 'blockerade',
  unblock: 'avblockerade',
  password: 'bytte lösenord för',
  'from-booking': 'skapade från bokning',
};

@Component({
  selector: 'app-activity',
  standalone: false,
  template: `
    <h1 class="mb-1 text-2xl font-semibold">Aktivitetslogg</h1>
    <p class="mb-4 text-sm text-gray-500">Vem som lagt till, ändrat och tagit bort vad.</p>

    <mat-form-field class="mb-2 w-60">
      <mat-label>Visa</mat-label>
      <mat-select [value]="entity()" (selectionChange)="filter($event.value)">
        <mat-option [value]="''">Allt</mat-option>
        @for (e of entities; track e[0]) {
          <mat-option [value]="e[0]">{{ e[1] }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <div class="overflow-x-auto rounded-xl bg-white shadow-sm">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-gray-200 text-xs text-gray-500">
          <tr>
            <th class="px-4 py-2 font-medium">Tid</th>
            <th class="px-4 py-2 font-medium">Vem</th>
            <th class="px-4 py-2 font-medium">Gjorde</th>
            <th class="px-4 py-2 font-medium">På</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr class="border-t border-gray-100">
              <td class="px-4 py-2 whitespace-nowrap tabular-nums">
                {{ r.createdAt | date: 'yyyy-MM-dd HH:mm' }}
              </td>
              <td class="px-4 py-2">{{ r.actorName || 'System' }}</td>
              <td class="px-4 py-2">{{ action(r) }}</td>
              <td class="px-4 py-2">
                <span class="text-gray-500">{{ entityName(r) }}</span>
                @if (r.label) {
                  <span class="ml-1 font-medium">{{ r.label }}</span>
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="4" class="px-4 py-6 text-center text-gray-500">
                {{ loading() ? 'Hämtar…' : 'Inget loggat än.' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    @if (more()) {
      <button mat-stroked-button class="mt-3" (click)="load(false)" [disabled]="loading()">
        Visa fler
      </button>
    }
  `,
})
export class Activity implements OnInit {
  private readonly api = inject(ActivityApi);
  readonly entities = Object.entries(ENTITY_LABELS).filter(([k]) => k !== 'preferences');
  readonly rows = signal<ActivityEntry[]>([]);
  readonly more = signal(false);
  readonly loading = signal(false);
  readonly entity = signal('');

  ngOnInit() {
    this.load(true);
  }

  filter(entity: string) {
    this.entity.set(entity);
    this.load(true);
  }

  load(reset: boolean) {
    this.loading.set(true);
    const offset = reset ? 0 : this.rows().length;
    this.api.list({ entity: this.entity(), limit: PAGE, offset }).subscribe({
      next: (p) => {
        this.rows.set(reset ? p.items : [...this.rows(), ...p.items]);
        this.more.set(this.rows().length < p.pagination.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  action(r: ActivityEntry): string {
    const verb = ACTION_LABELS[r.action] ?? r.action;
    // Vid ändring är det de ändrade fälten som berättar vad som hände.
    return r.action === 'update' && r.fields.length ? `${verb} (${r.fields.join(', ')})` : verb;
  }

  entityName(r: ActivityEntry): string {
    return ENTITY_LABELS[r.entity] ?? r.entity;
  }
}
