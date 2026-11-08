import { Component, inject } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { SettingsStore } from '../settings-store';

/** Visning: det som gäller just dig, på den här enheten. */
@Component({
  selector: 'app-settings-view',
  standalone: false,
  template: `
    <app-settings-section
      [dirty]="s.viewForm.dirty"
      [valid]="s.viewForm.valid"
      (save)="s.saveView()"
      (discard)="s.discard(s.viewForm)"
    >
      <app-setting-group>
        <app-setting-row label="Språk">
          <mat-button-toggle-group
            [value]="i18n.lang()"
            (change)="i18n.set($event.value)"
            aria-label="Språk"
            hideSingleSelectionIndicator
          >
            <mat-button-toggle value="sv">Svenska</mat-button-toggle>
            <mat-button-toggle value="en">English</mat-button-toggle>
          </mat-button-toggle-group>
        </app-setting-row>
      </app-setting-group>

      <form [formGroup]="s.viewForm" (ngSubmit)="s.saveView()">
        <app-setting-group>
          <app-setting-row label="Artiklar visas som">
            <mat-button-toggle-group
              formControlName="defaultView"
              aria-label="Artiklar visas som"
              hideSingleSelectionIndicator
            >
              <mat-button-toggle value="auto">Auto</mat-button-toggle>
              <mat-button-toggle value="table">Tabell</mat-button-toggle>
              <mat-button-toggle value="cards">Kort</mat-button-toggle>
            </mat-button-toggle-group>
          </app-setting-row>
          <app-setting-row label="Rader per hämtning">
            <mat-button-toggle-group
              formControlName="pageSize"
              aria-label="Rader per hämtning"
              hideSingleSelectionIndicator
            >
              <mat-button-toggle [value]="50">50</mat-button-toggle>
              <mat-button-toggle [value]="100">100</mat-button-toggle>
            </mat-button-toggle-group>
          </app-setting-row>
          <app-setting-row label="Period på översikten">
            <mat-button-toggle-group
              formControlName="dashboardDays"
              aria-label="Period på översikten"
              hideSingleSelectionIndicator
            >
              <mat-button-toggle [value]="7">7 dagar</mat-button-toggle>
              <mat-button-toggle [value]="30">30 dagar</mat-button-toggle>
              <mat-button-toggle [value]="90">90 dagar</mat-button-toggle>
            </mat-button-toggle-group>
          </app-setting-row>
        </app-setting-group>
      </form>
      <button mat-button type="button" (click)="s.resetView()">
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
      [dirty]="s.pwForm.dirty"
      [valid]="s.pwForm.valid"
      [busy]="s.pwBusy()"
      saveText="Byt lösenord"
      (save)="s.changePassword()"
      (discard)="s.pwForm.reset()"
    >
      <app-setting-group [form]="true">
        <form [formGroup]="s.pwForm" (ngSubmit)="s.changePassword()" class="grid max-w-sm gap-y-3">
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
      </app-setting-group>
    </app-settings-section>
  `,
})
export class SettingsPassword {
  readonly s = inject(SettingsStore);
}
