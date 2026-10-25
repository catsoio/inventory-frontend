import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { AbstractControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InventoryApi } from '../../core/api/inventory-api';
import { Auth } from '../../core/auth/auth';
import { I18n } from '../../core/i18n/i18n';
import { Confirm } from '../../shared/confirm';
import { Billing } from '../../core/billing/billing';
import { CatalogApi } from '../../core/api/catalog-api';
import {
  ACCESSORY_LABELS,
  DEPOSIT_CONDITION_LABELS,
  GARAGE_ROLE_LABELS,
  GarageMember,
  MONTH_LABELS,
  SEASON_LABELS,
  STORAGE_CONTENTS_LABELS,
  StorageDefaults,
  Warehouse,
} from '../../core/models';
import { AppSettings, Settings } from '../../core/settings';
import { PRICING_PROFILES, Pricing, quoteTermsText } from '../../core/pricing';
import { PricingSettings } from '../../core/models';
import pkg from '../../../../package.json';
import { ResetPasswordDialog } from './reset-password-dialog/reset-password-dialog';

@Component({
  selector: 'app-settings',
  standalone: false,
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <div class="flex shrink-0 items-center justify-between pr-2">
      <h2 mat-dialog-title>Inställningar</h2>
      <button mat-icon-button mat-dialog-close aria-label="Stäng">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <!-- Flikar: lodrätt på dator, en rullbar rad på mobil. -->
    <nav
      class="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 px-4 md:hidden"
      aria-label="Inställningar"
    >
      @for (t of tabs(); track t.id) {
        <button
          type="button"
          class="tab whitespace-nowrap"
          [class.is-active]="tab() === t.id"
          (click)="tab.set(t.id)"
        >
          {{ t.label }}
        </button>
      }
    </nav>

    <mat-dialog-content class="!max-h-none min-h-0 flex-1 !overflow-hidden !p-0">
      <div class="flex h-full">
        <nav
          class="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-gray-100 p-3 md:flex"
          aria-label="Inställningar"
        >
          @for (t of tabs(); track t.id) {
            <button
              type="button"
              class="side-tab"
              [class.is-active]="tab() === t.id"
              (click)="tab.set(t.id)"
            >
              <mat-icon>{{ t.icon }}</mat-icon>
              <span>{{ t.label }}</span>
            </button>
          }
          <div class="mt-auto px-3 pt-4 text-xs text-gray-400 tabular-nums">
            Version {{ version }}
          </div>
        </nav>

        <div class="min-w-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
          <form id="prefs-form" [formGroup]="form" (ngSubmit)="save()">
            @if (tab() === 'view') {
              <h3 class="sec">Visning</h3>
              <div class="mb-5 flex flex-wrap items-center gap-3">
                <span class="text-sm">Språk</span>
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
              <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
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
              </div>
            }

            @if (tab() === 'stock') {
              <h3 class="sec">Nya artiklar</h3>
              <div class="mb-6 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Säsong</mat-label>
                  <mat-select formControlName="defaultSeason">
                    @for (s of seasons; track s[0]) {
                      <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Leverantör</mat-label>
                  <input matInput formControlName="defaultSupplier" />
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Beställningspunkt (st)</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    step="1"
                    formControlName="defaultReorderLevel"
                  />
                  <mat-error>Heltal, 0 eller mer</mat-error>
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Påslag på inköpspris (%)</mat-label>
                  <input matInput type="number" min="0" step="1" formControlName="markupPercent" />
                  <mat-hint>Föreslår försäljningspris vid ingångslager</mat-hint>
                </mat-form-field>
              </div>
              <h3 class="sec">Däckhotell</h3>
              <div class="grid gap-x-4 sm:grid-cols-2">
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Standardavgift per inlämning (kr, inkl. moms)</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    step="1"
                    formControlName="defaultStorageFee"
                  />
                  <mat-hint>Förifylls vid ny inlämning</mat-hint>
                  <mat-error>0 eller mer</mat-error>
                </mat-form-field>
              </div>
            }
          </form>

          @if (tab() === 'pricing' && auth.isAdmin()) {
            <h3 class="sec">Prissättning och dokument</h3>
            <p class="mb-3 max-w-2xl text-sm text-gray-600">
              Välj det som liknar ert arbetssätt, justera sedan enskilda val. Ändrar du något
              efteråt blir det "Anpassat".
            </p>
            <mat-button-toggle-group
              [formControl]="pricingForm.controls.profile"
              (change)="applyProfile($event.value)"
              hideSingleSelectionIndicator
              class="mb-6"
              aria-label="Arbetssätt"
            >
              <mat-button-toggle value="service">
                <mat-icon>tire_repair</mat-icon> Däck och service
              </mat-button-toggle>
              <mat-button-toggle value="workshop">
                <mat-icon>car_repair</mat-icon> Bilverkstad
              </mat-button-toggle>
            </mat-button-toggle-group>
            <form id="pricing-form" [formGroup]="pricingForm" (ngSubmit)="savePricing()">
              <h3 class="sec">Arbetsorder</h3>
              <mat-button-toggle-group
                formControlName="priceEntry"
                hideSingleSelectionIndicator
                aria-label="Så prissätts en order"
              >
                <mat-button-toggle value="order">Ett pris per order</mat-button-toggle>
                <mat-button-toggle value="lines">Jobb med priser</mat-button-toggle>
              </mat-button-toggle-group>
              <p class="mt-2 mb-4 max-w-xl text-sm text-gray-600">
                @if (pricingForm.controls.priceEntry.value === 'order') {
                  Ordern har ett pris. Raderna är en checklista för mekanikern, utan pris.
                } @else {
                  Varje jobb har eget pris, med delar under sig. Summan räknas på ordern.
                }
              </p>
              <div class="mb-4 flex flex-col gap-1">
                <mat-checkbox formControlName="showVin">Chassinummer på utskrifterna</mat-checkbox>
                <mat-checkbox formControlName="showMileage"
                  >Mätarställning på utskrifterna</mat-checkbox
                >
                <mat-checkbox formControlName="requireMileage">
                  Mätarställning krävs innan ordern blir klar
                </mat-checkbox>
              </div>

              <h3 class="sec">Avrundning</h3>
              <mat-checkbox formControlName="roundToKrona" class="mb-4 block">
                Öresutjämning: avrunda att betala till hela kronor
              </mat-checkbox>

              <h3 class="sec">Förbrukningsmaterial</h3>
              <div class="mb-4 grid gap-x-4 sm:grid-cols-3">
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Procent av arbetet</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    formControlName="consumablesPercent"
                  />
                  <mat-hint>Tomt = av</mat-hint>
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Högst (kr)</mat-label>
                  <input matInput type="number" min="0" formControlName="consumablesMax" />
                  <mat-hint>Tomt = inget tak</mat-hint>
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Text på raden</mat-label>
                  <input matInput formControlName="consumablesText" />
                </mat-form-field>
              </div>

              <h3 class="sec">Kostnadsförslag</h3>
              <div class="mb-2 grid gap-x-4 sm:grid-cols-3">
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Giltigt (dagar)</mat-label>
                  <input
                    matInput
                    type="number"
                    min="1"
                    max="365"
                    formControlName="quoteValidDays"
                  />
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Får avvika (%)</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    max="100"
                    formControlName="quoteTolerancePercent"
                  />
                  <mat-hint>Konsumenttjänstlagen: högst 15 % om inget annat avtalats</mat-hint>
                </mat-form-field>
              </div>
              <mat-form-field class="mb-4 w-full" subscriptSizing="dynamic">
                <mat-label>Villkor under förslaget</mat-label>
                <textarea
                  matInput
                  rows="2"
                  formControlName="quoteTerms"
                  [placeholder]="defaultTerms()"
                ></textarea>
                <mat-hint>Tomt = standardtexten</mat-hint>
              </mat-form-field>

              <h3 class="sec">Lager</h3>
              <div class="mb-1 text-sm text-gray-600">Delar tas ur lagret</div>
              <mat-button-toggle-group
                formControlName="stockOut"
                hideSingleSelectionIndicator
                class="mb-4"
                aria-label="När delar tas ur lagret"
              >
                <mat-button-toggle value="work_order_done">När ordern är klar</mat-button-toggle>
                <mat-button-toggle value="sales_card_posted"
                  >När säljkortet bokförs</mat-button-toggle
                >
              </mat-button-toggle-group>

              <h3 class="sec">Inköp</h3>
              <div class="mb-4 grid gap-x-4 sm:grid-cols-2">
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Moms på inköp</mat-label>
                  <mat-select formControlName="purchaseVatRate">
                    @for (r of [25, 12, 6, 0]; track r) {
                      <mat-option [value]="r">{{ r }} %</mat-option>
                    }
                  </mat-select>
                  <mat-hint
                    >Inköpspriser skrivs inkl. moms; lager och marginal räknas utan</mat-hint
                  >
                </mat-form-field>
              </div>

              <h3 class="sec">Efterkalkyl (bara internt)</h3>
              <div class="grid gap-x-4 sm:grid-cols-2">
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Intern kostnad per timme (kr)</mat-label>
                  <input matInput type="number" min="0" formControlName="internalHourlyCost" />
                  <mat-hint
                    >Används för att se vad jobbet tjänade. Syns aldrig för kunden.</mat-hint
                  >
                </mat-form-field>
              </div>
            </form>
          }

          @if (tab() === 'account') {
            <h3 class="sec">Mitt lösenord</h3>
            <form
              id="pw-form"
              [formGroup]="pwForm"
              (ngSubmit)="changePassword()"
              class="grid max-w-md gap-y-3"
            >
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
                <input
                  matInput
                  type="password"
                  autocomplete="new-password"
                  formControlName="next"
                />
                <mat-error>Minst 8 tecken</mat-error>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Upprepa nytt lösenord</mat-label>
                <input
                  matInput
                  type="password"
                  autocomplete="new-password"
                  formControlName="repeat"
                />
                @if (pwForm.errors?.['mismatch']) {
                  <mat-error>Lösenorden stämmer inte överens</mat-error>
                }
              </mat-form-field>
              <p class="text-xs text-gray-500">Du loggas ut på andra enheter.</p>
            </form>
          }

          @if (tab() === 'storage' && auth.isAdmin()) {
            <h3 class="sec">Förval för ny inlämning</h3>
            <p class="mb-4 max-w-2xl text-sm text-gray-600">
              Det här fylls i när ni tar emot ett set, så att den som står i kassan bara ändrar det
              som avviker. Standardavgift och säsong ställer ni in under Lager och däckhotell.
            </p>
            <form
              id="storage-form"
              [formGroup]="storageForm"
              (ngSubmit)="saveStorage()"
              class="grid max-w-3xl gap-x-4 gap-y-3 sm:grid-cols-2"
            >
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Brukar lämnas in</mat-label>
                <mat-select formControlName="contents">
                  @for (c of storageContents; track c[0]) {
                    <mat-option [value]="c[0]">{{ c[1] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Antal hjul i ett set</mat-label>
                <input matInput type="number" min="1" max="12" formControlName="quantity" />
                <mat-error>1–12</mat-error>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Skick vid inlämning</mat-label>
                <mat-select formControlName="condition">
                  @for (c of storageConditions; track c[0]) {
                    <mat-option [value]="c[0]">{{ c[1] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <div class="field flex h-11 items-center px-3">
                <mat-slide-toggle formControlName="studded"
                  >Vinterdäcken är dubbade</mat-slide-toggle
                >
              </div>
              <mat-form-field subscriptSizing="dynamic" class="sm:col-span-2">
                <mat-label>Följer oftast med</mat-label>
                <mat-select formControlName="accessories" multiple>
                  @for (a of storageAccessories; track a[0]) {
                    <mat-option [value]="a[0]">{{ a[1] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Lager</mat-label>
                <mat-select formControlName="warehouseId">
                  <mat-option [value]="null">Ingen vald</mat-option>
                  @for (w of storageWarehouses(); track w.id) {
                    <mat-option [value]="w.id">{{ w.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Plats</mat-label>
                <mat-select formControlName="locationId">
                  <mat-option [value]="null">Ingen vald</mat-option>
                  @for (l of storagePlaces(); track l.id) {
                    <mat-option [value]="l.id">{{ l.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Vinterhjul hämtas i</mat-label>
                <mat-select formControlName="winterPickupMonth">
                  @for (m of months; track $index) {
                    <mat-option [value]="$index + 1">{{ m }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Sommarhjul hämtas i</mat-label>
                <mat-select formControlName="summerPickupMonth">
                  @for (m of months; track $index) {
                    <mat-option [value]="$index + 1">{{ m }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Månader mellan avgifter</mat-label>
                <input
                  matInput
                  type="number"
                  min="1"
                  max="60"
                  formControlName="paymentCycleMonths"
                />
                <mat-error>1–60</mat-error>
              </mat-form-field>
            </form>
          }

          @if (tab() === 'invoice' && auth.isAdmin()) {
            <h3 class="sec">Fakturauppgifter</h3>
            <p class="mb-4 max-w-2xl text-sm text-gray-600">
              Skrivs ut på faktura (företagskunder) och kvitto (privatkunder). En faktura måste
              enligt mervärdesskattelagen ha säljarens momsregistreringsnummer, namn och adress, så
              uppgifterna krävs innan du kan fakturera. De kopieras in på varje faktura när den
              utfärdas och ändras inte i efterhand.
            </p>
            <form
              id="seller-form"
              [formGroup]="sellerForm"
              (ngSubmit)="saveSeller()"
              class="grid gap-x-4 gap-y-3 sm:grid-cols-6"
            >
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
              <mat-form-field class="sm:col-span-2" subscriptSizing="dynamic">
                <mat-label>Bankgiro</mat-label>
                <input matInput formControlName="bankgiro" placeholder="123-4567" />
              </mat-form-field>
              <mat-form-field class="sm:col-span-2" subscriptSizing="dynamic">
                <mat-label>Bankkonto</mat-label>
                <input
                  matInput
                  formControlName="bankAccount"
                  placeholder="Bank, clearing, kontonr"
                />
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
                <input
                  matInput
                  type="number"
                  min="0"
                  max="365"
                  formControlName="paymentTermsDays"
                />
                <mat-hint>Gäller företagsfaktura</mat-hint>
              </mat-form-field>
              <mat-form-field class="sm:col-span-6" subscriptSizing="dynamic">
                <mat-label>Text längst ned (valfritt)</mat-label>
                <input matInput formControlName="footer" />
              </mat-form-field>
            </form>
          }

          @if (tab() === 'companies' && showCompanies()) {
            <h3 class="sec">Bolag</h3>
            <div class="flex flex-col divide-y divide-gray-100">
              @for (c of auth.isSuperAdmin() ? auth.garages() : auth.companies(); track c.id) {
                <div class="flex items-center gap-3 py-3">
                  <span class="min-w-0 flex-1 truncate font-medium">{{ c.name }}</span>
                  @if (c.id === auth.garage()?.id) {
                    <span class="text-xs text-gray-500">Du är här</span>
                  } @else {
                    <button mat-stroked-button type="button" (click)="auth.switchGarage(c.id)">
                      Växla
                    </button>
                  }
                </div>
              }
            </div>
            @if (auth.isSuperAdmin()) {
              <h3 class="sec mt-6">Lägg till bolag i {{ auth.garage()?.name }}s organisation</h3>
              <div class="flex items-start gap-3">
                <mat-form-field class="flex-1" subscriptSizing="dynamic">
                  <mat-label>Bolagets namn</mat-label>
                  <input matInput [formControl]="companyName" />
                </mat-form-field>
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  [disabled]="companyName.invalid || companyBusy()"
                  (click)="addCompany()"
                >
                  Lägg till
                </button>
              </div>
            }
          }

          @if (tab() === 'staff' && auth.isAdmin()) {
            <h3 class="sec">Personal i {{ auth.garage()?.name }}</h3>
            <div class="flex flex-col divide-y divide-gray-100">
              @for (m of members(); track m.userId) {
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="truncate font-medium">{{ label(m) }}</span>
                      <app-pill
                        [tone]="
                          m.role === 'owner' ? 'blue' : m.role === 'mechanic' ? 'amber' : 'gray'
                        "
                        >{{ roleLabels[m.role] }}</app-pill
                      >
                      @if (m.status === 'blocked') {
                        <app-pill tone="red">Spärrad</app-pill>
                      }
                    </div>
                    <div class="truncate text-xs text-gray-500">{{ detail(m) }}</div>
                  </div>
                  @if (auth.isSuperAdmin()) {
                    <button mat-button type="button" (click)="resetPassword(m)">
                      <mat-icon>key</mat-icon> Byt lösenord
                    </button>
                    @if (m.userId !== auth.user()?.id) {
                      <button
                        mat-button
                        type="button"
                        [color]="m.status === 'blocked' ? 'primary' : 'warn'"
                        (click)="toggleBlocked(m)"
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
                      (change)="setRole(m, $event.value)"
                      aria-label="Roll"
                    >
                      <mat-button-toggle value="staff">Personal</mat-button-toggle>
                      <mat-button-toggle value="mechanic">Mekaniker</mat-button-toggle>
                    </mat-button-toggle-group>
                    <button mat-button type="button" (click)="remove(m)">Ta bort</button>
                  }
                </div>
              }
            </div>
            @if (billing.status(); as b) {
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
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <button mat-stroked-button type="button" [disabled]="seatsFull()" (click)="invite()">
                Skapa inbjudningskod
              </button>
              @if (inviteCode()) {
                <code class="rounded-lg bg-gray-100 px-2 py-1 select-all">{{ inviteCode() }}</code>
                <span class="text-xs text-gray-500">Gäller 7 dagar, kan användas en gång</span>
              }
            </div>
          }
          <div class="pt-6 text-xs text-gray-400 tabular-nums md:hidden">Version {{ version }}</div>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions>
      @if (tab() === 'view' || tab() === 'stock') {
        <button mat-button type="button" (click)="reset()">Återställ standard</button>
        <span class="flex-1"></span>
        <button mat-button type="button" mat-dialog-close>Stäng</button>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          form="prefs-form"
          [disabled]="form.invalid"
        >
          Spara
        </button>
      } @else if (tab() === 'account') {
        <span class="flex-1"></span>
        <button mat-button type="button" mat-dialog-close>Stäng</button>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          form="pw-form"
          [disabled]="pwForm.invalid || pwBusy()"
        >
          Byt lösenord
        </button>
      } @else if (tab() === 'pricing') {
        <span class="flex-1"></span>
        <button mat-button type="button" mat-dialog-close>Stäng</button>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          form="pricing-form"
          [disabled]="pricingForm.invalid || pricingBusy()"
        >
          Spara prissättning
        </button>
      } @else if (tab() === 'storage') {
        <span class="flex-1"></span>
        <button mat-button type="button" mat-dialog-close>Stäng</button>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          form="storage-form"
          [disabled]="storageForm.invalid || storageBusy()"
        >
          Spara förval
        </button>
      } @else if (tab() === 'invoice') {
        <span class="flex-1"></span>
        <button mat-button type="button" mat-dialog-close>Stäng</button>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          form="seller-form"
          [disabled]="sellerForm.invalid || sellerBusy()"
        >
          Spara fakturauppgifter
        </button>
      } @else {
        <span class="flex-1"></span>
        <button mat-flat-button color="primary" type="button" mat-dialog-close>Klar</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .side-tab {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 40px;
      padding: 0 12px;
      border-radius: 10px;
      font-size: 14.5px;
      font-weight: 500;
      color: #374151;
      text-align: left;
    }
    .side-tab mat-icon {
      color: #6b7280;
    }
    .side-tab:hover {
      background: #f3f4f6;
    }
    .side-tab.is-active {
      background: var(--color-brand-soft);
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
    .side-tab.is-active mat-icon {
      color: var(--mat-sys-primary);
    }
    .tab {
      padding: 12px 14px;
      font-size: 14px;
      font-weight: 500;
      color: #6b7280;
      border-bottom: 2px solid transparent;
    }
    .tab.is-active {
      color: var(--mat-sys-primary);
      border-color: var(--mat-sys-primary);
      font-weight: 600;
    }
  `,
})
export class SettingsPage {
  /** Fliken som visas; ägaren har fler. */
  /** Superadmin eller en ägare med fler än ett bolag. */
  readonly showCompanies = computed(
    () => this.auth.isSuperAdmin() || this.auth.companies().length > 1,
  );
  readonly companyName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)],
  });
  readonly companyBusy = signal(false);
  readonly tab = signal<
    'view' | 'stock' | 'account' | 'pricing' | 'storage' | 'invoice' | 'staff' | 'companies'
  >('view');
  readonly tabs = computed(() => {
    const t = [
      { id: 'view' as const, label: 'Visning', icon: 'tune' },
      { id: 'stock' as const, label: 'Lager och däckhotell', icon: 'inventory_2' },
      { id: 'account' as const, label: 'Konto', icon: 'lock' },
    ];
    if (!this.auth.isAdmin()) return t;
    const owner = [
      ...t,
      { id: 'pricing' as const, label: 'Prissättning', icon: 'sell' },
      { id: 'storage' as const, label: 'Däckhotell', icon: 'warehouse' },
      { id: 'invoice' as const, label: 'Fakturauppgifter', icon: 'receipt_long' },
      { id: 'staff' as const, label: 'Personal', icon: 'group' },
    ];
    return this.showCompanies()
      ? [...owner, { id: 'companies' as const, label: 'Bolag', icon: 'storefront' }]
      : owner;
  });

  protected readonly version = pkg.version;
  protected readonly i18n = inject(I18n);
  private readonly settings = inject(Settings);
  private readonly snack = inject(MatSnackBar);
  private readonly api = inject(InventoryApi);
  protected readonly auth = inject(Auth);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(Confirm);
  readonly members = signal<GarageMember[]>([]);
  readonly pwBusy = signal(false);
  readonly pwForm = inject(FormBuilder).nonNullable.group(
    {
      current: ['', Validators.required],
      next: ['', [Validators.required, Validators.minLength(8)]],
      repeat: ['', Validators.required],
    },
    {
      validators: (g: AbstractControl) =>
        g.get('next')?.value !== g.get('repeat')?.value ? { mismatch: true } : null,
    },
  );
  protected readonly billing = inject(Billing);
  readonly seatsFull = computed(() => {
    const u = this.billing.status()?.users;
    return !!u && u.current >= u.limit;
  });
  readonly inviteCode = signal<string | null>(null);
  readonly seasons = Object.entries(SEASON_LABELS);
  readonly sellerBusy = signal(false);
  readonly sellerForm = inject(FormBuilder).nonNullable.group({
    name: [''],
    orgNo: [''],
    vatNumber: ['', Validators.pattern(/^(SE\s?\d{12})?$/i)],
    fTax: [true],
    address: [''],
    postalCode: [''],
    city: [''],
    phone: [''],
    email: [''],
    bankgiro: [''],
    bankAccount: [''],
    swish: [''],
    paymentDetails: [''],
    paymentTermsDays: [30, [Validators.min(0), Validators.max(365)]],
    footer: [''],
  });

  private readonly pricing = inject(Pricing);
  readonly storageContents = Object.entries(STORAGE_CONTENTS_LABELS);
  readonly storageConditions = Object.entries(DEPOSIT_CONDITION_LABELS);
  readonly storageAccessories = Object.entries(ACCESSORY_LABELS);
  readonly months = MONTH_LABELS;
  private readonly catalog = inject(CatalogApi);
  readonly storageBusy = signal(false);
  readonly storageWarehouses = signal<Warehouse[]>([]);
  readonly storageWarehouseId = signal<string | null>(null);
  readonly storagePlaces = computed(
    () => this.storageWarehouses().find((w) => w.id === this.storageWarehouseId())?.locations ?? [],
  );
  readonly storageForm = inject(FormBuilder).group({
    contents: ['complete_wheels' as string],
    quantity: [4, [Validators.required, Validators.min(1), Validators.max(12)]],
    studded: [false],
    condition: ['good' as string],
    accessories: [[] as string[]],
    warehouseId: [null as string | null],
    locationId: [null as string | null],
    winterPickupMonth: [10],
    summerPickupMonth: [4],
    paymentCycleMonths: [12, [Validators.required, Validators.min(1), Validators.max(60)]],
  });
  readonly pricingBusy = signal(false);
  readonly pricingForm = inject(FormBuilder).group({
    profile: ['service' as PricingSettings['profile']],
    priceEntry: ['order' as PricingSettings['priceEntry']],
    privatePricesIncludeVat: [true],
    companyPricesIncludeVat: [true],
    roundToKrona: [false],
    consumablesPercent: [null as number | null, [Validators.min(0), Validators.max(100)]],
    consumablesMax: [null as number | null, Validators.min(0)],
    consumablesText: ['Förbrukningsmaterial'],
    quoteValidDays: [30, [Validators.required, Validators.min(1), Validators.max(365)]],
    quoteTolerancePercent: [15, [Validators.required, Validators.min(0), Validators.max(100)]],
    quoteTerms: [''],
    defaultJobLimit: [null as number | null, Validators.min(0)],
    showVin: [true],
    showMileage: [true],
    requireMileage: [false],
    internalHourlyCost: [null as number | null, Validators.min(0)],
    stockOut: ['work_order_done' as PricingSettings['stockOut']],
    purchaseVatRate: [25],
  });
  readonly defaultTerms = computed(() =>
    quoteTermsText({ ...this.pricing.value(), quoteTerms: null }),
  );

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
    defaultStorageFee: [
      this.settings.value().defaultStorageFee,
      [Validators.required, Validators.min(0)],
    ],
    defaultHourlyRate: [
      this.settings.value().defaultHourlyRate,
      [Validators.required, Validators.min(0)],
    ],
  });

  constructor() {
    this.pricingForm.valueChanges.subscribe(() => this.syncProfile());
    if (!this.auth.isAdmin()) {
      // Företagets standardvärden gäller alla; bara ägaren ändrar dem.
      for (const k of [
        'defaultSeason',
        'defaultSupplier',
        'defaultReorderLevel',
        'markupPercent',
        'defaultStorageFee',
        'defaultHourlyRate',
      ] as const) {
        this.form.controls[k].disable();
      }
    }
    if (this.auth.isAdmin()) {
      this.loadMembers();
      this.api.pricingSettings().subscribe((p) => this.fillPricing(p));
      this.catalog
        .warehouses()
        .subscribe((all) =>
          this.storageWarehouses.set(all.filter((w) => w.active && w.kind === 'customer')),
        );
      this.api.storageDefaults().subscribe((d) => {
        this.storageForm.reset(d as never);
        this.storageWarehouseId.set(d.warehouseId);
      });
      this.storageForm.controls.warehouseId.valueChanges.subscribe((w) => {
        this.storageWarehouseId.set(w);
        const places = this.storageWarehouses().find((x) => x.id === w)?.locations ?? [];
        if (!places.some((p) => p.id === this.storageForm.controls.locationId.value)) {
          this.storageForm.controls.locationId.setValue(null);
        }
      });
      this.api.seller().subscribe((s) =>
        this.sellerForm.patchValue({
          ...s,
          // Tomt namn fylls i med garagets namn så ägaren bara behöver komplettera.
          name: s.name || this.auth.garage()?.name || '',
          vatNumber: s.vatNumber ?? '',
          phone: s.phone ?? '',
          email: s.email ?? '',
          bankgiro: s.bankgiro ?? '',
          bankAccount: s.bankAccount ?? '',
          swish: s.swish ?? '',
          paymentDetails: s.paymentDetails ?? '',
          footer: s.footer ?? '',
        }),
      );
    }
  }

  /** Pengar i kronor i formuläret, öre i backend. */
  private fillPricing(p: PricingSettings) {
    const kr = (o: number | null) => (o == null ? null : o / 100);
    this.pricingForm.reset({
      ...p,
      consumablesMax: kr(p.consumablesMax),
      defaultJobLimit: kr(p.defaultJobLimit),
      internalHourlyCost: kr(p.internalHourlyCost),
      quoteTerms: p.quoteTerms ?? '',
    });
  }

  /** Fyller i profilens arbetssätt; inget sparas förrän man trycker Spara. */
  applyProfile(p: 'service' | 'workshop') {
    this.pricingForm.patchValue(PRICING_PROFILES[p]);
    this.pricingForm.markAsDirty();
  }

  /** Stämmer valen inte längre med profilen är arbetssättet "Anpassat". */
  private syncProfile() {
    const cur = this.pricingForm.controls.profile.value;
    if (cur !== 'service' && cur !== 'workshop') return;
    // Momsvalen finns inte längre och räknas inte.
    const {
      profile: _p,
      privatePricesIncludeVat: _a,
      companyPricesIncludeVat: _b,
      ...want
    } = PRICING_PROFILES[cur] as Record<string, unknown>;
    const have = this.pricingForm.getRawValue() as Record<string, unknown>;
    if (Object.entries(want).some(([k, v]) => have[k] !== v)) {
      this.pricingForm.controls.profile.setValue('custom', { emitEvent: false });
    }
  }

  savePricing() {
    const v = this.pricingForm.getRawValue();
    const ore = (kr: number | null | undefined) =>
      kr == null || (kr as unknown) === '' ? null : Math.round(Number(kr) * 100);
    const num = (n: number | null | undefined) =>
      n == null || (n as unknown) === '' ? null : Number(n);
    this.pricingBusy.set(true);
    this.pricing
      .save({
        // Ändrar ägaren något efter en profil är det ett eget arbetssätt.
        profile: v.profile ?? 'custom',
        priceEntry: v.priceEntry ?? 'order',
        // Priser anges alltid inkl. moms; valen finns inte längre.
        privatePricesIncludeVat: true,
        companyPricesIncludeVat: true,
        roundToKrona: !!v.roundToKrona,
        consumablesPercent: num(v.consumablesPercent),
        consumablesMax: ore(v.consumablesMax),
        consumablesText: v.consumablesText || 'Förbrukningsmaterial',
        quoteValidDays: Number(v.quoteValidDays),
        quoteTolerancePercent: Number(v.quoteTolerancePercent),
        quoteTerms: v.quoteTerms?.trim() || null,
        defaultJobLimit: ore(v.defaultJobLimit),
        showVin: !!v.showVin,
        showMileage: !!v.showMileage,
        requireMileage: !!v.requireMileage,
        internalHourlyCost: ore(v.internalHourlyCost),
        stockOut: v.stockOut ?? 'work_order_done',
        purchaseVatRate: Number(v.purchaseVatRate ?? 25),
      })
      .subscribe({
        next: (p) => {
          this.pricingBusy.set(false);
          this.fillPricing(p);
          this.snack.open('Prissättningen sparades', undefined, { duration: 2500 });
        },
        error: () => this.pricingBusy.set(false),
      });
  }

  saveStorage() {
    this.storageBusy.set(true);
    const v = this.storageForm.getRawValue();
    this.api
      .saveStorageDefaults({
        ...v,
        quantity: Number(v.quantity),
        paymentCycleMonths: Number(v.paymentCycleMonths),
        locationId: v.warehouseId ? v.locationId : null,
      } as Partial<StorageDefaults>)
      .subscribe({
        next: (d) => {
          this.storageBusy.set(false);
          this.storageForm.reset(d as never);
          this.snack.open('Förvalen sparades', undefined, { duration: 2500 });
        },
        error: () => this.storageBusy.set(false),
      });
  }

  saveSeller() {
    this.sellerBusy.set(true);
    const v = this.sellerForm.getRawValue();
    this.api.saveSeller(v).subscribe({
      next: (s) => {
        this.auth.sellerName.set(s.name);
        this.auth.renameGarage(s.name);
        this.sellerBusy.set(false);
        this.snack.open('Fakturauppgifterna sparades', undefined, { duration: 2500 });
      },
      error: () => this.sellerBusy.set(false),
    });
  }

  private loadMembers() {
    this.api.members().subscribe((m) => this.members.set(m));
  }

  invite() {
    this.api.createInvite().subscribe((i) => this.inviteCode.set(i.code));
  }

  readonly roleLabels = GARAGE_ROLE_LABELS;

  setRole(m: GarageMember, role: 'staff' | 'mechanic') {
    if (m.role === role) return;
    this.api.setMemberRole(m.userId, role).subscribe({
      next: (list) => {
        this.members.set(list);
        this.snack.open(
          `${this.label(m)} är nu ${GARAGE_ROLE_LABELS[role].toLowerCase()}`,
          undefined,
          {
            duration: 3000,
          },
        );
      },
      error: () => this.loadMembers(),
    });
  }

  label(m: GarageMember) {
    return m.name || m.email || m.phone || m.userId;
  }

  detail(m: GarageMember) {
    const seen = m.lastSeenAt
      ? `senast inloggad ${new Date(m.lastSeenAt).toLocaleDateString('sv-SE')}`
      : 'har aldrig loggat in';
    const n = m.activeSessions ?? 0;
    const devices = n > 0 ? `${n} ${n === 1 ? 'enhet' : 'enheter'} inloggade` : null;
    return [m.name ? m.email : null, m.phone, seen, devices].filter(Boolean).join(' · ');
  }

  resetPassword(m: GarageMember) {
    this.dialog
      .open<ResetPasswordDialog, GarageMember, boolean>(ResetPasswordDialog, {
        data: m,
        width: '440px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(
        (ok) => ok && this.snack.open('Lösenordet är bytt', undefined, { duration: 3000 }),
      );
  }

  toggleBlocked(m: GarageMember) {
    const block = m.status !== 'blocked';
    const run = () =>
      this.api.setMemberBlocked(m.userId, block).subscribe((list) => this.members.set(list));
    if (!block) {
      run();
      return;
    }
    this.confirm
      .ask({
        title: `Spärra ${this.label(m)}?`,
        message: 'Personen kan inte logga in förrän du aktiverar kontot igen.',
        confirmText: 'Spärra',
        danger: true,
      })
      .subscribe((ok) => ok && run());
  }

  changePassword() {
    const { current, next } = this.pwForm.getRawValue();
    this.pwBusy.set(true);
    this.auth.changePassword(current, next).subscribe({
      next: () => {
        this.pwBusy.set(false);
        this.pwForm.reset();
        this.snack.open('Lösenordet är bytt', undefined, { duration: 3000 });
      },
      error: () => this.pwBusy.set(false),
    });
  }

  remove(m: GarageMember) {
    this.confirm
      .ask({
        title: `Ta bort ${this.label(m)}?`,
        message: 'Personen förlorar åtkomsten till garaget. Det går inte att ångra.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => ok && this.api.removeMember(m.userId).subscribe(() => this.loadMembers()));
  }

  addCompany() {
    const id = this.auth.garage()?.id;
    if (!id) return;
    this.companyBusy.set(true);
    this.api.addCompany(id, this.companyName.value).subscribe({
      next: (c) => {
        this.companyBusy.set(false);
        this.companyName.reset('');
        this.snack.open(`${c.name} lades till`, undefined, { duration: 2500 });
        this.api.allGarages().subscribe((l) => this.auth.garages.set(l));
      },
      error: () => this.companyBusy.set(false),
    });
  }

  save() {
    this.settings.save(this.form.getRawValue() as AppSettings);
    this.snack.open('Inställningarna sparades', undefined, { duration: 2500 });
  }

  reset() {
    this.confirm
      .ask({
        title: 'Återställa standard?',
        message:
          'Dina inställningar för visning, nya artiklar och däckhotell byts mot standardvärdena.',
        confirmText: 'Återställ',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.settings.reset();
        this.form.reset(this.settings.value());
      });
  }
}
