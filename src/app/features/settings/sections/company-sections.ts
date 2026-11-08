import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { OnlineBookingApi } from '../../../core/api/online-booking-api';
import { OnlineBookingSettings } from '../../../core/models';
import { MatDialog } from '@angular/material/dialog';
import { FeaturesDialog } from '../features-dialog/features-dialog';
import { SettingsStore } from '../settings-store';

/** Företagsuppgifter: det som skrivs ut på faktura och kvitto. */
@Component({
  selector: 'app-settings-company',
  standalone: false,
  template: `
    <app-settings-section
      [dirty]="s.sellerForm.dirty"
      [valid]="s.sellerForm.valid"
      [busy]="s.sellerBusy()"
      (save)="s.saveSeller()"
      (discard)="s.discard(s.sellerForm)"
    >
      <form [formGroup]="s.sellerForm" (ngSubmit)="s.saveSeller()">
        <app-setting-group title="Företaget" [form]="true">
          <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Företagsnamn</mat-label>
              <input matInput formControlName="name" />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Organisationsnummer</mat-label>
              <input matInput formControlName="orgNo" placeholder="556123-4567" />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Momsregistreringsnummer</mat-label>
              <input matInput formControlName="vatNumber" placeholder="SE556123456701" />
              <mat-hint>SE + organisationsnumret utan bindestreck + 01</mat-hint>
            </mat-form-field>
          </div>
          <div class="mt-3 flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
            <span class="text-[15px] font-medium">Godkänd för F-skatt</span>
            <mat-slide-toggle formControlName="fTax" aria-label="Godkänd för F-skatt" />
          </div>
        </app-setting-group>

        <app-setting-group title="Adress och kontakt" [form]="true">
          <div class="grid gap-x-4 gap-y-3 sm:grid-cols-6">
            <mat-form-field class="sm:col-span-6" subscriptSizing="dynamic">
              <mat-label>Adress</mat-label>
              <input matInput formControlName="address" />
            </mat-form-field>
            <mat-form-field class="sm:col-span-2" subscriptSizing="dynamic">
              <mat-label>Postnummer</mat-label>
              <input matInput formControlName="postalCode" />
            </mat-form-field>
            <mat-form-field class="sm:col-span-4" subscriptSizing="dynamic">
              <mat-label>Ort</mat-label>
              <input matInput formControlName="city" />
            </mat-form-field>
            <mat-form-field class="sm:col-span-3" subscriptSizing="dynamic">
              <mat-label>Telefon</mat-label>
              <input matInput formControlName="phone" />
            </mat-form-field>
            <mat-form-field class="sm:col-span-3" subscriptSizing="dynamic">
              <mat-label>E-post</mat-label>
              <input matInput formControlName="email" />
            </mat-form-field>
          </div>
        </app-setting-group>

        <app-setting-group title="Betalning på fakturan" [form]="true">
          <div class="grid gap-x-4 gap-y-3 sm:grid-cols-6">
            <mat-form-field class="sm:col-span-2" subscriptSizing="dynamic">
              <mat-label>Bankgiro</mat-label>
              <input matInput formControlName="bankgiro" placeholder="123-4567" />
            </mat-form-field>
            <mat-form-field class="sm:col-span-4" subscriptSizing="dynamic">
              <mat-label>Bankkonto</mat-label>
              <input matInput formControlName="bankAccount" placeholder="Bank, clearing, kontonr" />
            </mat-form-field>
            <mat-form-field class="sm:col-span-3" subscriptSizing="dynamic">
              <mat-label>Swish-nummer</mat-label>
              <input matInput formControlName="swish" placeholder="123 456 78 90" />
            </mat-form-field>
            <mat-form-field class="sm:col-span-3" subscriptSizing="dynamic">
              <mat-label>Betalningsvillkor (dagar)</mat-label>
              <input matInput type="number" min="0" max="365" formControlName="paymentTermsDays" />
              <mat-hint>Gäller företagsfaktura</mat-hint>
            </mat-form-field>
            <mat-form-field class="sm:col-span-6" subscriptSizing="dynamic">
              <mat-label>Övrig betalningsinfo (valfritt)</mat-label>
              <input matInput formControlName="paymentDetails" />
            </mat-form-field>
            <mat-form-field class="sm:col-span-6" subscriptSizing="dynamic">
              <mat-label>Text längst ned på dokumentet (valfritt)</mat-label>
              <input matInput formControlName="footer" />
            </mat-form-field>
          </div>
        </app-setting-group>
      </form>
    </app-settings-section>
  `,
})
export class SettingsCompany {
  readonly s = inject(SettingsStore);
}

