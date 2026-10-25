import { Component, computed, inject, signal } from '@angular/core';
import { ensureValid } from '../../../shared/form-guard';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, of, switchMap } from 'rxjs';
import {
  LinkResolver,
  type ResolvedLink,
} from '../../../shared/customer-vehicle-picker/link-resolver';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { CatalogApi } from '../../../core/api/catalog-api';
import { InventoryApi } from '../../../core/api/inventory-api';
import { StorageApi } from '../../../core/api/storage-api';
import {
  ACCESSORY_LABELS,
  DEPOSIT_CONDITION_LABELS,
  DepositCondition,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  RIM_MATERIAL_LABELS,
  SEASON_LABELS,
  STORAGE_CONTENTS_LABELS,
  StorageAccessory,
  StorageContents,
  StorageDefaults,
  StorageDepositInput,
  Warehouse,
} from '../../../core/models';
import { Settings } from '../../../core/settings';
import type { PickerValue } from '../../../shared/customer-vehicle-picker/customer-vehicle-picker';
import { dateInput, dateIso } from '../storage-format';

const int = Validators.pattern(/^\d+$/);

/** Däckstorlek anges helt eller inte alls. */
const sizeAllOrNone = (g: AbstractControl): ValidationErrors | null => {
  const filled = ['width', 'profile', 'rimDiameter'].map((k) => g.get(k)?.value != null);
  return filled.some(Boolean) && !filled.every(Boolean) ? { size: true } : null;
};

/** Nästa gång setet sannolikt hämtas: i inställd månad (1:a), helår om ett år. */
const nextSwap = (season: string, from: Date, winterMonth: number, summerMonth: number) => {
  const year = from.getFullYear();
  const pick = (month: number) => {
    const d = new Date(year, month - 1, 1, 12);
    return d <= from ? new Date(year + 1, month - 1, 1, 12) : d;
  };
  if (season === 'winter') return pick(winterMonth);
  if (season === 'summer') return pick(summerMonth);
  return new Date(year + 1, from.getMonth(), from.getDate(), 12);
};

