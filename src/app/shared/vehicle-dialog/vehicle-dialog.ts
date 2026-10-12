import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { WorkshopApi } from '../../core/api/workshop-api';
import { Vehicle } from '../../core/models';

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
      <mat-dialog-content class="grid gap-x-3 sm:grid-cols-6 !pt-2">
        <mat-form-field class="sm:col-span-2">
          <mat-label>Regnr</mat-label>
          <input matInput formControlName="regNo" class="uppercase" autocomplete="off" />
          <mat-error>Ange regnr</mat-error>
        </mat-form-field>
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
        <button mat-flat-button color="primary" [disabled]="form.invalid || busy()">Spara</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class VehicleDialog {
  private readonly api = inject(WorkshopApi);
  private readonly ref = inject<MatDialogRef<VehicleDialog, Vehicle>>(MatDialogRef);

  readonly busy = signal(false);
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
  }

  save() {
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
