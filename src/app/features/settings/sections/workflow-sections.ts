import { Component, inject } from '@angular/core';
import { SettingsStore } from '../settings-store';

/** Arbetsorder och offert: hur en order prissätts, vad som skrivs ut och hur förslaget ser ut. */
@Component({
  selector: 'app-settings-pricing',
  standalone: false,
  template: `
    <app-settings-section
      [dirty]="s.pricingForm.dirty"
      [valid]="s.pricingForm.valid"
      [busy]="s.pricingBusy()"
      saveText="Spara"
      (save)="s.savePricing()"
      (discard)="s.discard(s.pricingForm)"
    >
      <form [formGroup]="s.pricingForm" (ngSubmit)="s.savePricing()">
        <app-setting-group>
          <app-setting-row
            label="Arbetssätt"
            [hint]="
              s.pricingForm.controls.profile.value === 'custom'
                ? 'Anpassat: ni har ändrat något nedan.'
                : 'Ett förval som fyller i resten. Justera sedan nedan.'
            "
          >
            <mat-button-toggle-group
              [formControl]="s.pricingForm.controls.profile"
              (change)="s.applyProfile($event.value)"
              aria-label="Arbetssätt"
              hideSingleSelectionIndicator
            >
              <mat-button-toggle value="service">Däck och service</mat-button-toggle>
              <mat-button-toggle value="workshop">Bilverkstad</mat-button-toggle>
            </mat-button-toggle-group>
          </app-setting-row>
        </app-setting-group>

        <app-setting-group title="Utskrift och klarmarkering">
          <app-setting-row label="Visa chassinummer på utskrifter">
            <mat-slide-toggle formControlName="showVin" aria-label="Visa chassinummer" />
          </app-setting-row>
          <app-setting-row label="Visa mätarställning på utskrifter">
            <mat-slide-toggle formControlName="showMileage" aria-label="Visa mätarställning" />
          </app-setting-row>
          <app-setting-row
            label="Kräv mätarställning för att markera Klar"
            hint="Ordern kan inte bli klar utan den."
          >
            <mat-slide-toggle formControlName="requireMileage" aria-label="Kräv mätarställning" />
          </app-setting-row>
        </app-setting-group>

        <app-setting-group title="Priser och avrundning">
          <app-setting-row
            label="Avrunda till hela kronor"
            hint="Öresutjämning på beloppet att betala."
          >
            <mat-slide-toggle
              formControlName="roundToKrona"
              aria-label="Avrunda till hela kronor"
            />
          </app-setting-row>
          <app-setting-row
            label="Förbrukningsmaterial"
            hint="Läggs på ordern som en rad, en andel av arbetet. Tomt = av."
          >
            <mat-form-field subscriptSizing="dynamic" class="w-32">
              <input
                matInput
                type="number"
                min="0"
                max="100"
                step="0.5"
                formControlName="consumablesPercent"
                aria-label="Procent av arbetet"
              />
              <span matTextSuffix>%</span>
            </mat-form-field>
          </app-setting-row>
          <app-setting-row label="Tak för förbrukningsmaterial" hint="Tomt = inget tak.">
            <mat-form-field subscriptSizing="dynamic" class="w-32">
              <input
                matInput
                type="number"
                min="0"
                formControlName="consumablesMax"
                aria-label="Högst i kronor"
              />
              <span matTextSuffix>kr</span>
            </mat-form-field>
          </app-setting-row>
          <app-setting-row label="Text på raden">
            <mat-form-field subscriptSizing="dynamic" class="w-60">
              <input matInput formControlName="consumablesText" aria-label="Text på raden" />
            </mat-form-field>
          </app-setting-row>
          <app-setting-row
            label="Intern kostnad per timme"
            hint="Bara internt: visar vad ett jobb tjänade."
          >
            <mat-form-field subscriptSizing="dynamic" class="w-32">
              <input
                matInput
                type="number"
                min="0"
                formControlName="internalHourlyCost"
                aria-label="Intern kostnad per timme"
              />
              <span matTextSuffix>kr</span>
            </mat-form-field>
          </app-setting-row>
        </app-setting-group>

        <app-setting-group title="Offert">
          <app-setting-row label="Giltig i">
            <mat-form-field subscriptSizing="dynamic" class="w-32">
              <input
                matInput
                type="number"
                min="1"
                max="365"
                formControlName="quoteValidDays"
                aria-label="Giltig i dagar"
              />
              <span matTextSuffix>dagar</span>
            </mat-form-field>
          </app-setting-row>
          <app-setting-row
            label="Slutpriset får avvika"
            hint="Konsumenttjänstlagen: högst 15 % om inget annat avtalats."
          >
            <mat-form-field subscriptSizing="dynamic" class="w-32">
              <input
                matInput
                type="number"
                min="0"
                max="100"
                formControlName="quoteTolerancePercent"
                aria-label="Avvikelse i procent"
              />
              <span matTextSuffix>%</span>
            </mat-form-field>
          </app-setting-row>
          <div class="py-3.5">
            <div class="mb-1 text-[15px] font-medium">Villkor under förslaget</div>
            <mat-form-field class="w-full" subscriptSizing="dynamic">
              <textarea
                matInput
                rows="3"
                formControlName="quoteTerms"
                [placeholder]="s.defaultTerms()"
                aria-label="Villkor under förslaget"
              ></textarea>
              <mat-hint>Tomt = standardtexten</mat-hint>
            </mat-form-field>
          </div>
        </app-setting-group>
      </form>
      <app-settings-screen />
    </app-settings-section>
  `,
})
export class SettingsPricing {
  readonly s = inject(SettingsStore);
}

