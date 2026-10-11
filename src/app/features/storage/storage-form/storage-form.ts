import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { StorageApi } from '../../../core/api/storage-api';
import {
  ACCESSORY_LABELS,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  RIM_MATERIAL_LABELS,
  SEASON_LABELS,
  STORAGE_CONTENTS_LABELS,
  StorageAccessory,
  StorageContents,
  StorageDepositInput,
} from '../../../core/models';
import { Settings } from '../../../core/settings';
import { dateInput, dateIso } from '../storage-format';

const int = Validators.pattern(/^\d+$/);

/** Däckstorlek anges helt eller inte alls. */
const sizeAllOrNone = (g: AbstractControl): ValidationErrors | null => {
  const filled = ['width', 'profile', 'rimDiameter'].map((k) => g.get(k)?.value != null);
  return filled.some(Boolean) && !filled.every(Boolean) ? { size: true } : null;
};

const normalizeReg = (s: string) => s.toUpperCase().replace(/[^A-Z0-9ÅÄÖ]/g, '');

@Component({
  selector: 'app-storage-form',
  standalone: false,
  template: `
    <h1 class="mb-4 text-2xl font-semibold">{{ id ? 'Ändra inlämning' : 'Ny inlämning' }}</h1>
    <form [formGroup]="form" (ngSubmit)="save()" class="flex max-w-6xl flex-col gap-4">
      <section class="rounded-xl bg-white shadow-sm">
        <h2 class="px-5 pt-5 pb-1 text-base font-semibold">Fordon och kund</h2>
        <div class="grid gap-x-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <mat-form-field>
            <mat-label>Registreringsnummer</mat-label><app-sv-flag matPrefix class="mr-2" />
            <input
              matInput
              formControlName="regNo"
              class="uppercase"
              autocomplete="off"
              (blur)="lookup()"
            />
            @if (sameCar() > 0) {
              <mat-hint class="!text-amber-700"
                >Bilen har redan {{ sameCar() }} inlagrat set</mat-hint
              >
            }
            <mat-error>Obligatoriskt</mat-error>
          </mat-form-field>
          <mat-form-field
            ><mat-label>Bilmärke</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">directions_car</mat-icon
            ><input matInput formControlName="make"
          /></mat-form-field>
          <mat-form-field
            ><mat-label>Bilmodell</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">commute</mat-icon
            ><input matInput formControlName="vehicleModel"
          /></mat-form-field>
          <mat-form-field>
            <mat-label>Kundens namn</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">person</mat-icon>
            <input matInput formControlName="name" />
            <mat-error>Obligatoriskt</mat-error>
          </mat-form-field>
          <mat-form-field
            ><mat-label>Telefon</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">call</mat-icon
            ><input matInput type="tel" formControlName="phone"
          /></mat-form-field>
          <mat-form-field
            ><mat-label>E-post</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">mail</mat-icon
            ><input matInput type="email" formControlName="email" />
            <mat-error>Ogiltig e-postadress</mat-error></mat-form-field
          >
        </div>
      </section>

      <section class="rounded-xl bg-white shadow-sm">
        <h2 class="px-5 pt-5 pb-1 text-base font-semibold">Vad lämnas in?</h2>
        <div class="grid gap-x-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div class="mb-4 sm:col-span-2 lg:col-span-3">
            <mat-button-toggle-group formControlName="contents" hideSingleSelectionIndicator>
              @for (c of contentsOptions; track c[0]) {
                <mat-button-toggle [value]="c[0]">{{ c[1] }}</mat-button-toggle>
              }
            </mat-button-toggle-group>
          </div>

          @if (contents() !== 'rims') {
            <div formGroupName="tyres" class="contents">
              <mat-form-field
                ><mat-label>Däckmärke</mat-label
                ><mat-icon matPrefix class="mr-2 text-gray-400">tire_repair</mat-icon
                ><input matInput formControlName="brand"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Däckmodell</mat-label
                ><mat-icon matPrefix class="mr-2 text-gray-400">tire_repair</mat-icon
                ><input matInput formControlName="model"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Säsong</mat-label
                ><mat-icon matPrefix class="mr-2 text-gray-400">thermostat</mat-icon>
                <mat-select formControlName="season">
                  @for (s of seasons; track s[0]) {
                    <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
                  }
                </mat-select></mat-form-field
              >
              <mat-form-field
                ><mat-label>Bredd (mm)</mat-label
                ><mat-icon matPrefix class="mr-2 text-gray-400">straighten</mat-icon>
                <input matInput type="number" inputmode="numeric" formControlName="width" />
              </mat-form-field>
              <mat-form-field
                ><mat-label>Profil</mat-label
                ><mat-icon matPrefix class="mr-2 text-gray-400">straighten</mat-icon>
                <input matInput type="number" inputmode="numeric" formControlName="profile" />
              </mat-form-field>
              <mat-form-field
                ><mat-label>Fälg (tum)</mat-label
                ><mat-icon matPrefix class="mr-2 text-gray-400">straighten</mat-icon>
                <input matInput type="number" inputmode="numeric" formControlName="rimDiameter" />
                @if (form.controls.tyres.errors?.['size']) {
                  <mat-error>Ange hela storleken eller ingenting</mat-error>
                }
              </mat-form-field>
              <mat-form-field
                ><mat-label>Mönsterdjup (mm)</mat-label
                ><mat-icon matPrefix class="mr-2 text-gray-400">height</mat-icon>
                <input
                  matInput
                  type="number"
                  inputmode="decimal"
                  step="0.5"
                  formControlName="treadDepthMm"
                />
                <mat-hint>Grundaste mätpunkten</mat-hint>
              </mat-form-field>
              <div class="flex items-center pb-4">
                <mat-slide-toggle formControlName="studded">Dubbade</mat-slide-toggle>
              </div>
              <div class="hidden lg:block"></div>
            </div>
          }

          @if (contents() !== 'tyres') {
            <div formGroupName="rims" class="contents">
              <mat-form-field
                ><mat-label>Fälgtyp</mat-label
                ><mat-icon matPrefix class="mr-2 text-gray-400">album</mat-icon>
                <mat-select formControlName="material">
                  @for (m of materials; track m[0]) {
                    <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                  }
                </mat-select></mat-form-field
              >
              <mat-form-field
                ><mat-label>Fälgmärke</mat-label
                ><mat-icon matPrefix class="mr-2 text-gray-400">sell</mat-icon
                ><input matInput formControlName="brand"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Fälgdiameter (tum)</mat-label
                ><mat-icon matPrefix class="mr-2 text-gray-400">straighten</mat-icon>
                <input matInput type="number" inputmode="numeric" formControlName="diameter" />
              </mat-form-field>
            </div>
          }

          <mat-form-field
            ><mat-label>Antal (st)</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">numbers</mat-icon>
            <input matInput type="number" inputmode="numeric" formControlName="quantity" />
            <mat-error>1–12</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Plats i hotellet</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">location_on</mat-icon
            ><input matInput formControlName="location" placeholder="t.ex. H-12-3"
          /></mat-form-field>
          <div class="hidden lg:block"></div>
          <mat-form-field
            ><mat-label>Inlämnad</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">event</mat-icon>
            <input matInput type="date" formControlName="depositedAt" />
            <mat-error>Ange datum</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Beräknad hämtning</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">event_available</mat-icon>
            <input matInput type="date" formControlName="expectedPickupAt" />
            @if (form.errors?.['pickup']) {
              <mat-error>Före inlämningsdatumet</mat-error>
            }
          </mat-form-field>
          <div class="hidden lg:block"></div>

          <div class="sm:col-span-2 lg:col-span-3">
            <div class="mb-1 text-sm text-gray-600">Medföljande tillbehör</div>
            <mat-chip-listbox formControlName="accessories" multiple aria-label="Tillbehör">
              @for (a of accessories; track a[0]) {
                <mat-chip-option [value]="a[0]">{{ a[1] }}</mat-chip-option>
              }
            </mat-chip-listbox>
          </div>
          <mat-form-field class="mt-4 sm:col-span-2 lg:col-span-3"
            ><mat-label>Skick vid inlämning</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">report_problem</mat-icon
            ><input
              matInput
              formControlName="condition"
              placeholder="t.ex. kantskada på höger fram, ojämnt slitage"
          /></mat-form-field>
        </div>
      </section>

      <section class="rounded-xl bg-white shadow-sm">
        <h2 class="px-5 pt-5 pb-1 text-base font-semibold">Avgift och betalning</h2>
        <div class="grid gap-x-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <mat-form-field
            ><mat-label>Avgift (kr)</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">payments</mat-icon>
            <input matInput type="number" inputmode="decimal" step="0.01" formControlName="fee" />
            <mat-error>0 eller mer</mat-error></mat-form-field
          >
          <div class="mb-4 flex items-center">
            <mat-button-toggle-group formControlName="paymentStatus" hideSingleSelectionIndicator>
              <mat-button-toggle value="unpaid">Obetald</mat-button-toggle>
              <mat-button-toggle value="paid">Betald</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          <div class="hidden lg:block"></div>
          <mat-form-field
            ><mat-label>Betalsätt</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">credit_card</mat-icon>
            <mat-select formControlName="paymentMethod">
              <mat-option [value]="null">–</mat-option>
              @for (m of methods; track m[0]) {
                <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
              }
            </mat-select>
            <mat-error>Välj betalsätt för betald avgift</mat-error></mat-form-field
          >
          @if (paid()) {
            <mat-form-field
              ><mat-label>Betaldatum</mat-label
              ><mat-icon matPrefix class="mr-2 text-gray-400">event</mat-icon>
              <input matInput type="date" formControlName="paidAt" />
            </mat-form-field>
          }
          <mat-form-field class="sm:col-span-2 lg:col-span-3"
            ><mat-label>Anteckningar</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">notes</mat-icon
            ><input matInput formControlName="notes"
          /></mat-form-field>
        </div>
      </section>

      <div class="flex gap-2">
        <button mat-flat-button color="primary" class="!h-12" [disabled]="form.invalid || busy()">
          Spara
        </button>
        <a mat-button class="!h-12" [routerLink]="id ? ['/storage', id] : '/storage'">Avbryt</a>
      </div>
    </form>
  `,
})
export class StorageForm {
  private readonly api = inject(StorageApi);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly seasons = Object.entries(SEASON_LABELS);
  readonly materials = Object.entries(RIM_MATERIAL_LABELS);
  readonly methods = Object.entries(PAYMENT_METHOD_LABELS);
  readonly accessories = Object.entries(ACCESSORY_LABELS);
  readonly contentsOptions = Object.entries(STORAGE_CONTENTS_LABELS);
  readonly busy = signal(false);
  readonly contents = signal<StorageContents>('tyres');
  readonly paid = signal(false);
  readonly sameCar = signal(0);

