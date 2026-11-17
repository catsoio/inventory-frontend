import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { catchError, of } from 'rxjs';
import { WorkshopApi } from '../api/workshop-api';
import { Billing } from '../billing/billing';
import { SharedModule } from '../../shared/shared-module';
import type { ServiceType } from '../models';

export type NewCarChoice = 'order' | 'storage' | 'quote';

/** Vad en skannad, okänd bil ska bli. `job` är en åtgärd när det blir en arbetsorder. */
export interface NewCarResult {
  choice: NewCarChoice;
  job?: string;
}

/**
 * En skannad skylt som ingen känner till: en ny bil har kommit in. Vad ska hända med den? Valen är
 * stora rektangelknappar, så de går att träffa med en tumme: Arbetsorder, Däckbyte (en order med
 * åtgärden förvald), Däckhotell och Offert, och en rullista med alla åtgärder för resten. Bilen och
 * kunden skapas först när formuläret man väljer sparas.
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
        @for (c of choices; track c.label) {
          @if (billing.allows(c.module)) {
            <button
              type="button"
              class="flex h-16 items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 text-left text-base font-medium"
              (click)="ref.close({ choice: c.id, job: c.job?.() })"
            >
              <mat-icon>{{ c.icon }}</mat-icon>
              {{ c.label }}
            </button>
          }
        }
      </div>
      @if (billing.allows('arbetsorder') && others().length) {
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Annan åtgärd</mat-label>
          <mat-select (selectionChange)="ref.close({ choice: 'order', job: $event.value })">
            @for (s of others(); track s.id) {
              <mat-option [value]="s.name">{{ s.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Avbryt</button>
    </mat-dialog-actions>
  `,
})
export class NewCarDialog implements OnInit {
  readonly ref = inject<MatDialogRef<NewCarDialog, NewCarResult>>(MatDialogRef);
  readonly data = inject<{ regNo: string }>(MAT_DIALOG_DATA);
  readonly billing = inject(Billing);
  private readonly workshop = inject(WorkshopApi);

  private readonly services = signal<ServiceType[]>([]);

  /** Garagets egen åtgärd för däckbyte om det finns en (hjulbyte räknas också), annars texten Däckbyte. */
  private readonly tyreJob = computed(
    () =>
      this.services().find((s) => /d[äa]ckbyte|hjulbyte|d[äa]ck.*byte/i.test(s.name))?.name ??
      'Däckbyte',
  );

  /** Åtgärderna i rullistan: allt utom det som redan har en egen knapp. */
  readonly others = computed(() =>
    this.services().filter((s) => s.active !== false && s.name !== this.tyreJob()),
  );

  readonly choices: {
    id: NewCarChoice;
    label: string;
    icon: string;
    module: string;
    job?: () => string;
  }[] = [
    { id: 'order', label: 'Arbetsorder', icon: 'build', module: 'arbetsorder' },
    {
      id: 'order',
      label: 'Däckbyte',
      icon: 'tire_repair',
      module: 'arbetsorder',
      job: () => this.tyreJob(),
    },
    { id: 'storage', label: 'Däckhotell', icon: 'warehouse', module: 'dackhotell' },
    { id: 'quote', label: 'Offert', icon: 'request_quote', module: 'arbetsorder' },
  ];

  ngOnInit() {
    this.workshop
      .serviceTypes()
      .pipe(catchError(() => of([] as ServiceType[])))
      .subscribe((l) => this.services.set(l));
  }
}
