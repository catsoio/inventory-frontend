import { Component, inject } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { SettingsStore } from '../settings-store';

/** Visning: det som gäller just dig, på den här enheten. */
@Component({
  selector: 'app-settings-view',
  standalone: false,
  template: `
    <app-settings-section
      title="Visning"
      text="Gäller bara dig, på den här enheten."
      [dirty]="s.viewForm.dirty"
      [valid]="s.viewForm.valid"
      (save)="s.saveView()"
      (discard)="s.discard(s.viewForm)"
    >
      <div class="mb-6 flex flex-wrap items-center gap-3">
        <span class="text-sm font-medium">Språk</span>
        <mat-button-toggle-group
          [value]="i18n.lang()"
          (change)="i18n.set($event.value)"
          aria-label="Språk"
          hideSingleSelectionIndicator
        >
          <mat-button-toggle value="sv">Svenska</mat-button-toggle>
          <mat-button-toggle value="en">English</mat-button-toggle>
        </mat-button-toggle-group>
      </div>
      <form
        [formGroup]="s.viewForm"
        (ngSubmit)="s.saveView()"
        class="grid gap-x-4 gap-y-3 sm:grid-cols-2"
      >
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Standardvy för artiklar</mat-label>
          <mat-select formControlName="defaultView">
            <mat-option value="auto">Automatisk (tabell på dator)</mat-option>
            <mat-option value="table">Tabell</mat-option>
            <mat-option value="cards">Kort</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Rader per hämtning</mat-label>
          <mat-select formControlName="pageSize">
            <mat-option [value]="50">50</mat-option>
            <mat-option [value]="100">100</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Period på översikten</mat-label>
          <mat-select formControlName="dashboardDays">
            <mat-option [value]="7">7 dagar</mat-option>
            <mat-option [value]="30">30 dagar</mat-option>
            <mat-option [value]="90">90 dagar</mat-option>
          </mat-select>
        </mat-form-field>
      </form>
      <button mat-button type="button" class="mt-4" (click)="s.resetView()">
        <mat-icon>restart_alt</mat-icon> Återställ visningen till standard
      </button>
    </app-settings-section>
  `,
})
export class SettingsView {
  readonly s = inject(SettingsStore);
  readonly i18n = inject(I18n);
}

/** Lösenord: byts direkt och loggar ut de andra enheterna. */
@Component({
  selector: 'app-settings-password',
  standalone: false,
  template: `
    <app-settings-section
      title="Lösenord"
      text="Du loggas ut på dina andra enheter när du byter."
      [dirty]="s.pwForm.dirty"
      [valid]="s.pwForm.valid"
      [busy]="s.pwBusy()"
      saveText="Byt lösenord"
      (save)="s.changePassword()"
      (discard)="s.pwForm.reset()"
    >
      <form [formGroup]="s.pwForm" (ngSubmit)="s.changePassword()" class="grid max-w-md gap-y-3">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Nuvarande lösenord</mat-label>
          <input
            matInput
            type="password"
            autocomplete="current-password"
            formControlName="current"
          />
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Nytt lösenord</mat-label>
          <input matInput type="password" autocomplete="new-password" formControlName="next" />
          <mat-error>Minst 8 tecken</mat-error>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Upprepa nytt lösenord</mat-label>
          <input matInput type="password" autocomplete="new-password" formControlName="repeat" />
          @if (s.pwForm.errors?.['mismatch']) {
            <mat-error>Lösenorden stämmer inte överens</mat-error>
          }
        </mat-form-field>
      </form>
    </app-settings-section>
  `,
})
export class SettingsPassword {
  readonly s = inject(SettingsStore);
}
