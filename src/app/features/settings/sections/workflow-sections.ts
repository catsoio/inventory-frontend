import { Component, inject, signal } from '@angular/core';
import { SettingsStore } from '../settings-store';

/** Prissättning: hur en order prissätts, vad som skrivs ut och hur lagret påverkas. */
@Component({
  selector: 'app-settings-pricing',
  standalone: false,
  styles: `
    .subtab.is-active {
      border-color: var(--mat-sys-primary);
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
  `,
  template: `
    <app-settings-section
      title="Prissättning och dokument"
      [dirty]="s.pricingForm.dirty"
      [valid]="s.pricingForm.valid"
      [busy]="s.pricingBusy()"
      saveText="Spara prissättning"
      (save)="s.savePricing()"
      (discard)="s.discard(s.pricingForm)"
    >
      <div class="mb-5">
        <div class="sec">Arbetssätt</div>
        <mat-radio-group
          [formControl]="s.pricingForm.controls.profile"
          (change)="s.applyProfile($event.value)"
          class="grid gap-3 sm:grid-cols-2"
          aria-label="Arbetssätt"
        >
          <label class="choice" [class.is-on]="s.pricingForm.controls.profile.value === 'service'">
            <mat-radio-button value="service" class="font-medium">Däck och service</mat-radio-button>
            <span class="choice-text">Ett pris per order. Snabbt i kassan, inga prisrader.</span>
          </label>
          <label class="choice" [class.is-on]="s.pricingForm.controls.profile.value === 'workshop'">
            <mat-radio-button value="workshop" class="font-medium">Bilverkstad</mat-radio-button>
            <span class="choice-text">Jobb med egna priser, offerter och förbrukningsmaterial.</span>
          </label>
        </mat-radio-group>
        <p class="mt-2 text-xs text-gray-500">
          Välj det som liknar ert arbetssätt och justera sedan under flikarna. Ändrar du något blir
          det Anpassat.
        </p>
      </div>

      <nav class="mb-5 flex gap-5 border-b border-gray-200" aria-label="Prissättning">
        @for (t of subtabs; track t[0]) {
          <button
            type="button"
            (click)="sub.set(t[0])"
            [class.is-active]="sub() === t[0]"
            class="subtab -mb-px border-b-2 border-transparent py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            {{ t[1] }}
          </button>
        }
      </nav>

      <form [formGroup]="s.pricingForm" (ngSubmit)="s.savePricing()">
        @switch (sub()) {
          @case ('order') {
            <mat-radio-group formControlName="priceEntry" class="mb-6 grid gap-3 sm:grid-cols-2" aria-label="Så prissätts en order">
              <label class="choice" [class.is-on]="s.pricingForm.controls.priceEntry.value === 'order'">
                <mat-radio-button value="order" class="font-medium">Ett pris per order</mat-radio-button>
                <span class="choice-text">Raderna är en checklista för mekanikern, utan pris.</span>
              </label>
              <label class="choice" [class.is-on]="s.pricingForm.controls.priceEntry.value === 'lines'">
                <mat-radio-button value="lines" class="font-medium">Jobb med priser</mat-radio-button>
                <span class="choice-text">Varje jobb har eget pris, med delar under sig.</span>
              </label>
            </mat-radio-group>
            <h3 class="sec">På utskrifterna</h3>
            <div class="mb-6 flex flex-col gap-1">
              <mat-checkbox formControlName="showVin">Chassinummer</mat-checkbox>
              <mat-checkbox formControlName="showMileage">Mätarställning</mat-checkbox>
              <mat-checkbox formControlName="requireMileage">
                Kräv mätarställning innan ordern blir klar
              </mat-checkbox>
            </div>
            <h3 class="sec">Avrundning</h3>
            <mat-checkbox formControlName="roundToKrona">
              Öresutjämning: avrunda att betala till hela kronor
            </mat-checkbox>
          }
          @case ('quote') {
            <div class="mb-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Giltigt (dagar)</mat-label>
                <input matInput type="number" min="1" max="365" formControlName="quoteValidDays" />
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Får avvika (%)</mat-label>
                <input matInput type="number" min="0" max="100" formControlName="quoteTolerancePercent" />
                <mat-hint>Konsumenttjänstlagen: högst 15 % om inget annat avtalats</mat-hint>
              </mat-form-field>
            </div>
            <mat-form-field class="w-full" subscriptSizing="dynamic">
              <mat-label>Villkor under förslaget</mat-label>
              <textarea matInput rows="3" formControlName="quoteTerms" [placeholder]="s.defaultTerms()"></textarea>
              <mat-hint>Tomt = standardtexten</mat-hint>
            </mat-form-field>
          }
          @case ('material') {
            <h3 class="sec">Förbrukningsmaterial</h3>
            <p class="mb-3 max-w-xl text-sm text-gray-600">
              Läggs på ordern som en rad, räknad som en andel av arbetet.
            </p>
            <div class="mb-6 grid gap-x-4 gap-y-3 sm:grid-cols-3">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Procent av arbetet</mat-label>
                <input matInput type="number" min="0" max="100" step="0.5" formControlName="consumablesPercent" />
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
            <h3 class="sec">Efterkalkyl (bara internt)</h3>
            <mat-form-field class="w-full sm:w-1/2" subscriptSizing="dynamic">
              <mat-label>Intern kostnad per timme (kr)</mat-label>
              <input matInput type="number" min="0" formControlName="internalHourlyCost" />
              <mat-hint>Visar vad jobbet tjänade. Syns aldrig för kunden.</mat-hint>
            </mat-form-field>
          }
          @case ('stock') {
            <h3 class="sec">Delar tas ur lagret</h3>
            <mat-radio-group formControlName="stockOut" class="mb-6 grid gap-3 sm:grid-cols-2" aria-label="När delar tas ur lagret">
              <label class="choice" [class.is-on]="s.pricingForm.controls.stockOut.value === 'work_order_done'">
                <mat-radio-button value="work_order_done" class="font-medium">När ordern är klar</mat-radio-button>
              </label>
              <label class="choice" [class.is-on]="s.pricingForm.controls.stockOut.value === 'sales_card_posted'">
                <mat-radio-button value="sales_card_posted" class="font-medium">När säljkortet bokförs</mat-radio-button>
              </label>
            </mat-radio-group>
            <h3 class="sec">Inköp</h3>
            <mat-form-field class="w-full sm:w-1/2" subscriptSizing="dynamic">
              <mat-label>Moms på inköp</mat-label>
              <mat-select formControlName="purchaseVatRate">
                @for (r of [25, 12, 6, 0]; track r) {
                  <mat-option [value]="r">{{ r }} %</mat-option>
                }
              </mat-select>
              <mat-hint>Inköpspriser skrivs inkl. moms; lager och marginal räknas utan</mat-hint>
            </mat-form-field>
          }
        }
      </form>
    </app-settings-section>
  `,
})
export class SettingsPricing {
  readonly s = inject(SettingsStore);
  readonly sub = signal('order');
  readonly subtabs = [
    ['order', 'Arbetsorder'],
    ['quote', 'Offert'],
    ['material', 'Material och kalkyl'],
    ['stock', 'Lager och inköp'],
  ] as const;
}

