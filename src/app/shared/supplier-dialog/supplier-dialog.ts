import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { WorkshopApi } from '../../core/api/workshop-api';
import { Supplier } from '../../core/models';

export interface SupplierDialogData {
  /** Befintlig leverantör att ändra, annars en ny. */
  supplier?: Supplier;
  name?: string;
}

/** Ny eller ändrad leverantör. Returnerar den sparade leverantören. */
@Component({
  selector: 'app-supplier-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>{{ data.supplier ? 'Ändra leverantör' : 'Ny leverantör' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="grid gap-x-3 !pt-2 sm:grid-cols-2">
        <mat-form-field class="sm:col-span-2">
          <mat-label>Företagsnamn</mat-label>
          <input matInput formControlName="name" autocomplete="off" />
          <mat-error>Ange namn</mat-error>
        </mat-form-field>
        <mat-form-field class="sm:col-span-2">
          <mat-label>Organisationsnummer</mat-label>
          <input matInput formControlName="orgNo" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Telefon</mat-label>
          <input matInput type="tel" formControlName="phone" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>E-post</mat-label>
          <input matInput type="email" formControlName="email" />
          <mat-error>Ogiltig e-postadress</mat-error>
        </mat-form-field>
        <mat-form-field class="sm:col-span-2">
          <mat-label>Anmärkning</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button mat-flat-button color="primary" [disabled]="form.invalid || busy()">Spara</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class SupplierDialog {
  private readonly api = inject(WorkshopApi);
  private readonly ref = inject<MatDialogRef<SupplierDialog, Supplier>>(MatDialogRef);

  readonly busy = signal(false);
  readonly form;

  constructor(@Inject(MAT_DIALOG_DATA) public data: SupplierDialogData) {
    const s = data.supplier;
    this.form = inject(FormBuilder).nonNullable.group({
      name: [s?.name ?? data.name ?? '', Validators.required],
      orgNo: [s?.orgNo ?? ''],
      phone: [s?.phone ?? ''],
      email: [s?.email ?? '', Validators.email],
      notes: [s?.notes ?? ''],
    });
  }

  save() {
    const v = this.form.getRawValue();
    const body = {
      name: v.name,
      orgNo: v.orgNo || null,
      phone: v.phone || null,
      email: v.email || null,
      notes: v.notes || null,
    };
    this.busy.set(true);
    const req = this.data.supplier
      ? this.api.updateSupplier(this.data.supplier.id, body)
      : this.api.createSupplier(body);
    req.subscribe({ next: (s) => this.ref.close(s), error: () => this.busy.set(false) });
  }
}
