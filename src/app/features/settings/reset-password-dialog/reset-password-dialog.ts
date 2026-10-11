import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InventoryApi } from '../../../core/api/inventory-api';
import { GarageMember } from '../../../core/models';

/** Utan förväxlingsbara tecken (0/O, 1/l/I). */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generate(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

@Component({
  selector: 'app-reset-password-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Nytt lösenord – {{ name }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-dialog-content class="flex flex-col gap-1 !pt-2">
        <p class="text-sm text-gray-600">
          Användaren loggas ut överallt och måste logga in med det nya lösenordet. Skicka det till
          personen på ett säkert sätt.
        </p>
        <mat-form-field>
          <mat-label>Nytt lösenord</mat-label>
          <input matInput formControlName="password" autocomplete="off" />
          <button
            mat-icon-button
            matSuffix
            type="button"
            title="Generera lösenord"
            (click)="form.controls.password.setValue(gen())"
          >
            <mat-icon>autorenew</mat-icon>
          </button>
          <button mat-icon-button matSuffix type="button" title="Kopiera" (click)="copy()">
            <mat-icon>content_copy</mat-icon>
          </button>
          <mat-hint>Minst 8 tecken</mat-hint>
          <mat-error>Minst 8 tecken</mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button mat-flat-button color="primary" [disabled]="form.invalid || busy()">
          Byt lösenord
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ResetPasswordDialog {
  private readonly api = inject(InventoryApi);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject<MatDialogRef<ResetPasswordDialog, boolean>>(MatDialogRef);

  readonly busy = signal(false);
  readonly gen = generate;
  readonly name: string;
  readonly form = inject(FormBuilder).nonNullable.group({
    password: [generate(), [Validators.required, Validators.minLength(8)]],
  });

  constructor(@Inject(MAT_DIALOG_DATA) public member: GarageMember) {
    this.name = member.name || member.email || member.phone || member.userId;
  }

  copy() {
    navigator.clipboard
      ?.writeText(this.form.controls.password.value)
      .then(() => this.snack.open('Kopierat', undefined, { duration: 1500 }));
  }

  submit() {
    this.busy.set(true);
    this.api.resetMemberPassword(this.member.userId, this.form.controls.password.value).subscribe({
      next: () => this.ref.close(true),
      error: () => this.busy.set(false),
    });
  }
}