  readonly form = this.fb.group(
    {
      regNo: ['', [Validators.required, Validators.minLength(2)]],
      make: [''],
      vehicleModel: [''],
      name: ['', Validators.required],
      phone: [''],
      email: ['', Validators.email],
      contents: ['tyres' as StorageContents],
      quantity: [4, [Validators.required, Validators.min(1), Validators.max(12), int]],
      location: [''],
      depositedAt: [dateInput(new Date().toISOString()), Validators.required],
      expectedPickupAt: [''],
      accessories: [[] as StorageAccessory[]],
      tyres: this.fb.group(
        {
          brand: [''],
          model: [''],
          width: [null as number | null, [Validators.min(1), int]],
          profile: [null as number | null, [Validators.min(1), int]],
          rimDiameter: [null as number | null, [Validators.min(1), int]],
          season: ['winter', Validators.required],
          studded: [false],
          treadDepthMm: [null as number | null, [Validators.min(0), Validators.max(15)]],
        },
        { validators: sizeAllOrNone },
      ),
      rims: this.fb.group({
        brand: [''],
        material: ['alloy', Validators.required],
        diameter: [null as number | null, [Validators.min(1), int]],
      }),
      condition: [''],
      notes: [''],
      fee: [null as number | null, [Validators.min(0)]],
      paymentStatus: ['unpaid'],
      paymentMethod: [
        null as PaymentMethod | null,
        (c: AbstractControl) =>
          c.parent?.get('paymentStatus')?.value === 'paid' && !c.value ? { required: true } : null,
      ],
      paidAt: [''],
    },
    {
      validators: (g) => {
        const from = g.get('depositedAt')?.value;
        const to = g.get('expectedPickupAt')?.value;
        return from && to && to < from ? { pickup: true } : null;
      },
    },
  );

