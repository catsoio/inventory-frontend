import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SEASON_LABELS } from '../../core/models';
import { AppSettings, Settings } from '../../core/settings';

@Component({
  selector: 'app-settings',
  standalone: false,
  template: `
    <h1 class="mb-4 text-2xl font-semibold">Inställningar</h1>
    <form [formGroup]="form" (ngSubmit)="save()" class="flex max-w-4xl flex-col gap-4">
      <section class="rounded-lg border bg-white">
        <h2 class="border-b px-4 py-3 font-semibold">Visning</h2>
        <div class="grid gap-x-6 p-4 sm:grid-cols-3">
          <mat-form-field>
            <mat-label>Standardvy för artiklar</mat-label>
            <mat-select formControlName="defaultView">
              <mat-option value="auto">Automatisk (tabell på dator)</mat-option>
              <mat-option value="table">Tabell</mat-option>
              <mat-option value="cards">Kort</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Rader per hämtning</mat-label>
            <mat-select formControlName="pageSize">
              <mat-option [value]="50">50</mat-option>
              <mat-option [value]="100">100</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Period på översikten</mat-label>
            <mat-select formControlName="dashboardDays">
              <mat-option [value]="7">7 dagar</mat-option>
              <mat-option [value]="30">30 dagar</mat-option>
              <mat-option [value]="90">90 dagar</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </section>

      <section class="rounded-lg border bg-white">
        <h2 class="border-b px-4 py-3 font-semibold">Standardvärden för nya artiklar</h2>
        <div class="grid gap-x-6 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <mat-form-field>
            <mat-label>Säsong</mat-label>
            <mat-select formControlName="defaultSeason">
              @for (s of seasons; track s[0]) {
                <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Leverantör</mat-label>
            <input matInput formControlName="defaultSupplier" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>Beställningspunkt (st)</mat-label>
            <input matInput type="number" min="0" step="1" formControlName="defaultReorderLevel" />
            <mat-error>Heltal, 0 eller mer</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Påslag på inköpspris (%)</mat-label>
            <input matInput type="number" min="0" step="1" formControlName="markupPercent" />
            <mat-hint>Föreslår försäljningspris vid ingångslager</mat-hint>
          </mat-form-field>
        </div>
      </section>

      <div class="flex gap-2">
        <button mat-flat-button color="primary" [disabled]="form.invalid">Spara</button>
        <button mat-button type="button" (click)="reset()">Återställ standard</button>
      </div>
    </form>
  `,
})
export class SettingsPage {
  private readonly settings = inject(Settings);
  private readonly snack = inject(MatSnackBar);
  readonly seasons = Object.entries(SEASON_LABELS);

  readonly form = inject(FormBuilder).nonNullable.group({
    defaultView: this.settings.value().defaultView,
    pageSize: this.settings.value().pageSize,
    dashboardDays: this.settings.value().dashboardDays,
    defaultSeason: this.settings.value().defaultSeason,
    defaultSupplier: this.settings.value().defaultSupplier,
    defaultReorderLevel: [
      this.settings.value().defaultReorderLevel,
      [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)],
    ],
    markupPercent: [this.settings.value().markupPercent, [Validators.required, Validators.min(0)]],
  });

  save() {
    this.settings.save(this.form.getRawValue() as AppSettings);
    this.snack.open('Inställningarna sparades', undefined, { duration: 2500 });
  }

  reset() {
    this.settings.reset();
    this.form.reset(this.settings.value());
  }
}
