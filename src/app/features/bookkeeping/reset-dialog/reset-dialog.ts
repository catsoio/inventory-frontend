import { Component, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { ClosingApi } from '../../../core/api/closing-api';
import { Closing, ResetPreview } from '../../../core/models';
import { BLOCKED_TEXT, periodLabel, warningText } from '../bookkeeping-format';

@Component({
  selector: 'app-reset-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title class="!text-red-700">Nollställ garagets data</h2>
    <mat-dialog-content class="flex flex-col gap-3 !pt-2">
      @if (!preview()) {
        <mat-progress-bar mode="indeterminate" />
      } @else {
        @let p = preview()!;
        <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <div class="mb-1 flex items-center gap-2 font-semibold">
            <mat-icon>warning</mat-icon> Det här tar bort {{ p.garage.name }}s arbetsdata
          </div>
          <ul class="ml-6 list-disc">
            <li>{{ p.data.articles }} artiklar</li>
            <li>{{ p.data.movements }} lagerhändelser</li>
            <li>
              {{ removedSets() }} däckhotell-inlämningar
              @if (keepStored.value && p.data.storedDeposits > 0) {
                ({{ p.data.storedDeposits }} inlagrade set behålls)
              }
            </li>
          </ul>
          <p class="mt-2">
            Användarna och garagets inställningar påverkas inte. Det går inte att ångra
            nollställningen, men allt som tas bort bokförs först och sparas i arkivet.
          </p>
        </div>

        <mat-slide-toggle [formControl]="keepStored">
          Behåll däckhotell-set som fysiskt ligger inlagrade ({{ p.data.storedDeposits }} set,
          {{ p.data.storedUnits }} st)
        </mat-slide-toggle>
        @if (!keepStored.value && p.data.storedDeposits > 0) {
          <div class="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <mat-icon>warning</mat-icon>
            <span>
              {{ p.data.storedDeposits }} kunders däck/fälgar ligger kvar på hyllan men försvinner
              ur systemet. De sparas bara i arkivet, och inlämningsnumren börjar om.
            </span>
          </div>
        }
        @if (p.data.unpaidDeposits > 0) {
          <div class="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <mat-icon>warning</mat-icon>
            <span>
              {{ p.data.unpaidDeposits }} inlämningar är obetalda. Om de tas bort kan avgifterna
              inte längre faktureras härifrån.
            </span>
          </div>
        }

        <div class="text-sm text-gray-700">
          Först bokförs perioden
          <strong>{{ period(p) }}</strong> automatiskt, så att siffrorna och alla rader sparas:
        </div>
        @if (p.closing.blocked && p.closing.blocked !== 'NOTHING_TO_CLOSE') {
          <div class="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <mat-icon>block</mat-icon><span>{{ blocked[p.closing.blocked] }}</span>
          </div>
        } @else if (p.closing.blocked === 'NOTHING_TO_CLOSE') {
          <div class="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            Garaget är redan tomt, det finns inget att nollställa.
          </div>
        }
        @for (w of p.closing.warnings; track w.code) {
          @if (w.severity === 'warning' && w.code !== 'EMPTY_PERIOD') {
            <div class="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <mat-icon>warning</mat-icon><span>{{ text(w) }}</span>
            </div>
          }
        }
        @if (p.closing.summary && !p.closing.blocked) {
          <app-closing-summary [summary]="p.closing.summary" />
        }

        <mat-form-field>
          <mat-label>Anteckning (valfri)</mat-label>
          <textarea matInput rows="2" maxlength="500" [formControl]="note"></textarea>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Skriv garagets namn för att bekräfta</mat-label>
          <input
            matInput
            [formControl]="confirm"
            autocomplete="off"
            [placeholder]="p.garage.name"
          />
          <mat-hint>{{ p.garage.name }}</mat-hint>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Avbryt</button>
      <button mat-flat-button color="warn" [disabled]="!canReset() || busy()" (click)="reset()">
        Bokför och nollställ
      </button>
    </mat-dialog-actions>
  `,
})
export class ResetDialog {
  private readonly api = inject(ClosingApi);
  private readonly ref = inject<MatDialogRef<ResetDialog, Closing>>(MatDialogRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly blocked = BLOCKED_TEXT;
  readonly preview = signal<ResetPreview | null>(null);
  readonly busy = signal(false);
  readonly keepStored = this.fb.control(true);
  readonly confirm = this.fb.control('');
  readonly note = this.fb.control('');
  text = warningText;
  period = (p: ResetPreview) => periodLabel(p.closing.from, p.closing.to);

  constructor() {
    this.api.resetPreview().subscribe({
      next: (p) => this.preview.set(p),
      error: () => this.ref.close(),
    });
  }

  removedSets(): number {
    const p = this.preview()!;
    return this.keepStored.value ? p.data.deposits - p.data.storedDeposits : p.data.deposits;
  }

  canReset(): boolean {
    const p = this.preview();
    return (
      !!p &&
      !p.closing.blocked &&
      this.confirm.value.trim().toLocaleLowerCase('sv') ===
        p.garage.name.trim().toLocaleLowerCase('sv')
    );
  }

  reset() {
    this.busy.set(true);
    this.api
      .reset({
        confirmName: this.confirm.value,
        keepStoredDeposits: this.keepStored.value,
        note: this.note.value.trim() || undefined,
      })
      .subscribe({
        next: (c) => this.ref.close(c),
        error: () => this.busy.set(false),
      });
  }
}
