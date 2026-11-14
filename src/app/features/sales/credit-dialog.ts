import { Component, inject } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface CreditResult {
  reason: string;
  restock: boolean;
  /** Ge kortbetalningen som gick genom Stripe tillbaka till kunden. */
  refund: boolean;
}

/**
 * Frågar varför ett dokument krediteras, om delarna går tillbaka i lagret och, när kunden betalade
 * med kort genom Stripe (läsaren eller betallänken), om pengarna ska tillbaka till kortet.
 */
@Component({
  selector: 'app-credit-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Kreditera {{ data.code }}?</h2>
    <mat-dialog-content class="!pt-2">
      <p class="mb-3 text-sm text-gray-600">
        En kreditfaktura på {{ data.total | kr }} upphäver hela dokumentet. {{ data.code }} står
        kvar som det var, och kreditfakturan räknas i momsrapporten den dag den utfärdas. Det går
        inte att ångra.
        @if (data.paid && !data.refundable) {
          Kunden har betalat: pengarna betalas inte tillbaka härifrån, utan du betalar tillbaka
          kunden själv.
        }
      </p>
      <mat-form-field class="w-full">
        <mat-label>Varför?</mat-label>
        <input matInput [formControl]="reason" maxlength="200" cdkFocusInitial />
        <mat-error>Ange orsaken.</mat-error>
      </mat-form-field>
      @if (data.hasParts) {
        <mat-slide-toggle class="block" [formControl]="restock">
          Lägg tillbaka delarna i lagret
        </mat-slide-toggle>
      }
      @if (data.refundable) {
        <mat-slide-toggle class="mt-3 block" [formControl]="refund">
          Betala tillbaka {{ data.refundable | kr }} till kundens kort
        </mat-slide-toggle>
        <p class="mt-1 text-xs text-gray-500">
          Kunden betalade med kort via Stripe. Pengarna går tillbaka till samma kort, oftast inom
          några bankdagar.
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Avbryt</button>
      <button
        mat-flat-button
        color="warn"
        type="button"
        [disabled]="reason.invalid"
        (click)="
          ref.close({
            reason: reason.value.trim(),
            restock: restock.value,
            refund: !!data.refundable && refund.value,
          })
        "
      >
        Kreditera
      </button>
    </mat-dialog-actions>
  `,
})
export class CreditDialog {
  readonly data = inject<{
    code: string;
    total: number;
    paid: boolean;
    hasParts: boolean;
    /** Öre som gick att betala tillbaka till kortet via Stripe; 0 när inget kom den vägen. */
    refundable?: number;
  }>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<CreditDialog, CreditResult>);
  readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)],
  });
  readonly restock = new FormControl(true, { nonNullable: true });
  readonly refund = new FormControl(true, { nonNullable: true });
}