  constructor() {
    const c = this.form.controls;
    c.contents.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.applyContents(v ?? 'tyres'));
    c.paymentStatus.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.paid.set(v === 'paid');
      if (v === 'paid' && !c.paidAt.value) c.paidAt.setValue(dateInput(new Date().toISOString()));
      c.paymentMethod.updateValueAndValidity();
    });
    this.applyContents('tyres');

    if (this.id) {
      this.api.deposit(this.id).subscribe((d) => {
        this.form.patchValue({
          regNo: d.vehicle.regNo,
          make: d.vehicle.make ?? '',
          vehicleModel: d.vehicle.model ?? '',
          name: d.customer.name,
          phone: d.customer.phone ?? '',
          email: d.customer.email ?? '',
          contents: d.contents,
          quantity: d.quantity,
          location: d.location ?? '',
          depositedAt: dateInput(d.depositedAt),
          expectedPickupAt: dateInput(d.expectedPickupAt),
          accessories: d.accessories,
          tyres: d.tyres ?? undefined,
          rims: d.rims ?? undefined,
          condition: d.condition ?? '',
          notes: d.notes ?? '',
          fee: d.fee / 100,
          paymentStatus: d.paymentStatus,
          paymentMethod: d.paymentMethod,
          paidAt: dateInput(d.paidAt),
        } as never);
        this.applyContents(d.contents);
      });
    } else {
      const fee = inject(Settings).value().defaultStorageFee;
      if (fee) c.fee.setValue(fee);
    }
  }

  private applyContents(v: StorageContents) {
    this.contents.set(v);
    const { tyres, rims } = this.form.controls;
    if (v === 'rims') tyres.disable();
    else tyres.enable();
    if (v === 'tyres') rims.disable();
    else rims.enable();
  }

  /** Förifyller kund och bil om registreringsnumret har lämnat in förut. */
  lookup() {
    if (this.id) return;
    const reg = normalizeReg(this.form.controls.regNo.value ?? '');
    if (reg.length < 3) return;
    this.api
      .deposits({ q: reg, limit: 20, sort: 'number', order: 'desc' })
      .subscribe(({ items }) => {
        const same = items.filter((d) => d.vehicle.regNo === reg);
        this.sameCar.set(same.filter((d) => d.status === 'stored').length);
        const last = same[0];
        if (!last || this.form.controls.name.value) return;
        this.form.patchValue({
          name: last.customer.name,
          phone: last.customer.phone ?? '',
          email: last.customer.email ?? '',
          make: last.vehicle.make ?? '',
          vehicleModel: last.vehicle.model ?? '',
        });
        this.snack.open(`Hittade tidigare kund: ${last.customer.name}`, undefined, {
          duration: 3000,
        });
      });
  }

  save() {
    const v = this.form.getRawValue();
    const opt = <T>(x: T | null | '') => (x === null || x === '' ? undefined : x);
    const orNull = (x: string | null) => x || null;
    const t = v.tyres;
    const r = v.rims;
    const body: StorageDepositInput = {
      contents: v.contents!,
      quantity: v.quantity!,
      customer: { name: v.name!, phone: opt(v.phone), email: opt(v.email) },
      vehicle: { regNo: normalizeReg(v.regNo!), make: opt(v.make), model: opt(v.vehicleModel) },
      tyres:
        v.contents === 'rims'
          ? null
          : {
              brand: orNull(t.brand),
              model: orNull(t.model),
              width: t.width,
              profile: t.profile,
              rimDiameter: t.rimDiameter,
              season: t.season as never,
              studded: !!t.studded,
              treadDepthMm: t.treadDepthMm,
            },
      rims:
        v.contents === 'tyres'
          ? null
          : { brand: orNull(r.brand), material: r.material as never, diameter: r.diameter },
      accessories: v.accessories ?? [],
      location: orNull(v.location),
      condition: orNull(v.condition),
      notes: orNull(v.notes),
      depositedAt: dateIso(v.depositedAt!),
      expectedPickupAt: v.expectedPickupAt ? dateIso(v.expectedPickupAt) : null,
      fee: Math.round((v.fee ?? 0) * 100),
      paymentStatus: v.paymentStatus as never,
      paymentMethod: v.paymentMethod,
      paidAt: v.paymentStatus === 'paid' && v.paidAt ? dateIso(v.paidAt) : null,
    };
    this.busy.set(true);
    const req = this.id ? this.api.update(this.id, body) : this.api.create(body);
    req.subscribe({
      next: (d) => this.router.navigate(['/storage', d.id]),
      error: () => this.busy.set(false),
    });
  }
}
