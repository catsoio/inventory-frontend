import { Component, inject } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

/** Frågar varför ett registrerat kvitto tas tillbaka. Svaret blir orsaken på returkvittot. */
@Component({
  selector: 'app-return-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Ta tillbaka {{ data.code }}?</h2>
    <mat-dialog-content class="!pt-2">
      <p class="mb-3 text-sm text-gray-600">
        Hela affären på {{ data.total | kr }} tas tillbaka med ett returkvitto i kassaregistret.
        Delarna läggs tillbaka i lagret och en kortbetalning via Stripe återbetalas. Det går inte
        att ångra, och kvittot ändras aldrig.
      </p>
      <mat-form-field class="w-full">
        <mat-label>Varför?</mat-label>
        <input matInput [formControl]="reason" maxlength="200" cdkFocusInitial />
        <mat-error>Ange orsaken.</mat-error>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Avbryt</button>
      <button
        mat-flat-button
        color="warn"
        type="button"
        [disabled]="reason.invalid"
        (click)="ref.close(reason.value.trim())"
      >
        Ta tillbaka
      </button>
    </mat-dialog-actions>
  `,
})
export class ReturnDialog {
  readonly data = inject<{ code: string; total: number }>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ReturnDialog>);
  readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)],
  });
}
