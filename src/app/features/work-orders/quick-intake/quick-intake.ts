import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { catchError, debounceTime, distinctUntilChanged, forkJoin, map, of, switchMap } from 'rxjs';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { plateReaderAvailable } from '../../../core/scan/plate-reader';
import { Scanner } from '../../../core/scan/scanner';
import type {
  Customer,
  ServiceType,
  Vehicle,
  VehicleInfo,
  WorkOrder,
  WorkOrderInput,
} from '../../../core/models';
import { LinkResolver } from '../../../shared/customer-vehicle-picker/link-resolver';
import { SharedModule } from '../../../shared/shared-module';

/** Vad inlämningen blev: ordern som skapades, eller en befintlig order man ville öppna i stället. */
/** `regNo`: skylten är redan skannad (en okänd bil i skanningen), så kameran startas inte. */
export interface QuickIntakeData {
  regNo?: string;
  /** Åtgärden är redan vald (Däckbyte eller en åtgärd ur skanningens val). */
  job?: string;
}

export interface QuickIntakeResult {
  id: string;
  code: string;
  /** Sant när man valde att öppna ordern i stället för att skapa en ny. */
  open: boolean;
}

/** Bilen som slagits upp: en vi redan har, eller en ny som skapas tillsammans med ordern. */
type Car =
  | { kind: 'known'; vehicle: Vehicle; customer: Customer | null; openOrder: WorkOrder | null }
  | { kind: 'new'; info: VehicleInfo | null };

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9ÅÄÖ]/g, '');
const digits = (s: string) => s.replace(/\D/g, '');

/** Så många vanliga åtgärder visas som knappar under "Vad ska göras?". */
const SERVICE_CHIPS = 6;

/**
 * Inlämning på mobil: en bil kommer in och man vill ha en order på några sekunder. Skanna skylten
 * (eller skriv numret) och bilen slås upp: känd bil visar kunden och om den redan har en order på
 * gång; okänd bil hämtas ur fordonsregistret och kunden anges med bara ett mobilnummer (finns hon
 * visas hon, annars skapas en ny). Sedan en rad om vad som ska göras, och ordern är skapad, eller
 * skapad och startad. Allt annat (pris, delar, planering) görs på datorn eller på orderkortet.
 */