const plusMonths = (ymd: string, months: number) => {
  const d = new Date(`${ymd}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return dateInput(d.toISOString());
};

const normalizeReg = (s: string) => s.toUpperCase().replace(/[^A-Z0-9ÅÄÖ]/g, '');

@Component({
  selector: 'app-storage-form',
  standalone: false,
  template: `
    <app-card-page
      [wide]="true"
      listLink="/storage"
      listLabel="Däckhotell"
      newTitle="Ny inlämning"
      [title]="title()"
      [code]="code()"
    >
      <div actions class="flex items-center gap-2">
        <a mat-button [routerLink]="id ? ['/storage', id] : '/storage'">Avbryt</a>
        <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">Spara</button>
      </div>

      <form [formGroup]="form" (ngSubmit)="save()" class="grid items-start gap-4 xl:grid-cols-2">
        <div class="flex flex-col gap-4">
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-4 flex items-center gap-2 text-base font-semibold">
              <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand"
                ><mat-icon class="!h-5 !w-5 !text-xl">directions_car</mat-icon></span
              >
              Kund och bil
            </h2>
            <app-customer-vehicle-picker formControlName="link" [legacy]="legacy()" />
            @if (sameCar() > 0) {
              <p class="mt-1 text-sm text-amber-700">
                Bilen har redan {{ sameCar() }} inlagrat set
              </p>
            }
            @if (legacy() && !form.controls.link.value) {
              <p class="mt-3 text-sm text-gray-600">
                Den här inlämningen gjordes innan kund- och bilregistret fanns. Välj kund och bil
                ovan för att koppla den, eller ändra uppgifterna nedan som förut.
              </p>
              <div class="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Registreringsnummer</mat-label>
                  <input matInput formControlName="regNo" appRegNo class="uppercase" />
                  <mat-error>Obligatoriskt</mat-error>
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic"
                  ><mat-label>Bilmärke</mat-label><input matInput formControlName="make"
                /></mat-form-field>
                <mat-form-field subscriptSizing="dynamic"
                  ><mat-label>Bilmodell</mat-label><input matInput formControlName="vehicleModel"
                /></mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Kundens namn</mat-label>
                  <input matInput formControlName="name" />
                  <mat-error>Obligatoriskt</mat-error>
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic"
                  ><mat-label>Telefon</mat-label><input matInput type="tel" formControlName="phone"
                /></mat-form-field>
                <mat-form-field subscriptSizing="dynamic"
                  ><mat-label>E-post</mat-label
                  ><input matInput type="email" formControlName="email" />
                  <mat-error>Ogiltig e-postadress</mat-error></mat-form-field
                >
              </div>
            }
          </section>

          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-4 flex items-center gap-2 text-base font-semibold">
              <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand"
                ><mat-icon class="!h-5 !w-5 !text-xl">tire_repair</mat-icon></span
              >
              Vad lämnas in?
            </h2>
            <div class="grid grid-cols-6 gap-x-3 gap-y-3">
              <mat-button-toggle-group
                formControlName="contents"
                hideSingleSelectionIndicator
                class="col-span-6 w-full"
              >
                @for (c of contentsOptions; track c[0]) {
                  <mat-button-toggle [value]="c[0]" class="flex-1">{{ c[1] }}</mat-button-toggle>
                }
              </mat-button-toggle-group>

              @if (contents() !== 'rims') {
                <div formGroupName="tyres" class="contents">
                  <mat-button-toggle-group
                    formControlName="season"
                    hideSingleSelectionIndicator
                    class="col-span-6 w-full"
                  >
                    @for (s of seasons; track s[0]) {
                      <mat-button-toggle [value]="s[0]" class="flex-1">{{
                        s[1]
                      }}</mat-button-toggle>
                    }
                  </mat-button-toggle-group>
                  <mat-form-field subscriptSizing="dynamic" class="col-span-3"
                    ><mat-label>Däckmärke</mat-label><input matInput formControlName="brand"
                  /></mat-form-field>
                  <mat-form-field subscriptSizing="dynamic" class="col-span-3"
                    ><mat-label>Däckmodell</mat-label><input matInput formControlName="model"
                  /></mat-form-field>
                  <mat-form-field subscriptSizing="dynamic" class="col-span-2"
                    ><mat-label>Bredd (mm)</mat-label>
                    <input matInput type="number" inputmode="numeric" formControlName="width" />
                  </mat-form-field>
                  <mat-form-field subscriptSizing="dynamic" class="col-span-2"
                    ><mat-label>Profil</mat-label>
                    <input matInput type="number" inputmode="numeric" formControlName="profile" />
                  </mat-form-field>
                  <mat-form-field subscriptSizing="dynamic" class="col-span-2"
                    ><mat-label>Fälg (tum)</mat-label>
                    <input
                      matInput
                      type="number"
                      inputmode="numeric"
                      formControlName="rimDiameter"
                    />
                    @if (form.controls.tyres.errors?.['size']) {
                      <mat-error>Ange hela storleken eller ingenting</mat-error>
                    }
                  </mat-form-field>
                </div>
              }

              @if (contents() !== 'tyres') {
                <div formGroupName="rims" class="contents">
                  <mat-form-field subscriptSizing="dynamic" class="col-span-3"
                    ><mat-label>Fälgtyp</mat-label>
                    <mat-select formControlName="material">
                      @for (m of materials; track m[0]) {
                        <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                      }
                    </mat-select></mat-form-field
                  >
                  @if (contents() === 'rims') {
                    <mat-form-field subscriptSizing="dynamic" class="col-span-3"
                      ><mat-label>Fälgdiameter (tum)</mat-label>
                      <input
                        matInput
                        type="number"
                        inputmode="numeric"
                        formControlName="diameter"
                      />
                    </mat-form-field>
                  }
                </div>
              }
              @if (contents() !== 'rims' && season() !== 'summer') {
                <div formGroupName="tyres" class="field col-span-3 flex h-11 items-center px-3">
                  <mat-slide-toggle formControlName="studded">Dubbade</mat-slide-toggle>
                </div>
              }

              <mat-form-field subscriptSizing="dynamic" class="col-span-3"
                ><mat-label>Skick vid inlämning</mat-label>
                <mat-select formControlName="conditionGrade">
                  @for (c of conditions; track c[0]) {
                    <mat-option [value]="c[0]">{{ c[1] }}</mat-option>
                  }
                </mat-select></mat-form-field
              >
              <mat-form-field subscriptSizing="dynamic" class="col-span-3"
                ><mat-label>Anmärkning på skicket</mat-label
                ><input
                  matInput
                  formControlName="condition"
                  placeholder="t.ex. kantskada på höger fram"
              /></mat-form-field>

              <details class="col-span-6">
                <summary class="cursor-pointer py-1 text-sm font-medium text-gray-600 select-none">
                  Fler uppgifter
                </summary>
                <div class="mt-3 grid grid-cols-6 gap-x-3 gap-y-3">
                  <mat-form-field subscriptSizing="dynamic" class="col-span-3"
                    ><mat-label>Antal (st)</mat-label>
                    <input matInput type="number" inputmode="numeric" formControlName="quantity" />
                    <mat-error>1–12</mat-error></mat-form-field
                  >
                  @if (contents() !== 'rims') {
                    <div formGroupName="tyres" class="contents">
                      <mat-form-field subscriptSizing="dynamic" class="col-span-3"
                        ><mat-label>Mönsterdjup (mm)</mat-label>
                        <input
                          matInput
                          type="number"
                          inputmode="decimal"
                          step="0.5"
                          formControlName="treadDepthMm"
                        />
                      </mat-form-field>
                    </div>
                  }
                  @if (contents() !== 'tyres') {
                    <div formGroupName="rims" class="contents">
                      <mat-form-field subscriptSizing="dynamic" class="col-span-3"
                        ><mat-label>Fälgmärke</mat-label><input matInput formControlName="brand"
                      /></mat-form-field>
                    </div>
                  }
                  <mat-form-field subscriptSizing="dynamic" class="col-span-6">
                    <mat-label>Medföljande tillbehör</mat-label>
                    <mat-select formControlName="accessories" multiple>
                      @for (a of accessories; track a[0]) {
                        <mat-option [value]="a[0]">{{ a[1] }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field subscriptSizing="dynamic" class="col-span-6"
                    ><mat-label>Anteckningar</mat-label><input matInput formControlName="notes"
                  /></mat-form-field>
                </div>
              </details>
            </div>
          </section>
        </div>

        <div class="flex flex-col gap-4">
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-4 flex items-center gap-2 text-base font-semibold">
              <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand"
                ><mat-icon class="!h-5 !w-5 !text-xl">warehouse</mat-icon></span
              >
              Förvaring
            </h2>
            <div class="grid grid-cols-6 gap-x-3 gap-y-3">
              <mat-form-field subscriptSizing="dynamic" class="col-span-3">
                <mat-label>Lager</mat-label>
                <mat-select formControlName="warehouseId">
                  <mat-option [value]="null">Ingen vald</mat-option>
                  @for (w of warehouses(); track w.id) {
                    <mat-option [value]="w.id">{{ w.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic" class="col-span-3">
                <mat-label>Plats</mat-label>
                <mat-select formControlName="locationId">
                  <mat-option [value]="null">Ingen vald</mat-option>
                  @for (l of places(); track l.id) {
                    <mat-option [value]="l.id">{{ l.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <app-date-field
                class="col-span-3"
                subscript="dynamic"
                label="Inlämnad"
                icon="event"
                error="Ange datum"
                formControlName="depositedAt"
              />
              <app-date-field
                class="col-span-3"
                subscript="dynamic"
                label="Hämtas (nästa byte)"
                icon="event_available"
                [error]="form.errors?.['pickup'] ? 'Före inlämningsdatumet' : ''"
                formControlName="expectedPickupAt"
              />
              @if (!warehouses().length) {
                <p class="col-span-6 text-sm text-gray-500">
                  Lägg till ett lager för kundgods under Register → Lager, så kan du välja plats
                  här.
                </p>
              } @else if (legacyLocation()) {
                <p class="col-span-6 text-sm text-gray-500">
                  Tidigare plats: {{ legacyLocation() }}
                </p>
              }
            </div>
          </section>

          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-4 flex items-center gap-2 text-base font-semibold">
              <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand"
                ><mat-icon class="!h-5 !w-5 !text-xl">payments</mat-icon></span
              >
              Avgift per år
            </h2>
            <div class="grid grid-cols-6 gap-x-3 gap-y-3">
              <mat-form-field subscriptSizing="dynamic" class="col-span-3"
                ><mat-label>Avgift (kr, inkl. moms)</mat-label>
                <input
                  matInput
                  type="number"
                  inputmode="decimal"
                  step="0.01"
                  formControlName="fee"
                />
                <mat-error>0 eller mer</mat-error></mat-form-field
              >
              <mat-button-toggle-group
                formControlName="paymentStatus"
                hideSingleSelectionIndicator
                class="col-span-3 w-full"
              >
                <mat-button-toggle value="unpaid" class="flex-1">Obetald</mat-button-toggle>
                <mat-button-toggle value="paid" class="flex-1">Betald</mat-button-toggle>
              </mat-button-toggle-group>
              @if (paid()) {
                <mat-form-field subscriptSizing="dynamic" class="col-span-2"
                  ><mat-label>Betalsätt</mat-label>
                  <mat-select formControlName="paymentMethod">
                    <mat-option [value]="null">–</mat-option>
                    @for (m of methods; track m[0]) {
                      <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                    }
                  </mat-select>
                  <mat-error>Välj betalsätt</mat-error></mat-form-field
                >
                <app-date-field
                  class="col-span-2"
                  subscript="dynamic"
                  label="Betaldatum"
                  icon="event"
                  formControlName="paidAt"
                />
              }
              <app-date-field
                [class]="paid() ? 'col-span-2' : 'col-span-3'"
                subscript="dynamic"
                label="Nästa betalning"
                icon="event_repeat"
                formControlName="nextPaymentAt"
              />
            </div>
          </section>
        </div>
      </form>
    </app-card-page>
  `,
})
export class StorageForm {
  private readonly api = inject(StorageApi);
  private readonly catalog = inject(CatalogApi);
  private readonly links = inject(LinkResolver);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  /** Säsongen och avgiften kommer från Inställningar. */
  private readonly settings = inject(Settings);
  private readonly inventory = inject(InventoryApi);
  /** Förval för en ny inlämning (Inställningar → Däckhotell). */
  private readonly defs = signal<StorageDefaults | null>(null);
  readonly seasons: [string, string][] = [
    ['winter', SEASON_LABELS.winter],
    ['summer', SEASON_LABELS.summer],
    ['all_season', SEASON_LABELS.all_season],
  ];
  readonly materials = Object.entries(RIM_MATERIAL_LABELS);
  readonly methods = Object.entries(PAYMENT_METHOD_LABELS);
  readonly accessories = Object.entries(ACCESSORY_LABELS);
  readonly conditions = Object.entries(DEPOSIT_CONDITION_LABELS);
  /** Lager för kundgods (däckhotell) med sina platser. */
  readonly warehouses = signal<Warehouse[]>([]);
  readonly warehouseId = signal<string | null>(null);
  readonly places = computed(
    () => this.warehouses().find((w) => w.id === this.warehouseId())?.locations ?? [],
  );
  /** Plats som skrevs som fritext före lagerregistret. */
  readonly legacyLocation = signal('');
  readonly season = signal<string>(this.settings.value().defaultSeason);
  /** Kompletta hjul är det vanliga, så det står först. */
  readonly contentsOptions: [string, string][] = [
    ['complete_wheels', STORAGE_CONTENTS_LABELS.complete_wheels],
    ['tyres', STORAGE_CONTENTS_LABELS.tyres],
    ['rims', STORAGE_CONTENTS_LABELS.rims],
  ];
  readonly busy = signal(false);
  readonly title = signal('');
  readonly code = signal<string | null>(null);
  readonly contents = signal<StorageContents>('complete_wheels');
  readonly paid = signal(false);
  readonly sameCar = signal(0);
  /** Inlämning från före kundregistret: gamla fritextfält visas tills den kopplas. */
  readonly legacy = signal<{ customer: string; regNo: string } | null>(null);

  readonly form = this.fb.group(
    {
      link: [null as PickerValue | null],
      regNo: [''],
      make: [''],
      vehicleModel: [''],
      name: [''],
      phone: [''],
      email: ['', Validators.email],
      contents: ['complete_wheels' as StorageContents],
      quantity: [4, [Validators.required, Validators.min(1), Validators.max(12), int]],
      warehouseId: [null as string | null],
      locationId: [null as string | null],
      conditionGrade: ['good' as DepositCondition | null],
      nextPaymentAt: [''],
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
          season: [this.settings.value().defaultSeason as string, Validators.required],
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
        const errors: ValidationErrors = {};
        const from = g.get('depositedAt')?.value;
        const to = g.get('expectedPickupAt')?.value;
        if (from && to && to < from) errors['pickup'] = true;
        // Kund och bil ska vara valda ur registret; en gammal inlämning får behålla fritexten.
        if (!g.get('link')?.value) {
          const old = this.legacy();
          const hasText = !!g.get('regNo')?.value?.trim() && !!g.get('name')?.value?.trim();
          if (!old || !hasText) errors['link'] = true;
        }
        return Object.keys(errors).length ? errors : null;
      },
    },
  );

  constructor() {
    const c = this.form.controls;
    c.contents.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.applyContents(v ?? 'complete_wheels'));
    c.paymentStatus.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.paid.set(v === 'paid');
      if (v === 'paid' && !c.paidAt.value) c.paidAt.setValue(dateInput(new Date().toISOString()));
      c.paymentMethod.updateValueAndValidity();
    });
    this.applyContents('complete_wheels');

    // Lager för kundgods; finns bara ett väljs det direkt för en ny inlämning.
    this.catalog.warehouses().subscribe((all) => {
      const mine = all.filter((w) => w.active && w.kind === 'customer');
      this.warehouses.set(mine);
      this.applyDefaultPlace();
      this.warehouseId.set(c.warehouseId.value);
    });
    c.warehouseId.valueChanges.pipe(takeUntilDestroyed()).subscribe((w) => {
      this.warehouseId.set(w);
      if (!this.warehouses().length) return;
      const places = this.warehouses().find((x) => x.id === w)?.locations ?? [];
      if (!places.some((p) => p.id === c.locationId.value)) c.locationId.setValue(null);
    });

    // Säsongen styr förslaget på nästa byte, och en betald avgift gäller ett år framåt.
    c.tyres.controls.season.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.season.set(v ?? 'winter');
      this.suggestDates();
    });
    c.depositedAt.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.suggestDates());
    c.paidAt.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.suggestDates());
    c.paymentStatus.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.suggestDates());

    // Valda kund och bil fyller i ögonblicksbilden som sparas på inlämningen.
    c.link.valueChanges.pipe(takeUntilDestroyed()).subscribe((l) => {
      if (l?.pending) {
        // Nyskriven kund/bil: ögonblicksbilden fylls i nu, själva posterna skapas vid spar.
        this.form.patchValue({ regNo: l.pending.regNo ?? '', name: l.pending.customerName ?? '' });
        return;
      }
      if (!l?.vehicle || !l.customer) return;
      this.form.patchValue({
        regNo: l.vehicle.regNo,
        make: l.vehicle.make ?? '',
        vehicleModel: l.vehicle.model ?? '',
        name: l.customer.name,
        phone: l.customer.phone ?? '',
        email: '',
      });
      this.countStored(l.vehicle.regNo);
      // Däckdimensionen ur fordonsregistret ("205/55 R16"), om den saknas.
      const size = /(\d{3})\s*\/\s*(\d{2}).*?R?\s*(\d{2})\b/i.exec(l.vehicle.tyreSize ?? '');
      const t = c.tyres.controls;
      if (size && !this.id && t.width.value == null && t.profile.value == null) {
        c.tyres.patchValue({
          width: Number(size[1]),
          profile: Number(size[2]),
          rimDiameter: Number(size[3]),
        });
      }
    });

    if (this.id) {
      this.api.deposit(this.id).subscribe((d) => {
        if (!d.customerId || !d.vehicleId) {
          this.legacy.set({ customer: d.customer.name, regNo: d.vehicle.regNo });
        }
        this.form.patchValue({
          link:
            d.customerId && d.vehicleId
              ? { customerId: d.customerId, vehicleId: d.vehicleId }
              : null,
          regNo: d.vehicle.regNo,
          make: d.vehicle.make ?? '',
          vehicleModel: d.vehicle.model ?? '',
          name: d.customer.name,
          phone: d.customer.phone ?? '',
          email: d.customer.email ?? '',
          contents: d.contents,
          quantity: d.quantity,
          warehouseId: d.warehouseId,
          locationId: d.locationId,
          conditionGrade: d.conditionGrade,
          nextPaymentAt: dateInput(d.nextPaymentAt),
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
        this.title.set(`${d.vehicle.regNo} · ${d.customer.name}`);
        this.code.set(d.code);
        this.applyContents(d.contents);
        this.legacyLocation.set(!d.warehouseId ? (d.location ?? '') : '');
        this.warehouseId.set(d.warehouseId);
        this.season.set(d.tyres?.season ?? 'winter');
        this.form.updateValueAndValidity();
      });
    } else {
      const fee = this.settings.value().defaultStorageFee;
      if (fee) c.fee.setValue(fee);
      this.suggestDates();
      // Förvalen från Inställningar fylls i, så kassan bara ändrar det som avviker.
      this.inventory.storageDefaults().subscribe((d) => {
        this.defs.set(d);
        this.applyContents(d.contents);
        c.contents.setValue(d.contents, { emitEvent: false });
        c.quantity.setValue(d.quantity);
        c.conditionGrade.setValue(d.condition);
        c.accessories.setValue(d.accessories);
        c.tyres.controls.studded.setValue(d.studded);
        this.applyDefaultPlace();
        this.suggestDates();
      });
    }
  }

  /** Förvalt lager och plats (annars det enda lagret) för en ny inlämning; väntar på båda svaren. */
  private applyDefaultPlace() {
    if (this.id) return;
    const c = this.form.controls;
    const mine = this.warehouses();
    if (c.warehouseId.value || !mine.length) return;
    const d = this.defs();
    if (d?.warehouseId && mine.some((w) => w.id === d.warehouseId)) {
      c.warehouseId.setValue(d.warehouseId);
      c.locationId.setValue(d.locationId);
    } else if (d && mine.length === 1) {
      c.warehouseId.setValue(mine[0].id);
    }
  }

  /** Förslag på nästa byte och nästa betalning, tills man skrivit något själv. */
  private suggestDates() {
    if (this.id) return;
    const c = this.form.controls;
    const from = c.depositedAt.value ? new Date(`${c.depositedAt.value}T12:00:00`) : new Date();
    if (!c.expectedPickupAt.dirty) {
      c.expectedPickupAt.setValue(
        dateInput(
          nextSwap(
            this.season(),
            from,
            this.defs()?.winterPickupMonth ?? 10,
            this.defs()?.summerPickupMonth ?? 4,
          ).toISOString(),
        ),
        {
          emitEvent: false,
        },
      );
    }
    if (!c.nextPaymentAt.dirty) {
      const paid = c.paymentStatus.value === 'paid' && c.paidAt.value;
      c.nextPaymentAt.setValue(
        plusMonths(
          paid ? c.paidAt.value! : dateInput(from.toISOString()),
          this.defs()?.paymentCycleMonths ?? 12,
        ),
        {
          emitEvent: false,
        },
      );
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

  /** Varnar om bilen redan har inlagrade set. */
  private countStored(regNo: string) {
    const reg = normalizeReg(regNo);
    this.api.deposits({ q: reg, limit: 20 }).subscribe(({ items }) => {
      const same = items.filter((d) => d.vehicle.regNo === reg && d.id !== this.id);
      this.sameCar.set(same.filter((d) => d.status === 'stored').length);
    });
  }

  save() {
    if (
      !ensureValid(
        this.form,
        this.snack,
        this.form.errors?.['link']
          ? 'Välj kund och bil'
          : this.form.errors?.['pickup']
            ? 'Hämtdatum ligger före inlämningsdatum'
            : undefined,
      )
    )
      return;

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
          : {
              brand: orNull(r.brand),
              material: r.material as never,
              // Kompletta hjul: fälgens storlek är däckets.
              diameter:
                v.contents === 'complete_wheels' ? (t.rimDiameter ?? r.diameter) : r.diameter,
            },
      accessories: v.accessories ?? [],
      warehouseId: v.warehouseId,
      locationId: v.warehouseId ? v.locationId : null,
      conditionGrade: v.conditionGrade,
      condition: orNull(v.condition),
      notes: orNull(v.notes),
      depositedAt: dateIso(v.depositedAt!),
      expectedPickupAt: v.expectedPickupAt ? dateIso(v.expectedPickupAt) : null,
      nextPaymentAt: v.nextPaymentAt ? dateIso(v.nextPaymentAt) : null,
      fee: Math.round((v.fee ?? 0) * 100),
      paymentStatus: v.paymentStatus as never,
      paymentMethod: v.paymentMethod,
      paidAt: v.paymentStatus === 'paid' && v.paidAt ? dateIso(v.paidAt) : null,
    };
    this.busy.set(true);
    // Nyskriven kund och bil skapas först; gammal fritext utan länk sparas som den är.
    const link$: Observable<ResolvedLink | null> = v.link ? this.links.resolve(v.link) : of(null);
    link$
      .pipe(
        switchMap((link) => {
          const full = { ...body, ...(link ?? {}) };
          return this.id ? this.api.update(this.id, full) : this.api.create(full);
        }),
      )
      .subscribe({
        next: (d) => this.router.navigate(['/storage', d.id]),
        error: () => this.busy.set(false),
      });
  }
}