/** Artiklar och lager: vad en ny artikel börjar med. */
@Component({
  selector: 'app-settings-stock',
  standalone: false,
  template: `
    <app-settings-section
      title="Artiklar och lager"
      text="Det här fylls i när ni lägger upp en ny artikel, så att den som skriver bara ändrar det som avviker. Gäller hela företaget."
      [dirty]="s.defaultsForm.dirty"
      [valid]="s.defaultsForm.valid"
      (save)="s.saveDefaults()"
      (discard)="s.discard(s.defaultsForm)"
    >
      <form
        [formGroup]="s.defaultsForm"
        (ngSubmit)="s.saveDefaults()"
        class="grid gap-x-4 gap-y-3 sm:grid-cols-2"
      >
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Säsong</mat-label>
          <mat-select formControlName="defaultSeason">
            @for (x of s.seasons; track x[0]) {
              <mat-option [value]="x[0]">{{ x[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Leverantör</mat-label>
          <input matInput formControlName="defaultSupplier" />
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Beställningspunkt (st)</mat-label>
          <input matInput type="number" min="0" step="1" formControlName="defaultReorderLevel" />
          <mat-hint>Under det här antalet hamnar artikeln i Att beställa</mat-hint>
          <mat-error>Heltal, 0 eller mer</mat-error>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Påslag på inköpspris (%)</mat-label>
          <input matInput type="number" min="0" step="1" formControlName="markupPercent" />
          <mat-hint>Föreslår försäljningspris vid ingångslager</mat-hint>
        </mat-form-field>
      </form>
    </app-settings-section>
  `,
})
export class SettingsStock {
  readonly s = inject(SettingsStore);
}