/** Personal: vem som har tillgång och vilken roll de har. */
@Component({
  selector: 'app-settings-staff',
  standalone: false,
  template: `
    <app-setting-group title="Medlemmar">
      @for (m of s.members(); track m.userId) {
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate text-[15px] font-medium">{{ s.label(m) }}</span>
              @if (m.role === 'owner') {
                <app-pill tone="blue">{{ s.roleLabels[m.role] }}</app-pill>
              }
              @if (m.status === 'blocked') {
                <app-pill tone="red">Spärrad</app-pill>
              }
            </div>
            <div class="truncate text-sm text-gray-500">{{ s.detail(m) }}</div>
          </div>
          @if (m.role !== 'owner') {
            <mat-button-toggle-group
              hideSingleSelectionIndicator
              [value]="m.role"
              (change)="s.setRole(m, $event.value)"
              aria-label="Roll"
            >
              <mat-button-toggle value="staff">Personal</mat-button-toggle>
              <mat-button-toggle value="mechanic">Mekaniker</mat-button-toggle>
            </mat-button-toggle-group>
            <button mat-button type="button" color="warn" (click)="s.remove(m)">Ta bort</button>
          }
          @if (s.auth.isSuperAdmin()) {
            <button mat-button type="button" (click)="s.resetPassword(m)">Byt lösenord</button>
            @if (m.userId !== s.auth.user()?.id) {
              <button
                mat-button
                type="button"
                [color]="m.status === 'blocked' ? 'primary' : 'warn'"
                (click)="s.toggleBlocked(m)"
              >
                {{ m.status === 'blocked' ? 'Aktivera' : 'Spärra' }}
              </button>
            }
          }
        </div>
      }
    </app-setting-group>

    <app-setting-group title="Bjud in" [text]="seats()">
      <app-setting-row label="Inbjudningskod" hint="Gäller 7 dagar och kan användas en gång.">
        @if (s.inviteCode()) {
          <code class="rounded-lg bg-gray-100 px-2 py-1 select-all">{{ s.inviteCode() }}</code>
        }
        <button mat-stroked-button type="button" [disabled]="s.seatsFull()" (click)="s.invite()">
          {{ s.inviteCode() ? 'Skapa ny kod' : 'Skapa kod' }}
        </button>
      </app-setting-row>
    </app-setting-group>
  `,
})
export class SettingsStaff {
  readonly s = inject(SettingsStore);

  /** Hur många platser planen har och hur många som används. */
  seats(): string {
    const b = this.s.billing.status();
    if (!b) return '';
    const used = `${b.users.current} av ${b.users.limit} användare används.`;
    return b.users.current >= b.users.limit
      ? `${used} Ni har nått taket för er plan. Kontakta oss om ni behöver fler.`
      : used;
  }
}

/** Bolag: växla mellan bolagen i organisationen; superadmin lägger till nya. */
@Component({
  selector: 'app-settings-companies',
  standalone: false,
  template: `
    <app-setting-group title="Bolag i organisationen">
      @for (c of s.auth.isSuperAdmin() ? s.auth.garages() : s.auth.companies(); track c.id) {
        <app-setting-row [label]="c.name" [hint]="c.id === s.auth.garage()?.id ? 'Du är här' : ''">
          @if (s.auth.isSuperAdmin()) {
            <button mat-button type="button" (click)="features(c)">Funktioner</button>
          }
          @if (c.id !== s.auth.garage()?.id) {
            <button mat-stroked-button type="button" (click)="s.auth.switchGarage(c.id)">
              Växla till
            </button>
          }
        </app-setting-row>
      }
    </app-setting-group>
    @if (s.auth.isSuperAdmin()) {
      <app-setting-group
        [title]="'Lägg till bolag i ' + (s.auth.garage()?.name ?? '') + 's organisation'"
        [form]="true"
      >
        <div class="flex items-start gap-3">
          <mat-form-field class="flex-1" subscriptSizing="dynamic">
            <mat-label>Bolagets namn</mat-label>
            <input matInput [formControl]="s.companyName" />
          </mat-form-field>
          <button
            mat-flat-button
            color="primary"
            type="button"
            class="!mt-1"
            [disabled]="s.companyName.invalid || s.companyBusy()"
            (click)="s.addCompany()"
          >
            Lägg till
          </button>
        </div>
      </app-setting-group>
    }
  `,
})
export class SettingsCompanies {
  readonly s = inject(SettingsStore);
  private readonly dialog = inject(MatDialog);

  /** Catso styr vad bolaget får använda (plan och delar på/av). */
  features(c: { id: string; name: string }) {
    this.dialog.open(FeaturesDialog, {
      data: { id: c.id, name: c.name },
      width: '640px',
      maxWidth: '95vw',
    });
  }
}

/**
 * Onlinebokning (bara superadmin): vi slår på bokningssidan åt verkstaden. Den ligger på verkstadens
 * webbplats (`/boka` på dess domän). Verkstaden formar sidan själv under Onlinebokning i menyn
 * (text, åtgärder, bilder), men kan inte slå på eller av den.
 */
@Component({
  selector: 'app-settings-website',
  standalone: false,
  template: `
    <app-settings-section
      [dirty]="form.dirty"
      [valid]="form.valid"
      [busy]="busy()"
      (save)="save()"
      (discard)="reset()"
    >
      <form [formGroup]="form" (ngSubmit)="save()">
        <app-setting-group>
          <app-setting-row label="Bokningssidan är påslagen">
            <mat-slide-toggle formControlName="enabled" aria-label="Påslagen" />
          </app-setting-row>
        </app-setting-group>
        @if (error(); as e) {
          <p class="text-sm text-red-700">{{ e }}</p>
        }
      </form>
    </app-settings-section>
  `,
})
export class SettingsWebsite implements OnInit {
  private readonly api = inject(OnlineBookingApi);
  private readonly snack = inject(MatSnackBar);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal<OnlineBookingSettings | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({ enabled: false });

  ngOnInit() {
    this.api.settings().subscribe((s) => this.load(s));
  }

  private load(s: OnlineBookingSettings) {
    this.saved.set(s);
    this.form.reset({ enabled: s.enabled });
  }

  reset() {
    const s = this.saved();
    if (s) this.load(s);
    this.error.set(null);
  }

  save() {
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.api.saveSettings({ enabled: v.enabled }).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.load(s);
        this.snack.open('Sparat', undefined, { duration: 2000 });
      },
      error: (e: { error?: { error?: { message?: string } } }) => {
        this.busy.set(false);
        this.error.set(e.error?.error?.message ?? 'Det gick inte att spara.');
      },
    });
  }
}
