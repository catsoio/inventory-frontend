import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Billing } from '../billing/billing';
import { SharedModule } from '../../shared/shared-module';

export type NewCarChoice = 'order' | 'storage' | 'quote';

/**
 * En skannad skylt som ingen känner till: en ny bil har kommit in. Vad ska hända med den? Valen är
 * stora rektangelknappar, så de går att träffa med en tumme. Bilen och kunden skapas först när
 * formuläret man väljer sparas.
 */
@Component({
  selector: 'app-new-car-dialog',
  standalone: true,
  imports: [SharedModule],
  template: `
    <h2 mat-dialog-title>Ny bil</h2>
    <mat-dialog-content class="flex flex-col gap-3">
      <p class="text-sm text-gray-600">
        <strong>{{ data.regNo }}</strong> finns inte hos er än. Vad vill du göra?
      </p>
      <div class="grid grid-cols-1 gap-2">
        @for (c of choices; track c.id) {
          @if (billing.allows(c.module)) {
            <button
              type="button"
              class="flex h-16 items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 text-left text-base font-medium"
              (click)="ref.close(c.id)"
            >
              <mat-icon>{{ c.icon }}</mat-icon>
              {{ c.label }}
            </button>
          }
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Avbryt</button>
    </mat-dialog-actions>
  `,
})
export class NewCarDialog {
  readonly ref = inject<MatDialogRef<NewCarDialog, NewCarChoice>>(MatDialogRef);
  readonly data = inject<{ regNo: string }>(MAT_DIALOG_DATA);
  readonly billing = inject(Billing);

  readonly choices: { id: NewCarChoice; label: string; icon: string; module: string }[] = [
    { id: 'order', label: 'Arbetsorder', icon: 'build', module: 'arbetsorder' },
    { id: 'storage', label: 'Däckhotell', icon: 'warehouse', module: 'dackhotell' },
    { id: 'quote', label: 'Offert', icon: 'request_quote', module: 'arbetsorder' },
  ];
}