/** Lager och kunder: förval för nya artiklar, lagerregler och kundlistans knappar. */
@Component({
  selector: 'app-settings-stock',
  standalone: false,
  template: `
    <app-settings-section
      [dirty]="s.defaultsForm.dirty || s.pricingForm.dirty"
      [valid]="s.defaultsForm.valid && s.pricingForm.valid"
      [busy]="s.pricingBusy()"
      (save)="saveAll()"
      (discard)="discardAll()"
    >
      <form [formGroup]="s.defaultsForm" (ngSubmit)="saveAll()">
        <app-setting-group
          title="Ny artikel"
          text="Det här fylls i när ni lägger upp en artikel, så att den som skriver bara ändrar det som avviker."
        >
          <app-setting-row label="Säsong">
            <mat-form-field subscriptSizing="dynamic" class="w-48">
              <mat-select formControlName="defaultSeason" aria-label="Säsong">
                @for (x of s.seasons; track x[0]) {
                  <mat-option [value]="x[0]">{{ x[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </app-setting-row>
          <app-setting-row label="Leverantör">
            <mat-form-field subscriptSizing="dynamic" class="w-60">
              <input matInput formControlName="defaultSupplier" aria-label="Leverantör" />
            </mat-form-field>
          </app-setting-row>
          <app-setting-row
            label="Påminn när det är kvar"
            hint="Under det här antalet hamnar artikeln i Att beställa."
          >
            <mat-form-field subscriptSizing="dynamic" class="w-32">
              <input
                matInput
                type="number"
                min="0"
                step="1"
                formControlName="defaultReorderLevel"
                aria-label="Beställningspunkt"
              />
              <span matTextSuffix>st</span>
            </mat-form-field>
          </app-setting-row>
          <app-setting-row
            label="Påslag på inköpspris"
            hint="Föreslår försäljningspris vid ingångslager."
          >
            <mat-form-field subscriptSizing="dynamic" class="w-32">
              <input
                matInput
                type="number"
                min="0"
                step="1"
                formControlName="markupPercent"
                aria-label="Påslag i procent"
              />
              <span matTextSuffix>%</span>
            </mat-form-field>
          </app-setting-row>
        </app-setting-group>
      </form>

      <form [formGroup]="s.pricingForm" (ngSubmit)="saveAll()">
        <app-setting-group title="Lager och inköp">
          <app-setting-row label="Delar tas ur lagret">
            <mat-button-toggle-group
              formControlName="stockOut"
              aria-label="När delar tas ur lagret"
              hideSingleSelectionIndicator
            >
              <mat-button-toggle value="work_order_done">När ordern är klar</mat-button-toggle>
              <mat-button-toggle value="sales_card_posted"
                >När säljkortet bokförs</mat-button-toggle
              >
            </mat-button-toggle-group>
          </app-setting-row>
          <app-setting-row
            label="Moms på inköp"
            hint="Inköpspriser skrivs inkl. moms; lager och marginal räknas utan."
          >
            <mat-form-field subscriptSizing="dynamic" class="w-32">
              <mat-select formControlName="purchaseVatRate" aria-label="Moms på inköp">
                @for (r of [25, 12, 6, 0]; track r) {
                  <mat-option [value]="r">{{ r }} %</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </app-setting-row>
        </app-setting-group>
      </form>

      <form [formGroup]="s.defaultsForm" (ngSubmit)="saveAll()">
        <app-setting-group title="Kundlistan på mobil">
          <app-setting-row
            label="Knappar på varje kund"
            hint="Välj det ni använder mest. Kartan öppnar kundens adress i Google Maps."
          >
            <mat-form-field subscriptSizing="dynamic" class="w-60">
              <mat-select formControlName="customerButtons" multiple aria-label="Knappar">
                @for (b of s.customerButtonOptions; track b[0]) {
                  <mat-option [value]="b[0]">{{ b[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </app-setting-row>
        </app-setting-group>
      </form>
    </app-settings-section>
  `,
})
export class SettingsStock {
  readonly s = inject(SettingsStore);

  /** Förvalen och lagerreglerna ligger i olika formulär: båda sparas. */
  saveAll(): void {
    if (this.s.defaultsForm.dirty) this.s.saveDefaults();
    if (this.s.pricingForm.dirty) this.s.savePricing();
  }

  discardAll(): void {
    this.s.discard(this.s.defaultsForm);
    this.s.discard(this.s.pricingForm);
  }
}

