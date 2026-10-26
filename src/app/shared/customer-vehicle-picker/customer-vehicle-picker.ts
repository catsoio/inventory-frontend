import {
  Component,
  DestroyRef,
  Input,
  Optional,
  Self,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, ControlValueAccessor, FormControl, NgControl } from '@angular/forms';
import { debounceTime, of, startWith, switchMap } from 'rxjs';
import { WorkshopApi } from '../../core/api/workshop-api';
import { Customer, Vehicle } from '../../core/models';

/** Det en vald kund består av här. */
export type CustomerRef = Pick<Customer, 'id' | 'name' | 'code' | 'phone'>;

/**
 * Formulärvärdet. Ut: alltid ifyllt, eller null tills både kund och bil valts.
 * In: räcker med `customerId` och `vehicleId`, resten hämtas ur registret.
 */
export interface PickerValue {
  customerId: string;
  vehicleId: string;
  customer?: CustomerRef;
  vehicle?: Vehicle;
  /**
   * Något är skrivet men inte valt ur listan: kunden och/eller bilen skapas när formuläret sparas
   * (se `LinkResolver`). `customerId`/`vehicleId` är då tomma.
   */
  pending?: { customerId?: string; customerName?: string; customerPhone?: string; regNo?: string };
}

/** Skrivet som ett telefonnummer (siffror, mellanslag, bindestreck, +, parenteser) och inte ett namn. */
export const isPhoneText = (s: string) =>
  /^\+?[\d\s\-()]{5,}$/.test(s.trim()) && s.replace(/\D/g, '').length >= 5;

/** Giltigt när något valts ur listan (ett objekt) eller skrivits (då skapas det vid spar). */
const filled = (min: number) => (c: AbstractControl) => {
  const v = c.value;
  if (v && typeof v === 'object') return null;
  return typeof v === 'string' && v.trim().length >= min ? null : { required: true };
};

/**
 * Kund och bil som hänger ihop: välj kund så visas bara hennes bilar, välj bil först så
 * fylls kunden i. Skriver man något som inte finns skapas kunden och/eller bilen när formuläret
 * sparas (`LinkResolver`), så det blir ingen dialog i dialogen.
 */
@Component({
  selector: 'app-customer-vehicle-picker',
  standalone: false,
  template: `
    <div class="grid gap-x-3 sm:grid-cols-2">
      <mat-form-field>
        <mat-label>{{ customerLabel }}</mat-label>
        <mat-icon matPrefix class="mr-2 text-gray-400">person</mat-icon>
        <input
          matInput
          [formControl]="customer"
          [matAutocomplete]="customerAuto"
          (input)="edited.set(true)"
          autocomplete="off"
          placeholder="Namn eller telefonnummer"
        />
        <mat-autocomplete
          #customerAuto="matAutocomplete"
          [displayWith]="showCustomer"
          (optionSelected)="pickCustomer($event.option.value)"
        >
          @for (c of customerOptions(); track c.id) {
            <mat-option [value]="c">
              {{ c.name }}
              <span class="ml-2 text-xs text-gray-500">{{ c.code }} {{ c.phone }}</span>
            </mat-option>
          }
        </mat-autocomplete>
        <mat-error>Ange kund</mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>Registreringsnummer</mat-label>
        <app-sv-flag matPrefix class="mr-2" />
        <input
          matInput
          [formControl]="vehicle"
          [matAutocomplete]="vehicleAuto"
          (input)="edited.set(true)"
          appRegNo
          class="uppercase"
          [placeholder]="customerRef() ? 'Kundens bilar eller nytt regnr' : 'Sök eller skriv regnr'"
        />
        <mat-autocomplete
          #vehicleAuto="matAutocomplete"
          [displayWith]="showVehicle"
          (optionSelected)="pickVehicle($event.option.value)"
        >
          @for (v of vehicleOptions(); track v.id) {
            <mat-option [value]="v">
              {{ v.regNo }}
              <span class="ml-2 text-xs text-gray-500">
                {{ carLabel(v) }}
                @if (!customerRef() && v.customer) {
                  · {{ v.customer.name }}
                }
              </span>
            </mat-option>
          }
        </mat-autocomplete>
        <mat-error>Ange registreringsnummer</mat-error>
      </mat-form-field>
    </div>

    @if (newCustomer() || newVehicle()) {
      <div class="mb-3 -mt-1 flex items-start gap-1 text-xs text-gray-600">
        <mat-icon class="!h-4 !w-4 shrink-0 !text-base text-brand">add_circle</mat-icon>
        <span>
          @if (newCustomer() && newVehicle()) {
            Ny kund{{ phoneOnly() ? ' med bara telefonnummer' : '' }} och ny bil skapas när du sparar.
          } @else if (newCustomer()) {
            Ny kund{{ phoneOnly() ? ' med bara telefonnummer' : '' }} skapas när du sparar.
          } @else {
            Ny bil skapas åt {{ customerRef()?.name }} när du sparar.
          }
          Resten fyller du i senare på kortet.
        </span>
      </div>
    }

    @if (selectedVehicle(); as v) {
      <div class="mb-4 text-sm">
        <span class="font-medium">{{ carLabel(v) || v.regNo }}</span>
        @if (v.notes) {
          <div class="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-900">
            <mat-icon class="!h-4 !w-4 align-middle !text-base">warning</mat-icon>
            {{ v.notes }}
          </div>
        }
      </div>
    }
  `,
})
export class CustomerVehiclePicker implements ControlValueAccessor {
  private readonly api = inject(WorkshopApi);
  private readonly destroyRef = inject(DestroyRef);

