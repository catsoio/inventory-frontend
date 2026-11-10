import { Component, inject } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface CreditResult {
  reason: string;
  restock: boolean;
}

/** Frågar varför ett dokument krediteras och om delarna går tillbaka i lagret. */
@Component({
  selector: 'app-credit-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Kreditera {{ data.code }}?</h2>
    <mat-dialog-content class="!pt-2">
      <p class="mb-3 text-sm text-gray-600">
        En kreditfaktura på {{ data.total | kr }} upphäver hela dokumentet. {{ data.code }} står kvar
        som det var, och kreditfakturan räknas i momsrapporten den dag den utfärdas. Det går inte att
        ångra. @if (data.paid) {
          Fakturan är markerad betald: pengarna återbetalas inte här utan du betalar tillbaka kunden
          själv.
        }
      </p>
      <mat-form-field class="w-full">
        <mat-label>Varför?</mat-label>
        <input matInput [formControl]="reason" maxlength="200" cdkFocusInitial />
        <mat-error>Ange orsaken.</mat-error>
      </mat-form-field>
      @if (data.hasParts) {
        <mat-slide-toggle [formControl]="restock"> Lägg tillbaka delarna i lagret </mat-slide-toggle>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Avbryt</button>
      <button
        mat-flat-button
        color="warn"
        type="button"
        [disabled]="reason.invalid"
        (click)="ref.close({ reason: reason.value.trim(), restock: restock.value })"
      >
        Kreditera
      </button>
    </mat-dialog-actions>
  `,
})
export class CreditDialog {
  readonly data = inject<{ code: string; total: number; paid: boolean; hasParts: boolean }>(
    MAT_DIALOG_DATA,
  );
  readonly ref = inject(MatDialogRef<CreditDialog, CreditResult>);
  readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)],
  });
  readonly restock = new FormControl(true, { nonNullable: true });
}
