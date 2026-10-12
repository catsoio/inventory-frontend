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
import { MatDialog } from '@angular/material/dialog';
import { debounceTime, of, startWith, switchMap } from 'rxjs';
import { WorkshopApi } from '../../core/api/workshop-api';
import { Customer, Vehicle } from '../../core/models';
import { CustomerDialog } from '../customer-dialog/customer-dialog';
import { VehicleDialog } from '../vehicle-dialog/vehicle-dialog';

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
}

const NEW = '__new__';

/** Giltigt först när något valts ur listan (ett objekt), inte bara skrivits. */
const picked = (c: AbstractControl) =>
  c.value && typeof c.value === 'object' ? null : { pick: true };

/**
 * Kund och bil som hänger ihop: välj kund så visas bara hennes bilar, välj bil först så
 * fylls kunden i. "+ Ny kund" och "+ Ny bil" öppnar en dialog utan att man lämnar formuläret.
 */
@Component({
  selector: 'app-customer-vehicle-picker',
  standalone: false,
  template: `
    <div class="grid gap-x-3 sm:grid-cols-2">
      <mat-form-field>
        <mat-label>Kund</mat-label>
        <mat-icon matPrefix class="mr-2 text-gray-400">person</mat-icon>
        <input
          matInput
          [formControl]="customer"
          [matAutocomplete]="customerAuto"
          autocomplete="off"
          placeholder="Sök namn, telefon eller KU-nummer"
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
          <mat-option [value]="NEW" class="!font-medium !text-brand">
            + Ny kund{{ customerText() ? ' "' + customerText() + '"' : '' }}
          </mat-option>
        </mat-autocomplete>
        <mat-error>Välj en kund ur listan, eller skapa en ny</mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>Registreringsnummer</mat-label>
        <app-sv-flag matPrefix class="mr-2" />
        <input
          matInput
          [formControl]="vehicle"
          [matAutocomplete]="vehicleAuto"
          autocomplete="off"
          class="uppercase"
          [placeholder]="customerRef() ? 'Kundens bilar' : 'Sök regnr'"
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
          @if (customerRef()) {
            <mat-option [value]="NEW" class="!font-medium !text-brand">
              + Ny bil åt {{ customerRef()!.name }}
            </mat-option>
          }
        </mat-autocomplete>
        <mat-error>Välj en bil ur listan</mat-error>
      </mat-form-field>
    </div>

    @if (selectedVehicle(); as v) {
      <div class="mb-4 text-sm">
        <span class="font-medium">{{ carLabel(v) || v.regNo }}</span>
        @if (v.notes) {
          <div class="mt-1 rounded bg-amber-50 px-2 py-1 text-amber-900">
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
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  /** Gammal post utan register: visa den gamla texten tills man väljer ur listan. */
  @Input() set legacy(v: { customer?: string; regNo?: string } | null) {
    if (!v || this.customerRef()) return;
    this.hasLegacy = true;
    this.customer.setValue(v.customer ?? '', { emitEvent: false });
    this.vehicle.setValue(v.regNo ?? '', { emitEvent: false });
  }

  private hasLegacy = false;
  readonly NEW = NEW;
  readonly customerOptions = signal<Customer[]>([]);
  private readonly ownCars = signal<Vehicle[]>([]);
  private readonly foundCars = signal<Vehicle[]>([]);
  private readonly carQuery = signal('');
  readonly customerText = signal('');
  readonly customerRef = signal<CustomerRef | null>(null);
  readonly selectedVehicle = signal<Vehicle | null>(null);

  readonly customer = new FormControl<string | CustomerRef>('', {
    nonNullable: true,
    validators: picked,
  });
  readonly vehicle = new FormControl<string | Vehicle>('', {
    nonNullable: true,
    validators: picked,
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
  showCustomer = (c: string | CustomerRef | null) =>
    !c || c === NEW ? '' : typeof c === 'string' ? c : c.name;
  showVehicle = (v: string | Vehicle | null) =>
    !v || v === NEW ? '' : typeof v === 'string' ? v : v.regNo;

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
          this.selectedVehicle.set(null);
          this.emit();
          return this.customerRef() ? of(null) : this.api.vehicles({ q: v.trim(), limit: 15 });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((p) => p && this.foundCars.set(p.items));
  }

  pickCustomer(value: Customer | string) {
    if (value !== NEW) return this.setCustomer(value as Customer);
    const name = this.customerText();
    this.customer.setValue(name);
    this.dialog
      .open<CustomerDialog, unknown, Customer>(CustomerDialog, {
        data: { name },
        width: '560px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((c) => c && this.setCustomer(c));
  }

  pickVehicle(value: Vehicle | string) {
    const c = this.customerRef();
    if (value !== NEW) return this.setVehicle(value as Vehicle);
    const regNo = this.carQuery().toUpperCase();
    this.vehicle.setValue(regNo);
    if (!c) return;
    this.dialog
      .open<VehicleDialog, unknown, Vehicle>(VehicleDialog, {
        data: { customerId: c.id, customerName: c.name, regNo },
        width: '640px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((v) => {
        if (!v) return;
        this.ownCars.update((l) => [...l, v]);
        this.setVehicle(v);
      });
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
    this.onChange(
      customer && vehicle
        ? { customerId: customer.id, vehicleId: vehicle.id, customer, vehicle }
        : null,
    );
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
