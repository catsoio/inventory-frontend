import { Component, Inject, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ensureValid } from '../form-guard';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { WorkshopApi } from '../../core/api/workshop-api';
import { CUSTOMER_TYPE_LABELS, Customer, CustomerType } from '../../core/models';

export interface CustomerDialogData {
  /** Befintlig kund att ändra, annars en ny. */
  customer?: Customer;
  /** Förifyllt namn (det man hann skriva i en sökruta). */
  name?: string;
}

/** Ny eller ändrad kund. Returnerar den sparade kunden. */
@Component({
  selector: 'app-customer-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>{{ data.customer ? 'Ändra kund' : 'Ny kund' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="!grid gap-x-3 sm:grid-cols-2 !pt-2">
        <mat-button-toggle-group
          class="mb-4 sm:col-span-2 self-start"
          hideSingleSelectionIndicator
          formControlName="type"
        >
          @for (t of types; track t[0]) {
            <mat-button-toggle [value]="t[0]">{{ t[1] }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
        <mat-form-field class="sm:col-span-2">
          <mat-label>{{
            form.controls.type.value === 'company' ? 'Företagsnamn' : 'Namn'
          }}</mat-label>
          <input matInput formControlName="name" autocomplete="off" />
          <mat-error>Ange namn</mat-error>
        </mat-form-field>
        @if (form.controls.type.value === 'company') {
          <mat-form-field class="sm:col-span-2">
            <mat-label>Organisationsnummer</mat-label>
            <input matInput formControlName="orgNo" />
          </mat-form-field>
        }
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
        <button mat-flat-button color="primary" [disabled]="busy()">Spara</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class CustomerDialog {
  private readonly snack = inject(MatSnackBar);
  private readonly api = inject(WorkshopApi);
  private readonly ref = inject<MatDialogRef<CustomerDialog, Customer>>(MatDialogRef);

  readonly busy = signal(false);
  readonly types = Object.entries(CUSTOMER_TYPE_LABELS);
  readonly form;

  constructor(@Inject(MAT_DIALOG_DATA) public data: CustomerDialogData) {
    const c = data.customer;
    this.form = inject(FormBuilder).nonNullable.group({
      type: [(c?.type ?? 'private') as CustomerType],
      name: [c?.name ?? data.name ?? '', Validators.required],
      orgNo: [c?.orgNo ?? ''],
      phone: [c?.phone ?? ''],
      email: [c?.email ?? '', Validators.email],
      notes: [c?.notes ?? ''],
    });
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;

    const v = this.form.getRawValue();
    const body = {
      ...v,
      orgNo: v.type === 'company' ? v.orgNo || null : null,
      phone: v.phone || null,
      email: v.email || null,
      notes: v.notes || null,
    };
    this.busy.set(true);
    const req = this.data.customer
      ? this.api.updateCustomer(this.data.customer.id, body)
      : this.api.createCustomer(body);
    req.subscribe({ next: (c) => this.ref.close(c), error: () => this.busy.set(false) });
  }
}
