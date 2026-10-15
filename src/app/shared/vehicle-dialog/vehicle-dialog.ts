import { Component, Inject, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ensureValid } from '../form-guard';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { WorkshopApi } from '../../core/api/workshop-api';
import { Vehicle } from '../../core/models';
import { VehicleAutofill } from '../vehicle-autofill';

export interface VehicleDialogData {
  /** Ägaren. Fast för en ny bil; en befintlig bil kan flyttas till annan kund via kundsidan. */
  customerId: string;
  customerName: string;
  vehicle?: Vehicle;
  /** Förifyllt regnr (det man hann skriva i en sökruta). */
  regNo?: string;
}

/** Ny eller ändrad bil. Returnerar den sparade bilen. */
@Component({
  selector: 'app-vehicle-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>{{ data.vehicle ? 'Ändra bil' : 'Ny bil' }} – {{ data.customerName }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="!grid gap-x-3 sm:grid-cols-6 !pt-2">
        <mat-form-field class="sm:col-span-2">
          <mat-label>Regnr</mat-label>
          <input matInput formControlName="regNo" appRegNo class="uppercase" (blur)="lookup()" />
          <mat-error>Ange regnr</mat-error>
        </mat-form-field>
        @if (looking()) {
          <p class="mb-3 text-sm text-gray-500 sm:col-span-4">Hämtar bilinfo…</p>
        }
        @if (note(); as n) {
          <p
            class="mb-3 rounded-lg px-3 py-2 text-sm sm:col-span-4"
            [class]="n.warn ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-900'"
          >
            {{ n.text }}
            @if (locked()) {
              <button type="button" class="ml-2 font-medium underline" (click)="unlock()">
                Ändra manuellt
              </button>
            }
          </p>
        }
        <mat-form-field class="sm:col-span-2">
          <mat-label>Märke</mat-label>
          <input matInput formControlName="make" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-2">
          <mat-label>Modell</mat-label>
          <input matInput formControlName="model" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-2">
          <mat-label>Årsmodell</mat-label>
          <input matInput type="number" inputmode="numeric" formControlName="year" />
          <mat-error>Ogiltigt år</mat-error>
        </mat-form-field>
        <mat-form-field class="sm:col-span-4">
          <mat-label>Chassinummer (VIN)</mat-label>
          <input matInput formControlName="vin" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-6">
          <mat-label>Anmärkning på bilen</mat-label>
          <textarea
            matInput
            rows="2"
            formControlName="notes"
            placeholder="t.ex. Dragkrok helt rostad. Visas för mekanikern vid varje besök."
          ></textarea>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button mat-flat-button color="primary" [disabled]="busy()">
          Spara
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class VehicleDialog {
  private readonly snack = inject(MatSnackBar);
  private readonly api = inject(WorkshopApi);
  private readonly autofill = inject(VehicleAutofill);
  private readonly ref = inject<MatDialogRef<VehicleDialog, Vehicle>>(MatDialogRef);

  readonly busy = signal(false);
  /** Svar på uppslaget när man lämnat regnr-fältet. */
  readonly note = signal<{ warn: boolean; text: string } | null>(null);
  /** Regnumret finns redan i registret: bilen får inte läggas upp en gång till. */
  readonly taken = signal(false);
  readonly looking = signal(false);
  readonly locked = signal(false);
  readonly form;

  constructor(@Inject(MAT_DIALOG_DATA) public data: VehicleDialogData) {
    const v = data.vehicle;
    this.form = inject(FormBuilder).nonNullable.group({
      regNo: [v?.regNo ?? data.regNo ?? '', [Validators.required, Validators.minLength(2)]],
      make: [v?.make ?? ''],
      model: [v?.model ?? ''],
      year: [v?.year ?? (null as number | null), [Validators.min(1900), Validators.max(2100)]],
      vin: [v?.vin ?? ''],
      notes: [v?.notes ?? ''],
    });
    // Ny bil med regnr, eller en sparad bil som bara har regnr: hämta bilinfon.
    if (this.form.controls.regNo.value && (!v || this.autofill.missingInfo(this.form))) this.lookup();
  }

  /** När man lämnat regnr-fältet: finns bilen redan, annars hämtas bilinfo och fälten låses. */
  lookup() {
    const reg = this.form.controls.regNo.value;
    this.note.set(null);
    this.taken.set(false);
    this.locked.set(false);
    if (reg === this.data.vehicle?.regNo && !this.autofill.missingInfo(this.form)) return;
    this.looking.set(true);
    this.autofill.run(this.form, reg, this.data.vehicle?.id).subscribe({
      next: (r) => {
        this.looking.set(false);
        this.taken.set(!!r.taken);
        this.locked.set(r.locked);
        this.note.set(
          r.taken
            ? {
                warn: true,
                text: `${r.note?.text ?? ''}Öppna kunden för att ändra eller återställa bilen.`,
              }
            : r.note,
        );
      },
      error: () => this.looking.set(false),
    });
  }

  /** Låser upp fälten om hämtningen blev fel eller bilen ska skrivas om. */
  unlock() {
    this.autofill.unlock(this.form);
    this.locked.set(false);
    this.note.set(null);
  }

  save() {
    if (this.taken()) {
      this.snack.open('Regnumret finns redan på en annan bil', undefined, { duration: 4000 });
      return;
    }
    if (!ensureValid(this.form, this.snack)) return;

    const v = this.form.getRawValue();
    const body = {
      regNo: v.regNo,
      make: v.make || null,
      model: v.model || null,
      year: v.year,
      vin: v.vin || null,
      notes: v.notes || null,
    };
    this.busy.set(true);
    const req = this.data.vehicle
      ? this.api.updateVehicle(this.data.vehicle.id, body)
      : this.api.createVehicle({ ...body, customerId: this.data.customerId });
    req.subscribe({ next: (c) => this.ref.close(c), error: () => this.busy.set(false) });
  }
}