  /** Gammal post utan register: visa den gamla texten tills man väljer ur listan. */
  @Input() set legacy(v: { customer?: string; regNo?: string } | null) {
    if (!v || this.customerRef()) return;
    this.hasLegacy = true;
    this.customer.setValue(v.customer ?? '', { emitEvent: false });
    this.vehicle.setValue(v.regNo ?? '', { emitEvent: false });
  }

  /** Rubrik på kundfältet. */
  @Input() customerLabel = 'Kund';
  /** Valfritt: bilen får saknas, och hela väljaren får vara tom (t.ex. kontantförsäljning). */
  @Input() set optional(v: boolean) {
    const [c, r] = v ? [[], []] : [filled(1), filled(2)];
    this.customer.setValidators(c);
    this.vehicle.setValidators(r);
    this.customer.updateValueAndValidity({ emitEvent: false });
    this.vehicle.updateValueAndValidity({ emitEvent: false });
    this.isOptional = v;
  }

  private isOptional = false;
  private hasLegacy = false;
  readonly customerOptions = signal<Customer[]>([]);
  private readonly ownCars = signal<Vehicle[]>([]);
  private readonly foundCars = signal<Vehicle[]>([]);
  private readonly carQuery = signal('');
  readonly customerText = signal('');
  readonly customerRef = signal<CustomerRef | null>(null);
  readonly selectedVehicle = signal<Vehicle | null>(null);

  /** Skrivet men inte valt: skapas vid spar. */
  readonly newCustomer = computed(
    () => !this.customerRef() && this.customerText().trim().length > 0 && !this.isLegacyText(),
  );
  /** Det som skrivits är ett telefonnummer: kunden skapas med numret, namnet fyller man i senare. */
  readonly phoneOnly = computed(() => this.newCustomer() && isPhoneText(this.customerText()));
  readonly newVehicle = computed(
    () => !this.selectedVehicle() && this.carQuery().trim().length >= 2 && !this.isLegacyText(),
  );
  /** Sant när man själv skrivit i något av fälten. */
  readonly edited = signal(false);
  private isLegacyText() {
    return this.hasLegacy && !this.edited();
  }

  readonly customer = new FormControl<string | CustomerRef>('', {
    nonNullable: true,
    validators: filled(1),
  });
  readonly vehicle = new FormControl<string | Vehicle>('', {
    nonNullable: true,
    validators: filled(2),
  });

  /** Kundens bilar filtrerade på det som skrivits; utan kund söks alla bilar. */
  readonly vehicleOptions = computed(() => {
    if (!this.customerRef()) return this.foundCars();
    const q = this.carQuery().toLowerCase();
    return this.ownCars().filter(
      (v) => !q || `${v.regNo} ${v.make ?? ''} ${v.model ?? ''}`.toLowerCase().includes(q),
    );
  });

  private onChange: (v: PickerValue | null) => void = () => {};
  onTouched: () => void = () => {};

  constructor(@Optional() @Self() ngControl: NgControl | null) {
    if (ngControl) ngControl.valueAccessor = this;
    this.watchTyping();
  }

  carLabel = (v: Vehicle) => [v.make, v.model, v.year].filter(Boolean).join(' ');
  showCustomer = (c: string | CustomerRef | null) => (!c ? '' : typeof c === 'string' ? c : c.name);
  showVehicle = (v: string | Vehicle | null) => (!v ? '' : typeof v === 'string' ? v : v.regNo);