@Component({
  selector: 'app-quick-intake',
  standalone: true,
  imports: [SharedModule],
  template: `
    <h2 mat-dialog-title>Ny order</h2>
    <mat-dialog-content class="flex flex-col gap-4">
      <!-- 1. Skylten -->
      <div class="flex gap-2">
        <input
          class="field h-14 min-w-0 flex-1 text-center text-2xl font-semibold tracking-[0.2em] uppercase"
          [formControl]="regNo"
          placeholder="ABC123"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="8"
          aria-label="Registreringsnummer"
        />
        @if (canScan) {
          <button
            type="button"
            class="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-brand text-white active:opacity-90"
            aria-label="Skanna skylt"
            (click)="scan()"
          >
            <mat-icon>qr_code_scanner</mat-icon>
          </button>
        }
      </div>

      @if (looking()) {
        <p class="text-sm text-gray-600">Slår upp bilen…</p>
      }

      @if (car(); as c) {
        <!-- 2. Bilen -->
        <div class="rounded-xl bg-gray-50 p-3">
          <div class="flex items-center gap-3">
            <app-reg-plate [value]="plate()" size="lg" />
            <div class="min-w-0 flex-1">
              <div class="truncate text-[15px] font-medium">{{ carName() }}</div>
              @if (c.kind === 'known') {
                @if (c.customer; as k) {
                  <div class="truncate text-sm text-gray-600">{{ k.name }}</div>
                }
              } @else {
                <div class="text-sm text-gray-600">
                  {{ c.info ? 'Ny bil i verkstaden' : 'Finns inte i registret' }}
                </div>
              }
            </div>
            @if (c.kind === 'known' && c.customer?.phone) {
              <a
                [href]="'tel:' + c.customer!.phone"
                class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 active:bg-gray-100"
                aria-label="Ring kunden"
              >
                <mat-icon>call</mat-icon>
              </a>
            }
          </div>

          @if (c.kind === 'known' && c.openOrder; as o) {
            <div class="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-sm">
              <mat-icon class="shrink-0 text-amber-700">info</mat-icon>
              <span class="min-w-0 flex-1 text-amber-900">
                {{ o.code }} är redan på gång ({{ statusText(o) }}).
              </span>
              <button
                mat-flat-button
                type="button"
                class="!h-9 shrink-0"
                (click)="ref.close({ id: o.id, code: o.code, open: true })"
              >
                Öppna
              </button>
            </div>
          }
        </div>

        @if (formShown()) {
          <!-- 3. Kunden, bara för en ny bil -->
          @if (c.kind === 'new') {
            <section class="flex flex-col gap-2">
              <h3 class="sec">Ägare</h3>
              @if (picked(); as k) {
                <div class="flex items-center gap-3 rounded-xl bg-green-50 p-3">
                  <mat-icon class="shrink-0 text-green-800">person</mat-icon>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-[15px] font-medium">{{ k.name }}</div>
                    @if (k.phone) {
                      <div class="truncate text-sm text-gray-600">{{ k.phone }}</div>
                    }
                  </div>
                  <button
                    type="button"
                    class="grid h-9 w-9 place-items-center rounded-lg text-gray-600 active:bg-green-100"
                    aria-label="Välj en annan kund"
                    (click)="picked.set(null)"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              } @else {
                <input
                  class="field h-12 px-3 text-[16px]"
                  [formControl]="phone"
                  type="tel"
                  inputmode="tel"
                  placeholder="Mobilnummer"
                  autocomplete="off"
                  aria-label="Mobilnummer"
                />
                <input
                  class="field h-12 px-3 text-[16px]"
                  [formControl]="name"
                  placeholder="Namn (valfritt)"
                  autocomplete="off"
                  aria-label="Namn"
                />
                @for (m of matches(); track m.id) {
                  <button
                    type="button"
                    class="flex min-h-12 items-center gap-3 rounded-xl bg-white px-3 text-left ring-1 ring-gray-200 active:bg-gray-50"
                    (click)="pick(m)"
                  >
                    <mat-icon class="shrink-0 text-gray-500">person_search</mat-icon>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[15px] font-medium">{{ m.name }}</span>
                      @if (m.phone) {
                        <span class="block truncate text-sm text-gray-600">{{ m.phone }}</span>
                      }
                    </span>
                    <span class="text-sm font-medium text-brand">Välj</span>
                  </button>
                }
                @if (phone.value || name.value) {
                  <p class="text-sm text-gray-600">
                    {{ matches().length ? 'Är det inte någon av dem skapas' : 'Skapar' }}
                    en ny kund.
                  </p>
                }
              }
            </section>
          }

          <!-- 4. Vad ska göras -->
          <section class="flex flex-col gap-2">
            <h3 class="sec">Vad ska göras?</h3>
            <input
              class="field h-12 px-3 text-[16px]"
              [formControl]="job"
              placeholder="T.ex. hjulbyte, service, bromsar"
              autocomplete="off"
              aria-label="Vad ska göras"
            />
            @if (chips().length) {
              <div class="flex flex-wrap gap-2">
                @for (s of chips(); track s.id) {
                  <button
                    type="button"
                    class="h-10 rounded-xl bg-white px-3 text-sm font-medium ring-1 ring-gray-300 active:bg-gray-100"
                    [class.!bg-brand-soft]="job.value === s.name"
                    (click)="job.setValue(s.name)"
                  >
                    {{ s.name }}
                  </button>
                }
              </div>
            }
          </section>
        } @else {
          <button
            type="button"
            class="h-11 rounded-xl text-sm font-medium text-gray-600 active:bg-gray-100"
            (click)="forceNew.set(true)"
          >
            Skapa en ny order ändå
          </button>
        }
      }

      @if (error()) {
        <p class="rounded-xl bg-red-50 p-3 text-sm text-red-800">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Avbryt</button>
      <button
        mat-stroked-button
        type="button"
        [disabled]="!canCreate() || busy()"
        (click)="create(false)"
      >
        Skapa
      </button>
      <button
        mat-flat-button
        type="button"
        [disabled]="!canCreate() || busy()"
        (click)="create(true)"
      >
        Skapa och starta
      </button>
    </mat-dialog-actions>
  `,
})
export class QuickIntake implements OnInit {
  readonly ref = inject<MatDialogRef<QuickIntake, QuickIntakeResult>>(MatDialogRef);
  private readonly api = inject(WorkshopApi);
  private readonly orders = inject(WorkOrderApi);
  private readonly links = inject(LinkResolver);
  private readonly scanner = inject(Scanner);
  private readonly destroyed = inject(DestroyRef);
  private readonly data = inject<QuickIntakeData | null>(MAT_DIALOG_DATA, { optional: true });

