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
        @if (company()) {
          <!-- Ett företag börjar med organisationsnumret: resten kan hämtas ur det. -->
          <mat-form-field class="sm:col-span-2">
            <mat-label>Organisationsnummer</mat-label>
            <input matInput formControlName="orgNo" placeholder="556123-4567" autocomplete="off" />
          </mat-form-field>
          <app-company-lookup
            class="-mt-2 mb-2 sm:col-span-2"
            [form]="form"
            [lock]="!data.customer"
            [(manual)]="manual"
          />
        }
        <mat-form-field class="sm:col-span-2">
          <mat-label>{{ company() ? 'Företagsnamn' : 'Namn' }}</mat-label>
          <input matInput formControlName="name" autocomplete="off" [readonly]="locked()" />
          @if (locked()) {
            <mat-icon matSuffix class="!text-gray-400">lock</mat-icon>
          }
          <mat-error>
            @if (locked()) {
              Skriv organisationsnumret först
            } @else {
              Ange namn
            }
          </mat-error>
        </mat-form-field>
        @if (company()) {
          <mat-form-field class="sm:col-span-2">
            <mat-label>Momsregistreringsnummer</mat-label>
            <input
              matInput
              formControlName="vatNumber"
              placeholder="SE556123456701"
              [readonly]="locked()"
            />
            @if (locked()) {
              <mat-icon matSuffix class="!text-gray-400">lock</mat-icon>
            }
          </mat-form-field>
          <mat-form-field class="sm:col-span-2">
            <mat-label>Kontaktperson</mat-label>
            <input matInput formControlName="contactPerson" autocomplete="off" />
          </mat-form-field>
          <mat-form-field class="sm:col-span-2">
            <mat-label>Adress (krävs på faktura)</mat-label>
            <input matInput formControlName="address" autocomplete="off" [readonly]="locked()" />
            @if (locked()) {
              <mat-icon matSuffix class="!text-gray-400">lock</mat-icon>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Postnummer</mat-label>
            <input matInput formControlName="postalCode" autocomplete="off" [readonly]="locked()" />
            @if (locked()) {
              <mat-icon matSuffix class="!text-gray-400">lock</mat-icon>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Ort</mat-label>
            <input matInput formControlName="city" autocomplete="off" [readonly]="locked()" />
            @if (locked()) {
              <mat-icon matSuffix class="!text-gray-400">lock</mat-icon>
            }
          </mat-form-field>
        } @else {
          <mat-form-field class="sm:col-span-2">
            <mat-label>Personnummer</mat-label>
            <input matInput formControlName="orgNo" autocomplete="off" />
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
  /** Användaren valde "Fyll i för hand" för ett företag som registret inte känner. */
  readonly manual = signal(false);
  readonly types = Object.entries(CUSTOMER_TYPE_LABELS);
  readonly form;

  constructor(@Inject(MAT_DIALOG_DATA) public data: CustomerDialogData) {
    const c = data.customer;
    this.form = inject(FormBuilder).nonNullable.group({
      type: [(c?.type ?? 'private') as CustomerType],
      name: [c?.name ?? data.name ?? '', Validators.required],
      orgNo: [c?.orgNo ?? ''],
      vatNumber: [c?.vatNumber ?? ''],
      contactPerson: [c?.contactPerson ?? ''],
      address: [c?.address ?? ''],
      postalCode: [c?.postalCode ?? ''],
      city: [c?.city ?? ''],
      phone: [c?.phone ?? ''],
      email: [c?.email ?? '', Validators.email],
      notes: [c?.notes ?? ''],
    });
  }

  company(): boolean {
    return this.form.controls.type.value === 'company';
  }

  /** En ny kund som är ett företag: företagets egna uppgifter fylls i av organisationsnumret. */
  locked(): boolean {
    return !this.data.customer && this.company() && !this.manual();
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;

    const { vatNumber, address, postalCode, city, ...v } = this.form.getRawValue();
    const body = {
      ...v,
      orgNo: v.orgNo || null,
      contactPerson: v.type === 'company' ? v.contactPerson || null : null,
      // Dialogen visar adressen bara för ett företag; en privatkunds adress rörs aldrig här.
      ...(v.type === 'company'
        ? {
            vatNumber: vatNumber || null,
            address: address || null,
            postalCode: postalCode || null,
            city: city || null,
          }
        : {}),
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
