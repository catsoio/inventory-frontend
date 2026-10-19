import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { switchMap } from 'rxjs';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { PAYMENT_METHOD_LABELS } from '../../core/models';
import { HasUnsaved } from '../../core/unsaved-guard';
import { ensureValid } from '../../shared/form-guard';
import { LinkResolver } from '../../shared/customer-vehicle-picker/link-resolver';
import type { PickerValue } from '../../shared/customer-vehicle-picker/customer-vehicle-picker';

/**
 * Kortet för att lägga till en gammal faktura eller ett gammalt kvitto (arbete som gjordes innan
 * systemet användes). Vid Spara skapas en klar arbetsorder som bokförs direkt med det datum man
 * anger och nästa löpnummer, så den syns på kundens och bilens historik och i Ekonomi.
 */
@Component({
  selector: 'app-invoice-new',
  standalone: false,
  template: `
    <app-card-page listLink="/finance/invoices" listLabel="Fakturor" newTitle="Lägg till faktura">
      <div actions class="flex items-center gap-2">
        <button mat-flat-button color="primary" type="button" (click)="save()" [disabled]="busy()">
          Spara
        </button>
      </div>
      <form [formGroup]="form" class="flex flex-col gap-4">
        <p class="rounded-lg bg-white p-4 text-sm text-gray-600 shadow-sm">
          För arbete som gjordes innan ni började använda systemet. När du sparar bokförs fakturan
          direkt med datumet nedan och får nästa fakturanummer, och går sedan inte att ändra.
          Företagskund ger faktura, privatkund kvitto.
        </p>
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Kund och bil</h2>
          <app-customer-vehicle-picker formControlName="link" />
        </section>
        <section class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-6">
          <h2 class="mb-2 text-base font-semibold sm:col-span-6">Faktura</h2>
          <app-date-field
            class="sm:col-span-3"
            label="Fakturadatum"
            icon="event"
            error="Ange datum"
            formControlName="date"
          />
          <mat-form-field class="sm:col-span-3" subscriptSizing="dynamic">
            <mat-label>Belopp (kr, exkl. moms)</mat-label>
            <input matInput type="number" inputmode="decimal" min="0" formControlName="price" />
            <mat-hint>{{ inclHint() }}</mat-hint>
            <mat-error>Ange belopp över 0</mat-error>
          </mat-form-field>
          <mat-form-field class="mt-4 sm:col-span-6">
            <mat-label>Utfört (står på dokumentet)</mat-label>
            <textarea matInput rows="3" formControlName="performed"></textarea>
            <mat-error>Obligatoriskt</mat-error>
          </mat-form-field>
          <mat-form-field class="sm:col-span-6">
            <mat-label>Garanti (valfritt)</mat-label>
            <input matInput formControlName="warranty" />
          </mat-form-field>
        </section>
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Betalning</h2>
          <div class="flex flex-col items-start gap-3">
            <mat-checkbox formControlName="paid">Redan betald</mat-checkbox>
            @if (form.controls.paid.value) {
              <mat-form-field class="w-60">
                <mat-label>Betalsätt</mat-label>
                <mat-select formControlName="method">
                  @for (m of methods; track m[0]) {
                    <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
          </div>
        </section>
      </form>
    </app-card-page>
  `,
})
export class InvoiceNew implements HasUnsaved {
  private readonly api = inject(WorkOrderApi);
  private readonly links = inject(LinkResolver);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  readonly methods = Object.entries(PAYMENT_METHOD_LABELS);
  readonly busy = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    link: [null as PickerValue | null, Validators.required],
    date: ['', Validators.required],
    performed: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0.01)]],
    warranty: [''],
    paid: [true],
    method: ['card'],
  });

  hasUnsaved() {
    return this.form.dirty;
  }

  inclHint() {
    const p = this.form.controls.price.value;
    return p > 0 ? `= ${(p * 1.25).toLocaleString('sv-SE')} kr inkl. moms` : '';
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.links
      .resolve(v.link!)
      .pipe(
        switchMap((link) =>
          this.api.importInvoice({
            ...link,
            date: v.date,
            performed: v.performed.trim(),
            price: Math.round(v.price * 100),
            warranty: v.warranty.trim() || undefined,
            paid: v.paid,
            method: v.paid ? v.method : undefined,
          }),
        ),
      )
      .subscribe({
        next: (o) => {
          this.busy.set(false);
          this.snack.open('Fakturan är tillagd', undefined, { duration: 2500 });
          this.form.markAsPristine();
          this.router.navigate(['/finance/invoices', o.id]);
        },
        error: () => this.busy.set(false),
      });
  }
}