  /** Sök i registren medan man skriver. */
  private watchTyping() {
    this.customer.valueChanges
      .pipe(
        startWith(this.customer.value),
        debounceTime(150),
        switchMap((v) => {
          this.customerText.set(typeof v === 'string' ? v : '');
          return typeof v === 'string' ? this.api.customers({ q: v.trim(), limit: 15 }) : of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((p) => p && this.customerOptions.set(p.items));

    // Skriver man om kundfältet efter ett val är valet borta, och bilen med det.
    this.customer.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
      if (typeof v !== 'string') return;
      this.edited.set(true);
      this.customerRef.set(null);
      this.ownCars.set([]);
      if (this.vehicle.value && typeof this.vehicle.value === 'object') this.setVehicle('');
      this.emit();
    });

    this.vehicle.valueChanges
      .pipe(
        startWith(this.vehicle.value),
        debounceTime(150),
        switchMap((v) => {
          this.carQuery.set(typeof v === 'string' ? v.trim() : '');
          if (typeof v !== 'string') return of(null);
          // Startvärdet (tomt) får inte skriva över en kund och bil som formuläret just fyllt i.
          if (this.selectedVehicle() || this.edited()) {
            this.selectedVehicle.set(null);
            this.emit();
          }
          return this.customerRef() ? of(null) : this.api.vehicles({ q: v.trim(), limit: 15 });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((p) => p && this.foundCars.set(p.items));
  }

  pickCustomer(value: Customer) {
    this.setCustomer(value);
  }

  pickVehicle(value: Vehicle) {
    this.setVehicle(value);
  }

  private setCustomer(c: CustomerRef) {
    this.customerRef.set(c);
    this.customer.setValue(c, { emitEvent: false });
    this.customerText.set('');
    this.api.vehicles({ customerId: c.id, limit: 100 }).subscribe((p) => {
      this.ownCars.set(p.items);
      // En enda bil: välj den direkt.
      if (!this.vehicle.value || typeof this.vehicle.value === 'string') {
        if (p.items.length === 1) this.setVehicle(p.items[0]);
      }
    });
    this.emit();
  }

  /** Väljer bilen; hör den till en annan kund hamnar den kunden i kundfältet. */
  private setVehicle(v: Vehicle | '') {
    this.vehicle.setValue(v, { emitEvent: false });
    this.selectedVehicle.set(v || null);
    this.carQuery.set('');
    if (v && v.customer && this.customerRef()?.id !== v.customer.id) {
      this.setCustomer(v.customer);
    }
    this.emit();
  }

  private emit() {
    const customer = this.customerRef();
    const vehicle = this.selectedVehicle();
    if (customer && vehicle) {
      return this.onChange({ customerId: customer.id, vehicleId: vehicle.id, customer, vehicle });
    }
    // Gammal text från före registren är ingen ny kund förrän man ändrat den.
    if (this.isLegacyText()) return this.onChange(null);
    const c = this.customer.value;
    const v = this.vehicle.value;
    const customerName = typeof c === 'string' ? c.trim() : '';
    const regNo = typeof v === 'string' ? v.trim().toUpperCase() : '';
    const customerPhone = !customer && isPhoneText(customerName) ? customerName : undefined;
    if (regNo.length >= 2 && (customer || customerName)) {
      return this.onChange({
        customerId: '',
        vehicleId: '',
        pending: {
          customerId: customer?.id,
          customerName: customer ? customer.name : customerName,
          customerPhone,
          regNo,
        },
      });
    }
    // Valfri bil: bara en kund räcker.
    if (this.isOptional && customer) {
      return this.onChange({ customerId: customer.id, vehicleId: '', customer });
    }
    if (this.isOptional && customerName) {
      return this.onChange({
        customerId: '',
        vehicleId: '',
        pending: { customerName, customerPhone },
      });
    }
    this.onChange(null);
  }

  // --- ControlValueAccessor ---

  writeValue(v: PickerValue | null) {
    if (!v) {
      // Formuläret nollställer värdet vid start; den gamla texten ska stå kvar.
      if (this.hasLegacy) return;
      this.customerRef.set(null);
      this.selectedVehicle.set(null);
      this.customer.setValue('', { emitEvent: false });
      this.vehicle.setValue('', { emitEvent: false });
      return;
    }
    // Bara en kund (ingen bil): hämta kunden och hennes bilar.
    if (!v.vehicleId && v.customerId) {
      this.api.customer(v.customerId).subscribe((c) => {
        this.customerRef.set(c);
        this.customer.setValue(c, { emitEvent: false });
        this.api
          .vehicles({ customerId: c.id, limit: 100 })
          .subscribe((p) => this.ownCars.set(p.items));
      });
      return;
    }
    // Bilen bär sin ägare, så en hämtning räcker för att fylla i båda fälten.
    this.api.vehicle(v.vehicleId).subscribe({
      next: (car) => {
        this.vehicle.setValue(car, { emitEvent: false });
        this.selectedVehicle.set(car);
        if (car.customer) {
          this.customerRef.set(car.customer);
          this.customer.setValue(car.customer, { emitEvent: false });
          this.api
            .vehicles({ customerId: car.customer.id, limit: 100 })
            .subscribe((p) => this.ownCars.set(p.items));
        }
      },
    });
  }
  registerOnChange(fn: (v: PickerValue | null) => void) {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean) {
    for (const c of [this.customer, this.vehicle]) {
      if (disabled) c.disable({ emitEvent: false });
      else c.enable({ emitEvent: false });
    }
  }
}