/** Däckhotell: avgift och vad en ny inlämning börjar med. */
@Component({
  selector: 'app-settings-hotel',
  standalone: false,
  template: `
    <app-settings-section
      [dirty]="s.defaultsForm.dirty || s.storageForm.dirty"
      [valid]="s.defaultsForm.valid && s.storageForm.valid"
      [busy]="s.storageBusy()"
      (save)="saveAll()"
      (discard)="discardAll()"
    >
      <app-setting-group title="Avgift">
        <app-setting-row label="Avgift per inlämning" hint="Kronor, inkl. moms.">
          <mat-form-field subscriptSizing="dynamic" class="w-32" [formGroup]="s.defaultsForm">
            <input
              matInput
              type="number"
              min="0"
              step="1"
              formControlName="defaultStorageFee"
              aria-label="Standardavgift"
            />
            <span matTextSuffix>kr</span>
          </mat-form-field>
        </app-setting-row>
        <app-setting-row label="Tid mellan avgifter" hint="12 månader = en avgift per år.">
          <mat-form-field subscriptSizing="dynamic" class="w-36">
            <input
              matInput
              type="number"
              min="1"
              max="60"
              [formControl]="s.storageForm.controls.paymentCycleMonths"
              aria-label="Månader mellan avgifter"
            />
            <span matTextSuffix>månader</span>
          </mat-form-field>
        </app-setting-row>
      </app-setting-group>

      <form [formGroup]="s.storageForm" (ngSubmit)="saveAll()">
        <app-setting-group title="Vad som lämnas in">
          <app-setting-row label="Brukar lämnas in">
            <mat-form-field subscriptSizing="dynamic" class="w-60">
              <mat-select formControlName="contents" aria-label="Brukar lämnas in">
                @for (c of s.storageContents; track c[0]) {
                  <mat-option [value]="c[0]">{{ c[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </app-setting-row>
          <app-setting-row label="Antal hjul i ett set">
            <mat-form-field subscriptSizing="dynamic" class="w-32">
              <input
                matInput
                type="number"
                min="1"
                max="12"
                formControlName="quantity"
                aria-label="Antal hjul"
              />
              <span matTextSuffix>st</span>
            </mat-form-field>
          </app-setting-row>
          <app-setting-row label="Skick vid inlämning">
            <mat-form-field subscriptSizing="dynamic" class="w-48">
              <mat-select formControlName="condition" aria-label="Skick vid inlämning">
                @for (c of s.storageConditions; track c[0]) {
                  <mat-option [value]="c[0]">{{ c[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </app-setting-row>
          <app-setting-row label="Vinterdäcken är dubbade">
            <mat-slide-toggle formControlName="studded" aria-label="Dubbade" />
          </app-setting-row>
          <app-setting-row label="Följer oftast med">
            <mat-form-field subscriptSizing="dynamic" class="w-60">
              <mat-select formControlName="accessories" multiple aria-label="Följer med">
                @for (a of s.storageAccessories; track a[0]) {
                  <mat-option [value]="a[0]">{{ a[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </app-setting-row>
        </app-setting-group>

        <app-setting-group title="Förvaring och hämtning">
          <app-setting-row label="Lager">
            <mat-form-field subscriptSizing="dynamic" class="w-60">
              <mat-select formControlName="warehouseId" aria-label="Lager">
                <mat-option [value]="null">Ingen vald</mat-option>
                @for (w of s.storageWarehouses(); track w.id) {
                  <mat-option [value]="w.id">{{ w.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </app-setting-row>
          <app-setting-row label="Plats">
            <mat-form-field subscriptSizing="dynamic" class="w-60">
              <mat-select formControlName="locationId" aria-label="Plats">
                <mat-option [value]="null">Ingen vald</mat-option>
                @for (l of s.storagePlaces(); track l.id) {
                  <mat-option [value]="l.id">{{ l.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </app-setting-row>
          <app-setting-row label="Vinterhjul hämtas i">
            <mat-form-field subscriptSizing="dynamic" class="w-48">
              <mat-select formControlName="winterPickupMonth" aria-label="Vinterhjul hämtas i">
                @for (m of s.months; track $index) {
                  <mat-option [value]="$index + 1">{{ m }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </app-setting-row>
          <app-setting-row label="Sommarhjul hämtas i">
            <mat-form-field subscriptSizing="dynamic" class="w-48">
              <mat-select formControlName="summerPickupMonth" aria-label="Sommarhjul hämtas i">
                @for (m of s.months; track $index) {
                  <mat-option [value]="$index + 1">{{ m }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </app-setting-row>
        </app-setting-group>
      </form>
    </app-settings-section>
  `,
})
export class SettingsHotel {
  readonly s = inject(SettingsStore);

  /** Avgiften ligger bland företagets standardvärden, förvalen för sig: båda sparas. */
  saveAll(): void {
    if (this.s.defaultsForm.dirty) this.s.saveDefaults();
    if (this.s.storageForm.dirty) this.s.saveStorage();
  }

  discardAll(): void {
    this.s.discard(this.s.defaultsForm);
    this.s.discard(this.s.storageForm);
  }
}
