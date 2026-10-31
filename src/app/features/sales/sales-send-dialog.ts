import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { InvoiceKind, SalesCardDetail } from '../../core/models';

export interface SalesSendData {
  id: string;
  code: string;
  kind: InvoiceKind;
  customerName: string;
  /** Kundens e-post; saknas den frågar dialogen och servern sparar adressen på kunden. */
  email: string | null;
  resend: boolean;
  lastTo: string | null;
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/**
 * Mejla kvittot eller fakturan. Kunden får en länk till exakt det dokument som "Visa / skriv ut"
 * visar, och kan öppna, spara och skriva ut det utan inloggning.
 */
@Component({
  selector: 'app-sales-send-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>
      {{ data.resend ? 'Skicka igen' : 'Skicka' }} {{ noun }} · {{ data.code }}
    </h2>
    <mat-dialog-content class="!flex flex-col gap-4 !pt-2">
      <p class="text-sm text-gray-600">
        {{ data.customerName }} får ett mejl med en länk till {{ the }}, precis som det ser ut
        när du skriver ut det.
        @if (!data.resend) {
          Efter att det skickats går det inte att återöppna kortet.
        }
      </p>
      @if (data.resend && data.lastTo) {
        <p class="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
          Skickades senast till {{ data.lastTo }}.
        </p>
      }
      <mat-form-field class="block w-full" subscriptSizing="dynamic">
        <mat-label>E-postadress</mat-label>
        <input
          matInput
          type="email"
          inputmode="email"
          autocomplete="off"
          [value]="email()"
          (input)="email.set($any($event.target).value)"
          placeholder="namn@exempel.se"
        />
        @if (email() && !emailOk()) {
          <mat-hint class="!text-red-700">Kontrollera e-postadressen.</mat-hint>
        } @else if (!data.email) {
          <mat-hint>Kunden har ingen e-post. Adressen sparas på kunden.</mat-hint>
        }
      </mat-form-field>
      <mat-form-field class="block w-full" subscriptSizing="dynamic">
        <mat-label>Några ord överst i mejlet (valfritt)</mat-label>
        <textarea
          matInput
          rows="2"
          [value]="note()"
          (input)="note.set($any($event.target).value)"
        ></textarea>
        <mat-hint>Svar på mejlet går till verkstadens adress i Fakturauppgifter.</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Avbryt</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!emailOk() || busy()"
        (click)="submit()"
      >
        <mat-icon>send</mat-icon> Skicka
      </button>
    </mat-dialog-actions>
  `,
})
export class SalesSendDialog {
  readonly data = inject<SalesSendData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<SalesSendDialog, SalesCardDetail | null>);
  private readonly api = inject(SalesCardApi);

  readonly noun = this.data.kind === 'invoice' ? 'faktura' : 'kvitto';
  readonly the = this.data.kind === 'invoice' ? 'fakturan' : 'kvittot';
  readonly busy = signal(false);
  readonly email = signal(this.data.email ?? '');
  readonly note = signal('');
  readonly emailOk = computed(() => isEmail(this.email()));

  submit() {
    this.busy.set(true);
    this.api
      .send(this.data.id, {
        email: this.email().trim(),
        note: this.note().trim() || undefined,
      })
      .subscribe({
        next: (card) => this.ref.close(card),
        error: () => this.busy.set(false),
      });
  }
}
