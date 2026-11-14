import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { format, isToday, isYesterday } from 'date-fns';
import { sv } from 'date-fns/locale';
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
  collective: 'samlingsfakturerade',
  'work-orders': 'ändrade arbetsorderna på',
};

/** Tekniska fält som alltid följer med när ett kort sparas och inte berättar något för en människa. */
const HIDDEN_FIELDS = new Set([
  'customerId', 'vehicleId', 'pricesIncludeVat', 'roundToKrona', 'performed', 'warranty',
  'warehouseId', 'locationId', 'sections', 'id',
]);

const FIELD_LABELS: Record<string, string> = {
  lines: 'rader', discount: 'rabatt', note: 'anteckning', notes: 'anteckning', customer: 'kund',
  vehicle: 'bil', contents: 'innehåll', quantity: 'antal', tyres: 'däck', rims: 'fälgar',
  accessories: 'tillbehör', conditionGrade: 'skick', condition: 'skickanmärkning',
  depositedAt: 'inlämnad', expectedPickupAt: 'hämtas', nextPaymentAt: 'nästa betalning',
  fee: 'avgift', paymentStatus: 'betalstatus', paymentMethod: 'betalsätt', paidAt: 'betaldatum',
  name: 'namn', phone: 'telefon', email: 'e-post', address: 'adress', postalCode: 'postnummer',
  city: 'ort', orgNo: 'org.nr', vatNumber: 'momsreg.nr', regNo: 'regnr', color: 'färg',
  price: 'pris', status: 'status', title: 'rubrik', description: 'beskrivning', startAt: 'start',
  endAt: 'slut', start: 'start', end: 'slut', resourceId: 'mekaniker', placeId: 'plats',
  remarks: 'kundanmärkning', jobs: 'jobb', sellPrice: 'försäljningspris', reorderLevel: 'påminnelsenivå',
  paymentTermsDays: 'betalningsvillkor', collectiveInvoice: 'samlingsfaktura',
  labourDiscount: 'arbetsrabatt', partsDiscount: 'delrabatt', contactPerson: 'kontaktperson',
};

export interface LogRow {
  entry: ActivityEntry;
  /** Hur många lika ändringar i rad som slagits ihop till den här. */
  count: number;
  time: Date;
}

export interface LogDay {
  key: string;
  title: string;
  rows: LogRow[];
}

const ENTITY_ROUTE: Record<string, string> = {
  vehicles: '/vehicles',
  customers: '/customers',
  suppliers: '/suppliers',
  storage: '/storage',
  'work-orders': '/workorders',
  'sales-cards': '/sales',
  quotes: '/quotes',
  articles: '/inventory',
  resources: '/resources',
  'service-types': '/service-types',
};

const ENTITY_TONE: Record<string, string> = {
  'sales-cards': 'bg-emerald-50 text-emerald-800',
  sales: 'bg-emerald-50 text-emerald-800',
  closings: 'bg-emerald-50 text-emerald-800',
  storage: 'bg-sky-50 text-sky-800',
  'work-orders': 'bg-amber-50 text-amber-800',
  bookings: 'bg-amber-50 text-amber-800',
  customers: 'bg-violet-50 text-violet-800',
  vehicles: 'bg-violet-50 text-violet-800',
};

const KINDS = [
  { value: '', label: 'Allt' },
  { value: 'create', label: 'Nytt' },
  { value: 'update', label: 'Ändringar' },
  { value: 'delete', label: 'Borttaget' },
];

