import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { StorageApi } from '../../../core/api/storage-api';
import { PAYMENT_METHOD_LABELS, PaymentMethod, StorageDeposit } from '../../../core/models';
import { dateInput, dateIso } from '../storage-format';

export interface StorageActionData {
  deposit: StorageDeposit;
  action: 'pay' | 'pickup';
}

@Component({
  selector: 'app-storage-action-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>
      {{ data.action === 'pay' ? 'Markera som betald' : 'Lämna ut' }} –
      {{ data.deposit.vehicle.regNo }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-dialog-content class="flex flex-col gap-1 !pt-2">
        <p class="text-sm text-gray-600">
          {{ data.deposit.customer.name }} · {{ data.deposit.code }} · avgift
          <b>{{ data.deposit.fee | kr }}</b>
        </p>
        @if (data.action === 'pickup' && unpaid) {
          <p class="rounded bg-amber-50 p-2 text-sm text-amber-800">
            Avgiften är inte betald. Ta betalt nu eller lämna ut och betala senare.
          </p>
        }
        @if (data.action === 'pay' || unpaid) {
          <mat-form-field>
            <mat-label>{{
              data.action === 'pay' ? 'Betalsätt' : 'Ta betalt nu (valfritt)'
            }}</mat-label>
            <mat-select formControlName="method">
              @if (data.action === 'pickup') {
                <mat-option value="">Betalas inte nu</mat-option>
              }
              @for (m of methods; track m[0]) {
                <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
              }
            </mat-select>
            <mat-error>Välj betalsätt</mat-error>
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>{{ data.action === 'pay' ? 'Betaldatum' : 'Utlämningsdatum' }}</mat-label>
          <input matInput type="date" formControlName="date" />
          <mat-error>Ange datum</mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button mat-flat-button color="primary" [disabled]="form.invalid || busy()">
          {{ data.action === 'pay' ? 'Markera betald' : 'Lämna ut' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class StorageActionDialog {
  private readonly api = inject(StorageApi);
  private readonly ref = inject<MatDialogRef<StorageActionDialog, StorageDeposit>>(MatDialogRef);

  readonly busy = signal(false);
  readonly methods = Object.entries(PAYMENT_METHOD_LABELS);
  readonly unpaid: boolean;
  readonly form;

  constructor(@Inject(MAT_DIALOG_DATA) public data: StorageActionData) {
    this.unpaid = data.deposit.paymentStatus === 'unpaid';
    this.form = inject(FormBuilder).nonNullable.group({
      method: [
        data.action === 'pay' ? (data.deposit.paymentMethod ?? '') : '',
        data.action === 'pay' ? Validators.required : [],
      ],
      date: [dateInput(new Date().toISOString()), Validators.required],
    });
  }

  submit() {
    const { method, date } = this.form.getRawValue();
    this.busy.set(true);
    const id = this.data.deposit.id;
    const req =
      this.data.action === 'pay'
        ? this.api.pay(id, method as PaymentMethod, dateIso(date))
        : this.api.pickUp(id, {
            pickedUpAt: dateIso(date),
            paymentMethod: this.unpaid && method ? (method as PaymentMethod) : undefined,
          });
    req.subscribe({
      next: (d) => this.ref.close(d),
      error: () => this.busy.set(false),
    });
  }
}
