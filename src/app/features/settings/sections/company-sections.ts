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
      title="Företagsuppgifter"
      text="Skrivs ut på faktura (företagskunder) och kvitto (privatkunder). En faktura måste ha säljarens momsregistreringsnummer, namn och adress, så uppgifterna krävs innan du kan fakturera. De kopieras in på varje faktura när den utfärdas och ändras inte i efterhand."
      [dirty]="s.sellerForm.dirty"
      [valid]="s.sellerForm.valid"
      [busy]="s.sellerBusy()"
      (save)="s.saveSeller()"
      (discard)="s.discard(s.sellerForm)"
    >
      <form
        [formGroup]="s.sellerForm"
        (ngSubmit)="s.saveSeller()"
        class="grid gap-x-4 gap-y-3 sm:grid-cols-6"
      >
        <h3 class="sec sm:col-span-6">Företaget</h3>
        <mat-form-field class="sm:col-span-3" subscriptSizing="dynamic">
          <mat-label>Företagsnamn</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-3" subscriptSizing="dynamic">
          <mat-label>Organisationsnummer</mat-label>
          <input matInput formControlName="orgNo" placeholder="556123-4567" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-3" subscriptSizing="dynamic">
          <mat-label>Momsregistreringsnummer</mat-label>
          <input matInput formControlName="vatNumber" placeholder="SE556123456701" />
          <mat-hint>SE + organisationsnumret utan bindestreck + 01</mat-hint>
        </mat-form-field>
        <div class="flex items-center sm:col-span-3">
          <mat-checkbox formControlName="fTax">Godkänd för F-skatt</mat-checkbox>
        </div>

        <h3 class="sec mt-3 sm:col-span-6">Adress och kontakt</h3>
        <mat-form-field class="sm:col-span-3" subscriptSizing="dynamic">
          <mat-label>Adress</mat-label>
          <input matInput formControlName="address" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-1" subscriptSizing="dynamic">
          <mat-label>Postnr</mat-label>
          <input matInput formControlName="postalCode" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-2" subscriptSizing="dynamic">
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

        <h3 class="sec mt-3 sm:col-span-6">Betalning</h3>
        <mat-form-field class="sm:col-span-2" subscriptSizing="dynamic">
          <mat-label>Bankgiro</mat-label>
          <input matInput formControlName="bankgiro" placeholder="123-4567" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-2" subscriptSizing="dynamic">
          <mat-label>Bankkonto</mat-label>
          <input matInput formControlName="bankAccount" placeholder="Bank, clearing, kontonr" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-2" subscriptSizing="dynamic">
          <mat-label>Betala med Swish (nummer)</mat-label>
          <input matInput formControlName="swish" placeholder="123 456 78 90" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-4" subscriptSizing="dynamic">
          <mat-label>Övrig betalningsinfo (valfritt)</mat-label>
          <input matInput formControlName="paymentDetails" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-2" subscriptSizing="dynamic">
          <mat-label>Betalningsvillkor (dagar)</mat-label>
          <input matInput type="number" min="0" max="365" formControlName="paymentTermsDays" />
          <mat-hint>Gäller företagsfaktura</mat-hint>
        </mat-form-field>
        <mat-form-field class="sm:col-span-6" subscriptSizing="dynamic">
          <mat-label>Text längst ned (valfritt)</mat-label>
          <input matInput formControlName="footer" />
        </mat-form-field>
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
    <app-settings-section
      [title]="'Personal i ' + (s.auth.garage()?.name ?? '')"
      text="Ägaren ser allt. Personal når allt utom ekonomi och inställningar; mekaniker ser bara sina arbetsorder."
    >
      <div class="flex flex-col divide-y divide-gray-100">
        @for (m of s.members(); track m.userId) {
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium">{{ s.label(m) }}</span>
                <app-pill
                  [tone]="m.role === 'owner' ? 'blue' : m.role === 'mechanic' ? 'amber' : 'gray'"
                  >{{ s.roleLabels[m.role] }}</app-pill
                >
                @if (m.status === 'blocked') {
                  <app-pill tone="red">Spärrad</app-pill>
                }
              </div>
              <div class="truncate text-xs text-gray-500">{{ s.detail(m) }}</div>
            </div>
            @if (s.auth.isSuperAdmin()) {
              <button mat-button type="button" (click)="s.resetPassword(m)">
                <mat-icon>key</mat-icon> Byt lösenord
              </button>
              @if (m.userId !== s.auth.user()?.id) {
                <button
                  mat-button
                  type="button"
                  [color]="m.status === 'blocked' ? 'primary' : 'warn'"
                  (click)="s.toggleBlocked(m)"
                >
                  <mat-icon>{{ m.status === 'blocked' ? 'lock_open' : 'block' }}</mat-icon>
                  {{ m.status === 'blocked' ? 'Aktivera' : 'Spärra' }}
                </button>
              }
            }
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
              <button mat-button type="button" (click)="s.remove(m)">Ta bort</button>
            }
          </div>
        }
      </div>
      @if (s.billing.status(); as b) {
        <p class="mt-3 text-sm text-gray-600">
          {{ b.users.current }} av {{ b.users.limit }} användare används.
          @if (b.users.current >= b.users.limit) {
            Ni har nått taket för er plan. Kontakta oss om ni behöver fler användare ({{
              b.users.extraUserPriceMinor | kr
            }}
            per användare och månad exkl. moms).
          }
        </p>
      }
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button mat-stroked-button type="button" [disabled]="s.seatsFull()" (click)="s.invite()">
          <mat-icon>person_add</mat-icon> Skapa inbjudningskod
        </button>
        @if (s.inviteCode()) {
          <code class="rounded-lg bg-gray-100 px-2 py-1 select-all">{{ s.inviteCode() }}</code>
          <span class="text-xs text-gray-500">Gäller 7 dagar, kan användas en gång</span>
        }
      </div>
    </app-settings-section>
  `,
})
export class SettingsStaff {
  readonly s = inject(SettingsStore);
}

/** Bolag: växla mellan bolagen i organisationen; superadmin lägger till nya. */
@Component({
  selector: 'app-settings-companies',
  standalone: false,
  template: `
    <app-settings-section
      title="Bolag"
      text="Varje bolag har egna fakturauppgifter, lager och nummerserier."
    >
      <div class="flex flex-col divide-y divide-gray-100">
        @for (c of s.auth.isSuperAdmin() ? s.auth.garages() : s.auth.companies(); track c.id) {
          <div class="flex items-center gap-3 py-3">
            <span class="min-w-0 flex-1 truncate font-medium">{{ c.name }}</span>
            @if (c.id === s.auth.garage()?.id) {
              <span class="text-xs text-gray-500">Du är här</span>
            } @else {
              <button mat-stroked-button type="button" (click)="s.auth.switchGarage(c.id)">
                Växla
              </button>
            }
            @if (s.auth.isSuperAdmin()) {
              <button mat-stroked-button type="button" (click)="features(c)">Funktioner</button>
            }
          </div>
        }
      </div>
      @if (s.auth.isSuperAdmin()) {
        <h3 class="sec mt-6">Lägg till bolag i {{ s.auth.garage()?.name }}s organisation</h3>
        <div class="flex items-start gap-3">
          <mat-form-field class="flex-1" subscriptSizing="dynamic">
            <mat-label>Bolagets namn</mat-label>
            <input matInput [formControl]="s.companyName" />
          </mat-form-field>
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="s.companyName.invalid || s.companyBusy()"
            (click)="s.addCompany()"
          >
            Lägg till
          </button>
        </div>
      }
    </app-settings-section>
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
 * Onlinebokning (bara superadmin): vi sätter upp verkstadens bokningsadress och slår på sidan åt dem.
 * Verkstaden formar sidan själv under Onlinebokning i menyn (text, åtgärder, bilder), men kan inte ändra adressen.
 */