  readonly canScan = plateReaderAvailable();

  readonly regNo = new FormControl('', { nonNullable: true });
  readonly phone = new FormControl('', { nonNullable: true });
  readonly name = new FormControl('', { nonNullable: true });
  readonly job = new FormControl('', { nonNullable: true });

  readonly plate = signal('');
  readonly car = signal<Car | null>(null);
  readonly looking = signal(false);
  readonly matches = signal<Customer[]>([]);
  readonly picked = signal<Customer | null>(null);
  readonly services = signal<ServiceType[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  /** Bilen har redan en order på gång; formuläret visas först när man vill skapa en till. */
  readonly forceNew = signal(false);

  private readonly jobText = signal('');
  private readonly phoneText = signal('');
  private readonly nameText = signal('');

  readonly chips = computed(() => this.services().slice(0, SERVICE_CHIPS));

  readonly formShown = computed(() => {
    const c = this.car();
    return !!c && (c.kind === 'new' || !c.openOrder || this.forceNew());
  });

  readonly carName = computed(() => {
    const c = this.car();
    if (!c) return '';
    const v = c.kind === 'known' ? c.vehicle : c.info;
    return [v?.make, v?.model, v?.year].filter(Boolean).join(' ') || 'Okänt fordon';
  });

  /** Kunden är angiven: vald, eller ett nummer/namn som skapar en ny. */
  private readonly customerGiven = computed(
    () =>
      !!this.picked() || digits(this.phoneText()).length >= 5 || this.nameText().trim().length >= 2,
  );

  readonly canCreate = computed(() => {
    const c = this.car();
    if (!c || !this.formShown() || this.jobText().trim().length < 2) return false;
    return c.kind === 'known' || this.customerGiven();
  });

  constructor() {
    this.regNo.valueChanges
      .pipe(
        map(norm),
        distinctUntilChanged(),
        debounceTime(450),
        takeUntilDestroyed(this.destroyed),
      )
      .subscribe((v) => this.lookup(v));
    this.job.valueChanges
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe((v) => this.jobText.set(v));
    this.name.valueChanges
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe((v) => this.nameText.set(v));
    this.phone.valueChanges
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe((v) => this.phoneText.set(v));
    // Finns kunden redan: förslag på nummer eller namn, så att ingen dubblett skapas.
    this.phone.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyed))
      .subscribe(() => this.findCustomers());
    this.name.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyed))
      .subscribe(() => this.findCustomers());
  }

  ngOnInit() {
    this.api
      .serviceTypes()
      .pipe(catchError(() => of([] as ServiceType[])))
      .subscribe((list) => this.services.set(list.filter((s) => s.active !== false)));
    if (this.data?.job) this.job.setValue(this.data.job);
    if (this.data?.regNo) {
      this.regNo.setValue(this.data.regNo);
      return;
    }
    // I appen börjar det med kameran: skylten är det första man gör när en bil kommer in.
    if (this.canScan) void this.scan();
  }

  async scan() {
    const plate = await this.scanner.pickPlate();
    if (plate) this.regNo.setValue(plate);
  }

  statusText(o: WorkOrder) {
    return { open: 'öppen', in_progress: 'pågår', waiting_parts: 'väntar på del' }[
      o.status as 'open' | 'in_progress' | 'waiting_parts'
    ];
  }

  pick(c: Customer) {
    this.picked.set(c);
    this.matches.set([]);
  }

  // --- uppslag ---

  private lookup(regNo: string) {
    this.car.set(null);
    this.picked.set(null);
    this.matches.set([]);
    this.forceNew.set(false);
    this.error.set('');
    this.plate.set(regNo);
    if (regNo.length < 5) {
      this.looking.set(false);
      return;
    }
    this.looking.set(true);
    this.api
      .vehicles({ q: regNo, includeArchived: true, limit: 5 })
      .pipe(
        map((page) => page.items.find((v) => v.regNo === regNo) ?? null),
        switchMap((vehicle) =>
          vehicle
            ? forkJoin({
                customer: this.api.customer(vehicle.customerId).pipe(catchError(() => of(null))),
                open: this.orders
                  .list({ vehicleId: vehicle.id, active: true, limit: 1 })
                  .pipe(catchError(() => of({ items: [] as WorkOrder[] }))),
              }).pipe(
                map((r): Car => ({
                  kind: 'known',
                  vehicle,
                  customer: r.customer,
                  openOrder: r.open.items[0] ?? null,
                })),
              )
            : this.api.lookupVehicle(regNo).pipe(
                catchError(() => of(null)),
                map((r): Car => ({ kind: 'new', info: r?.info ?? null })),
              ),
        ),
        catchError(() => of(null)),
      )
      .subscribe((car) => {
        // Svaret hör till en äldre inmatning om numret hunnit ändras.
        if (norm(this.regNo.value) !== regNo) return;
        this.looking.set(false);
        if (car) this.car.set(car);
        else this.error.set('Det gick inte att slå upp bilen just nu. Försök igen.');
      });
  }

  private findCustomers() {
    if (this.picked() || this.car()?.kind !== 'new') return;
    const phone = this.phone.value.trim();
    const q = digits(phone).length >= 4 ? phone : this.name.value.trim();
    if (q.length < 2) {
      this.matches.set([]);
      return;
    }
    this.api
      .customers({ q, limit: 4 })
      .pipe(catchError(() => of({ items: [] as Customer[] })))
      .subscribe((p) => this.matches.set(p.items));
  }

  // --- skapa ---

  create(start: boolean) {
    const c = this.car();
    if (!c || !this.canCreate() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const title = this.job.value.trim();
    const customer = c.kind === 'known' ? c.customer : this.picked();
    const link$ =
      c.kind === 'known'
        ? of({ customerId: c.vehicle.customerId, vehicleId: c.vehicle.id })
        : this.links.resolve({
            customerId: '',
            vehicleId: '',
            pending: {
              regNo: this.plate(),
              customerId: this.picked()?.id,
              // Numret är namnet tills man fyller i det riktiga, som i den vanliga ordern.
              customerName: this.name.value.trim() || this.phone.value.trim(),
              customerPhone: this.phone.value.trim() || undefined,
            },
          });
    const jobId = crypto.randomUUID();
    const now = new Date();
    // Klar senast: i dag klockan 17, eller om en timme om dagen nästan är slut.
    const end = new Date(now);
    end.setHours(17, 0, 0, 0);
    if (end.getTime() - now.getTime() < 3_600_000) end.setTime(now.getTime() + 3_600_000);
    link$
      .pipe(
        switchMap((link) => {
          const body: WorkOrderInput = {
            ...link,
            resourceId: null,
            status: start ? 'in_progress' : 'open',
            receivedAt: now.toISOString(),
            pickupAt: end.toISOString(),
            price: null,
            priceNote: null,
            performed: null,
            warranty: null,
            remarks: null,
            notes: null,
            jobs: [{ id: jobId, title }],
            lines: [
              {
                type: 'labour',
                jobId,
                description: title,
                quantity: 1,
                done: false,
                discountPercent: customer?.labourDiscount ?? 0,
              },
            ],
          };
          return this.orders.create(body);
        }),
      )
      .subscribe({
        next: (o) => this.ref.close({ id: o.id, code: o.code, open: false }),
        error: (err) => {
          this.busy.set(false);
          this.error.set(err?.error?.message ?? 'Kunde inte skapa ordern. Försök igen.');
        },
      });
  }
}