@Component({
  selector: 'app-activity',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <h1 class="mb-1 shrink-0 text-2xl font-semibold">Aktivitetslogg</h1>
    <p class="mb-4 shrink-0 text-sm text-gray-500">Vem som lagt till, ändrat och tagit bort vad.</p>

    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-3">
      <input
        class="h-11 w-64 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-teal-600"
        placeholder="Sök regnr, kund, nummer, person…"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
      <mat-form-field class="w-52">
        <mat-label>Gäller</mat-label>
        <mat-select [value]="entity()" (selectionChange)="filter($event.value)">
          <mat-option [value]="''">Allt</mat-option>
          @for (e of entities; track e[0]) {
            <mat-option [value]="e[0]">{{ e[1] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <div class="flex overflow-hidden rounded-lg border border-gray-300 bg-white text-sm">
        @for (k of kinds; track k.value) {
          <button
            type="button"
            class="px-3 py-2.5"
            [class.bg-teal-50]="kind() === k.value"
            [class.font-medium]="kind() === k.value"
            (click)="kind.set(k.value)"
          >
            {{ k.label }}
          </button>
        }
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      @for (d of days(); track d.key) {
        <div class="sticky top-0 z-10 bg-gray-50 px-1 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          {{ d.title }}
        </div>
        <div class="mb-3 divide-y divide-gray-100 rounded-xl bg-white shadow-sm">
          @for (r of d.rows; track r.entry.id) {
            <div class="flex items-start gap-3 px-4 py-3">
              <div class="w-12 shrink-0 pt-0.5 text-sm text-gray-500 tabular-nums">
                {{ r.time | date: 'HH:mm' }}
              </div>
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600"
                [title]="r.entry.actorName || 'System'"
              >
                {{ initials(r.entry) }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm">
                  <span class="font-medium">{{ who(r.entry) }}</span>
                  <span class="text-gray-700"> {{ verb(r.entry) }}</span>
                  <span class="ml-1 rounded-md px-1.5 py-0.5 text-xs" [class]="tone(r.entry)">{{ entityName(r.entry) }}</span>
                  @if (link(r.entry); as l) {
                    <a [routerLink]="l" class="ml-1 font-medium text-teal-700 hover:underline">{{ title(r.entry) }}</a>
                  } @else {
                    <span class="ml-1 font-medium">{{ title(r.entry) }}</span>
                  }
                  @if (r.count > 1) {
                    <span class="ml-1 text-xs text-gray-500">({{ r.count }} gånger)</span>
                  }
                </div>
                @if (detail(r.entry); as det) {
                  <div class="mt-0.5 text-xs text-gray-500">{{ det }}</div>
                }
              </div>
            </div>
          }
        </div>
      } @empty {
        <div class="rounded-xl bg-white px-4 py-8 text-center text-sm text-gray-500 shadow-sm">
          {{ loading() ? 'Hämtar…' : 'Inget loggat än.' }}
        </div>
      }
      @if (more()) {
        <button mat-stroked-button class="mt-1 mb-4" (click)="load(false)" [disabled]="loading()">
          Visa fler
        </button>
      }
    </div>
  `,
})
export class Activity implements OnInit {
  private readonly api = inject(ActivityApi);
  readonly entities = Object.entries(ENTITY_LABELS).filter(([k]) => k !== 'preferences');
  readonly kinds = KINDS;
  readonly rows = signal<ActivityEntry[]>([]);
  readonly more = signal(false);
  readonly loading = signal(false);
  readonly entity = signal('');
  readonly kind = signal('');
  readonly query = signal('');

  /** Filtrerat, ihopslaget (samma person ändrar samma sak flera gånger i rad) och grupperat per dag. */
  readonly days = computed<LogDay[]>(() => {
    const q = this.query().trim().toLowerCase();
    const kind = this.kind();
    const out: LogDay[] = [];
    let prev: LogRow | null = null;
    for (const e of this.rows()) {
      if (kind && e.action !== kind) continue;
      if (q && !`${e.label ?? ''} ${e.actorName ?? ''} ${this.entityName(e)}`.toLowerCase().includes(q)) continue;
      const time = new Date(e.createdAt);
      const key = format(time, 'yyyy-MM-dd');
      let day = out[out.length - 1];
      if (!day || day.key !== key) {
        day = { key, title: this.dayTitle(time), rows: [] };
        out.push(day);
        prev = null;
      }
      const same =
        prev &&
        prev.entry.action === 'update' &&
        e.action === 'update' &&
        prev.entry.actorId === e.actorId &&
        prev.entry.entity === e.entity &&
        prev.entry.entityId === e.entityId &&
        prev.time.getTime() - time.getTime() < 15 * 60_000;
      if (same && prev) {
        prev.count++;
        continue;
      }
      prev = { entry: e, count: 1, time };
      day.rows.push(prev);
    }
    return out;
  });

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

  private dayTitle(d: Date): string {
    if (isToday(d)) return 'Idag';
    if (isYesterday(d)) return 'Igår';
    return format(d, 'EEEE d MMMM yyyy', { locale: sv });
  }

  who(r: ActivityEntry): string {
    const n = r.actorName || 'System';
    return n.includes('@') ? n.split('@')[0] : n;
  }

  initials(r: ActivityEntry): string {
    return this.who(r).slice(0, 2).toUpperCase();
  }

  verb(r: ActivityEntry): string {
    return ACTION_LABELS[r.action] ?? r.action;
  }

  tone(r: ActivityEntry): string {
    return ENTITY_TONE[r.entity] ?? 'bg-gray-100 text-gray-700';
  }

  entityName(r: ActivityEntry): string {
    return ENTITY_LABELS[r.entity] ?? r.entity;
  }

  /** "SK-00019 · KKT796 · #19": löpnumret efter punkten är dubblettinformation och tas bort. */
  title(r: ActivityEntry): string {
    return (r.label ?? '').split(' · ').filter((p) => !/^#\d+$/.test(p)).join(' · ') || '';
  }

  link(r: ActivityEntry): string[] | null {
    const base = ENTITY_ROUTE[r.entity];
    return base && r.entityId && r.action !== 'delete' ? [base, r.entityId] : null;
  }

  /** Vad som ändrats, i klartext. Ett helt formulär som sparats berättar inget, så det sägs bara en gång. */
  detail(r: ActivityEntry): string {
    if (r.action !== 'update') return '';
    const names = [
      ...new Set(
        r.fields.filter((f) => !HIDDEN_FIELDS.has(f)).map((f) => FIELD_LABELS[f] ?? f),
      ),
    ];
    if (!names.length) return r.fields.length ? 'Sparade kortet' : '';
    if (names.length > 6) return 'Sparade kortet';
    return `Ändrade ${names.join(', ')}`;
  }
}
