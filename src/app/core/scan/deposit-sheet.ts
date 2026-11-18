import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { StorageApi } from '../api/storage-api';
import { PAYMENT_METHOD_LABELS, type PaymentMethod, type StorageDeposit } from '../models';
import { SharedModule } from '../../shared/shared-module';
import { Scanner } from './scanner';
import { ScanTile } from './scan-tile';

export interface DepositSheetData {
  id: string;
}

export type DepositSheetResult = {
  kind: 'go';
  commands: string[];
  queryParams?: Record<string, string>;
};

/**
 * Blad för ett däckset man skannat etiketten på: vem det är och var det står, och rutorna för det
 * man gör vid disken, att lämna ut (med betalning om avgiften står obetald) och att flytta det till
 * en annan hylla med kameran. Resten finns på setets kort.
 */
@Component({
  selector: 'app-deposit-sheet',
  standalone: true,
  imports: [SharedModule, ScanTile],
  template: `
    <h2 mat-dialog-title>{{ d()?.code ?? 'Däckset' }}</h2>
    <mat-dialog-content class="flex flex-col gap-4">
      @if (d(); as s) {
        <div class="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <app-reg-plate [value]="s.vehicle.regNo" size="lg" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-[15px] font-medium">{{ s.customer.name }}</div>
            <div class="truncate text-sm text-gray-600">{{ s.location || 'Ingen plats' }}</div>
          </div>
          @if (s.customer.phone) {
            <a
              [href]="'tel:' + s.customer.phone"
              class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 active:bg-gray-100"
              aria-label="Ring kunden"
            >
              <mat-icon>call</mat-icon>
            </a>
          }
        </div>

        @if (s.status === 'stored') {
          @if (s.overdue) {
            <p class="rounded-lg bg-red-50 p-2.5 text-sm text-red-800">
              Skulle ha hämtats {{ s.expectedPickupAt | date: 'yyyy-MM-dd' }}.
            </p>
          }
          @if (unpaid()) {
            <p class="rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">
              Avgiften {{ s.fee | kr }} är inte betald.
            </p>
          }
          @if (confirming()) {
            @if (unpaid()) {
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Ta betalt nu (valfritt)</mat-label>
                <mat-select [formControl]="method">
                  <mat-option value="">Betalas inte nu</mat-option>
                  @for (m of methods; track m[0]) {
                    <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
            <button
              mat-flat-button
              color="primary"
              type="button"
              class="!h-14 w-full !text-base"
              [disabled]="busy()"
              (click)="pickUp(s)"
            >
              Lämna ut {{ s.code }}
            </button>
            <button mat-button type="button" (click)="confirming.set(false)">Tillbaka</button>
          } @else {
            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                app-scan-tile
                icon="output"
                label="Lämna ut"
                [primary]="true"
                (click)="confirming.set(true)"
              ></button>
              <button
                type="button"
                app-scan-tile
                icon="warehouse"
                label="Flytta hylla"
                sub="Skanna den nya"
                [disabled]="busy()"
                (click)="move(s)"
              ></button>
              <button
                type="button"
                app-scan-tile
                icon="open_in_new"
                label="Öppna kortet"
                (click)="ref.close({ kind: 'go', commands: ['/storage', s.id] })"
              ></button>
            </div>
          }
        } @else {
          <p class="text-sm text-gray-600">Utlämnad {{ s.pickedUpAt | date: 'yyyy-MM-dd' }}.</p>
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              app-scan-tile
              icon="open_in_new"
              label="Öppna kortet"
              (click)="ref.close({ kind: 'go', commands: ['/storage', s.id] })"
            ></button>
          </div>
        }
      } @else if (error()) {
        <p class="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">{{ error() }}</p>
      } @else {
        <p class="text-sm text-gray-600">Hämtar…</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Stäng</button>
    </mat-dialog-actions>
  `,
})
export class DepositSheet implements OnInit {
  readonly ref = inject<MatDialogRef<DepositSheet, DepositSheetResult>>(MatDialogRef);
  private readonly data = inject<DepositSheetData>(MAT_DIALOG_DATA);
  private readonly api = inject(StorageApi);
  private readonly scanner = inject(Scanner);
  private readonly snack = inject(MatSnackBar);

  readonly d = signal<StorageDeposit | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  /** Man har tryckt Lämna ut: bekräfta (och välj betalning om avgiften är obetald). */
  readonly confirming = signal(false);
  readonly methods = Object.entries(PAYMENT_METHOD_LABELS);
  readonly method = new FormControl('', { nonNullable: true });

  ngOnInit() {
    this.api.deposit(this.data.id).subscribe({
      next: (d) => this.d.set(d),
      error: () => this.error.set('Det gick inte att hämta setet just nu. Försök igen.'),
    });
  }

  unpaid() {
    return this.d()?.paymentStatus === 'unpaid';
  }

  pickUp(s: StorageDeposit) {
    this.busy.set(true);
    const method = this.method.value as PaymentMethod | '';
    this.api
      .pickUp(s.id, {
        pickedUpAt: new Date().toISOString(),
        paymentMethod: this.unpaid() && method ? method : undefined,
      })
      .subscribe({
        next: (d) => {
          this.busy.set(false);
          this.snack.open(`${d.code} utlämnad`, undefined, { duration: 3000 });
          this.d.set(d);
          this.confirming.set(false);
        },
        error: () => this.busy.set(false),
      });
  }

  /** Kameran läser den nya hyllan och setet flyttas dit. */
  async move(s: StorageDeposit) {
    const shelf = await this.scanner.pickShelf();
    if (!shelf) return;
    if (shelf.warehouseKind !== 'customer') {
      this.scanner.beep(false);
      this.snack.open('Det där är inte en hylla i däckhotellet.', undefined, { duration: 3500 });
      return;
    }
    this.busy.set(true);
    this.api
      .update(s.id, { warehouseId: shelf.warehouseId, locationId: shelf.locationId })
      .subscribe({
        next: (d) => {
          this.busy.set(false);
          this.d.set(d);
          this.scanner.beep(true);
          this.snack.open(`Placerad på ${shelf.label}`, undefined, { duration: 3000 });
        },
        error: () => this.busy.set(false),
      });
  }
}