@Component({
  selector: 'app-settings-website',
  standalone: false,
  template: `
    <app-settings-section
      title="Onlinebokning"
      text="Adressen kunderna bokar på och om sidan är påslagen. Gäller bolaget du är i just nu; verkstaden ändrar inte adressen själv."
      [dirty]="form.dirty"
      [valid]="form.valid"
      [busy]="busy()"
      (save)="save()"
      (discard)="reset()"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="flex max-w-xl flex-col gap-4">
        <mat-slide-toggle formControlName="enabled">Påslagen</mat-slide-toggle>
        <label class="flex flex-col gap-0.5 text-xs text-gray-500"
          >Adress
          <span class="flex items-center gap-2">
            <span class="text-sm text-gray-500">{{ origin }}/boka/</span>
            <input
              formControlName="slug"
              maxlength="60"
              placeholder="dackmasterab"
              class="h-10 min-w-0 flex-1 px-2 text-sm text-gray-900 field"
            />
          </span>
        </label>
        @if (error(); as e) {
          <p class="text-sm text-red-700">{{ e }}</p>
        }
        @if (saved()?.path; as path) {
          <p class="text-sm text-gray-600">
            Länk:
            <a class="underline" [href]="path" target="_blank" rel="noopener"
              >{{ origin }}{{ path }}</a
            >
          </p>
        }
      </form>
    </app-settings-section>
  `,
})
export class SettingsWebsite implements OnInit {
  private readonly api = inject(OnlineBookingApi);
  private readonly snack = inject(MatSnackBar);
  readonly origin = globalThis.location?.origin ?? '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal<OnlineBookingSettings | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({ enabled: false, slug: '' });

  ngOnInit() {
    this.api.settings().subscribe((s) => this.load(s));
  }

  private load(s: OnlineBookingSettings) {
    this.saved.set(s);
    this.form.reset({ enabled: s.enabled, slug: s.slug ?? '' });
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
    this.api.saveSettings({ enabled: v.enabled, slug: v.slug.trim() || null }).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.load(s);
        this.snack.open('Sparat', undefined, { duration: 2000 });
      },
      error: (e: { status?: number; error?: { error?: { message?: string } } }) => {
        this.busy.set(false);
        this.error.set(
          e.status === 409
            ? 'Den adressen används redan. Välj en annan.'
            : (e.error?.error?.message ?? 'Det gick inte att spara.'),
        );
      },
    });
  }
}