/** Däckhotell: avgift och vad en ny inlämning börjar med. */
@Component({
  selector: 'app-settings-hotel',
  standalone: false,
  template: `
    <app-settings-section
      title="Däckhotell"
      text="Det här fylls i när ni tar emot ett set, så att den som står i kassan bara ändrar det som avviker."
      [dirty]="s.defaultsForm.dirty || s.storageForm.dirty"
      [valid]="s.defaultsForm.valid && s.storageForm.valid"
      [busy]="s.storageBusy()"
      saveText="Spara förval"
      (save)="saveAll()"
      (discard)="discardAll()"
    >
      <h3 class="sec">Avgift</h3>
      <form
        [formGroup]="s.defaultsForm"
        (ngSubmit)="saveAll()"
        class="mb-6 grid gap-x-4 gap-y-3 sm:grid-cols-2"
      >
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Standardavgift per inlämning (kr, inkl. moms)</mat-label>
          <input matInput type="number" min="0" step="1" formControlName="defaultStorageFee" />
          <mat-error>0 eller mer</mat-error>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Månader mellan avgifter</mat-label>
          <input
            matInput
            type="number"
            min="1"
            max="60"
            [formControl]="s.storageForm.controls.paymentCycleMonths"
          />
          <mat-hint>12 = en avgift per år</mat-hint>
          <mat-error>1–60</mat-error>
        </mat-form-field>
      </form>

      <form
        [formGroup]="s.storageForm"
        (ngSubmit)="saveAll()"
        class="grid gap-x-4 gap-y-3 sm:grid-cols-2"
      >
        <h3 class="sec sm:col-span-2">Vad som lämnas in</h3>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Brukar lämnas in</mat-label>
          <mat-select formControlName="contents">
            @for (c of s.storageContents; track c[0]) {
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
            @for (c of s.storageConditions; track c[0]) {
              <mat-option [value]="c[0]">{{ c[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <div class="field flex h-11 items-center px-3">
          <mat-slide-toggle formControlName="studded">Vinterdäcken är dubbade</mat-slide-toggle>
        </div>
        <mat-form-field subscriptSizing="dynamic" class="sm:col-span-2">
          <mat-label>Följer oftast med</mat-label>
          <mat-select formControlName="accessories" multiple>
            @for (a of s.storageAccessories; track a[0]) {
              <mat-option [value]="a[0]">{{ a[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <h3 class="sec mt-3 sm:col-span-2">Var det förvaras</h3>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Lager</mat-label>
          <mat-select formControlName="warehouseId">
            <mat-option [value]="null">Ingen vald</mat-option>
            @for (w of s.storageWarehouses(); track w.id) {
              <mat-option [value]="w.id">{{ w.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Plats</mat-label>
          <mat-select formControlName="locationId">
            <mat-option [value]="null">Ingen vald</mat-option>
            @for (l of s.storagePlaces(); track l.id) {
              <mat-option [value]="l.id">{{ l.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <h3 class="sec mt-3 sm:col-span-2">När det hämtas</h3>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Vinterhjul hämtas i</mat-label>
          <mat-select formControlName="winterPickupMonth">
            @for (m of s.months; track $index) {
              <mat-option [value]="$index + 1">{{ m }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Sommarhjul hämtas i</mat-label>
          <mat-select formControlName="summerPickupMonth">
            @for (m of s.months; track $index) {
              <mat-option [value]="$index + 1">{{ m }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
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
