import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { InventoryApi } from '../../../core/api/inventory-api';
import { ArticleInput, SEASON_LABELS } from '../../../core/models';
import { Settings } from '../../../core/settings';

const int = Validators.pattern(/^\d+$/);

@Component({
  selector: 'app-article-form',
  standalone: false,
  template: `
    <h1 class="mb-4 text-2xl font-semibold">{{ id ? 'Ändra artikel' : 'Ny artikel' }}</h1>
    <form [formGroup]="form" (ngSubmit)="save()" class="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
      <mat-form-field
        ><mat-label>Märke</mat-label><input matInput formControlName="brand" list="brands" />
        <datalist id="brands">
          @for (b of brands(); track b) {
            <option [value]="b"></option>
          }
        </datalist>
        <mat-error>Obligatoriskt</mat-error></mat-form-field
      >
      <mat-form-field
        ><mat-label>Modell</mat-label><input matInput formControlName="model" />
        <mat-error>Obligatoriskt</mat-error></mat-form-field
      >
      <mat-form-field
        ><mat-label>Artikelnummer</mat-label><input matInput formControlName="sku"
      /></mat-form-field>

      <mat-form-field
        ><mat-label>Bredd (mm)</mat-label>
        <input matInput type="number" inputmode="numeric" formControlName="width" /><mat-error
          >Heltal krävs</mat-error
        ></mat-form-field
      >
      <mat-form-field
        ><mat-label>Profil</mat-label>
        <input matInput type="number" inputmode="numeric" formControlName="profile" /><mat-error
          >Heltal krävs</mat-error
        ></mat-form-field
      >
      <mat-form-field
        ><mat-label>Fälg (tum)</mat-label>
        <input matInput type="number" inputmode="numeric" formControlName="rimDiameter" /><mat-error
          >Heltal krävs</mat-error
        ></mat-form-field
      >
      <mat-form-field
        ><mat-label>Lastindex</mat-label>
        <input matInput type="number" inputmode="numeric" formControlName="loadIndex" /><mat-error
          >Heltal</mat-error
        ></mat-form-field
      >
      <mat-form-field
        ><mat-label>Hastighetsindex</mat-label><input matInput formControlName="speedIndex"
      /></mat-form-field>
      <mat-form-field
        ><mat-label>Säsong</mat-label>
        <mat-select formControlName="season">
          @for (s of seasons; track s[0]) {
            <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
          }
        </mat-select></mat-form-field
      >
      <mat-form-field
        ><mat-label>DOT</mat-label><input matInput formControlName="dot"
      /></mat-form-field>
      <div class="flex items-center gap-6 pb-4">
        <mat-slide-toggle formControlName="studded">Dubb</mat-slide-toggle>
        <mat-slide-toggle formControlName="runFlat">Runflat</mat-slide-toggle>
      </div>
      <div class="hidden lg:block"></div>

      <mat-form-field
        ><mat-label>Hyllplats</mat-label><input matInput formControlName="location"
      /></mat-form-field>
      <mat-form-field
        ><mat-label>Beställningspunkt</mat-label>
        <input
          matInput
          type="number"
          inputmode="numeric"
          formControlName="reorderLevel"
        /><mat-error>Heltal</mat-error></mat-form-field
      >
      <mat-form-field
        ><mat-label>Försäljningspris (kr)</mat-label>
        <input matInput type="number" inputmode="decimal" step="0.01" formControlName="sellPrice" />
        <mat-error>Ange pris (0 eller mer)</mat-error></mat-form-field
      >
      <mat-form-field
        ><mat-label>Leverantör</mat-label><input matInput formControlName="supplier"
      /></mat-form-field>
      <mat-form-field class="sm:col-span-2"
        ><mat-label>Anteckningar</mat-label><input matInput formControlName="notes"
      /></mat-form-field>

      @if (!id) {
        <mat-form-field
          ><mat-label>Ingångslager (antal)</mat-label>
          <input
            matInput
            type="number"
            inputmode="numeric"
            formControlName="initialQuantity"
          /><mat-error>Heltal</mat-error></mat-form-field
        >
        <mat-form-field
          ><mat-label>Inköpspris per styck (kr)</mat-label>
          <input
            matInput
            type="number"
            inputmode="decimal"
            step="0.01"
            formControlName="initialUnitCost"
          />
          <mat-error>Krävs om ingångslager anges</mat-error></mat-form-field
        >
      }

      <div class="flex gap-2 sm:col-span-2 lg:col-span-3">
        <button mat-flat-button color="primary" class="!h-12" [disabled]="form.invalid || busy()">
          Spara
        </button>
        @if (!id) {
          <button
            mat-stroked-button
            type="button"
            class="!h-12"
            [disabled]="form.invalid || busy()"
            (click)="save(true)"
          >
            Spara och lägg till nästa
          </button>
        }
        <a mat-button class="!h-12" routerLink="/inventory">Avbryt</a>
      </div>
    </form>
  `,
})
export class ArticleForm {
  private readonly api = inject(InventoryApi);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly settings = inject(Settings);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  readonly seasons = Object.entries(SEASON_LABELS);
  readonly busy = signal(false);
  readonly brands = signal<string[]>([]);

  readonly form = inject(FormBuilder).group({
    brand: ['', Validators.required],
    model: ['', Validators.required],
    sku: [''],
    width: [null as number | null, [Validators.required, Validators.min(1), int]],
    profile: [null as number | null, [Validators.required, Validators.min(1), int]],
    rimDiameter: [null as number | null, [Validators.required, Validators.min(1), int]],
    loadIndex: [null as number | null, int],
    speedIndex: [''],
    season: ['winter', Validators.required],
    studded: [false],
    runFlat: [false],
    dot: [''],
    location: [''],
    reorderLevel: [null as number | null, [Validators.min(0), int]],
    sellPrice: [null as number | null, [Validators.required, Validators.min(0)]],
    supplier: [''],
    notes: [''],
    initialQuantity: [null as number | null, [Validators.min(0), int]],
    initialUnitCost: [null as number | null, [Validators.min(0)]],
  });

  constructor() {
    this.api.facets().subscribe((f) => this.brands.set(f.brands.map((b) => String(b.value))));
    if (this.id) {
      this.api
        .article(this.id)
        .subscribe((a) =>
          this.form.patchValue({ ...a, ...a.tyre, sellPrice: a.sellPrice / 100 } as never),
        );
    } else {
      const d = this.settings.value();
      this.form.patchValue({
        season: d.defaultSeason,
        supplier: d.defaultSupplier,
        reorderLevel: d.defaultReorderLevel,
      });
      // Föreslå försäljningspris från inköpspris + påslag så länge priset inte fyllts i.
      this.form.controls.initialUnitCost.valueChanges.subscribe((cost) => {
        if (cost != null && !this.form.controls.sellPrice.dirty) {
          this.form.controls.sellPrice.setValue(Math.round(cost * (1 + d.markupPercent / 100)));
        }
      });
      this.form.controls.initialUnitCost.addValidators((c) =>
        this.form?.value.initialQuantity && c.value == null ? { required: true } : null,
      );
      this.form.controls.initialQuantity.valueChanges.subscribe(() =>
        this.form.controls.initialUnitCost.updateValueAndValidity(),
      );
    }
  }

  save(addNext = false) {
    const v = this.form.getRawValue();
    const opt = <T>(x: T | null | '') => (x === null || x === '' ? undefined : x);
    const body: ArticleInput = {
      brand: v.brand!,
      model: v.model!,
      sku: opt(v.sku),
      tyre: {
        width: v.width!,
        profile: v.profile!,
        rimDiameter: v.rimDiameter!,
        loadIndex: opt(v.loadIndex),
        speedIndex: opt(v.speedIndex),
        season: v.season as never,
        studded: !!v.studded,
        runFlat: !!v.runFlat,
        dot: opt(v.dot),
      },
      location: opt(v.location),
      reorderLevel: opt(v.reorderLevel),
      sellPrice: Math.round(v.sellPrice! * 100),
      supplier: opt(v.supplier),
      notes: opt(v.notes),
    };
    if (!this.id && v.initialQuantity) {
      body.initialQuantity = v.initialQuantity;
      body.initialUnitCost = Math.round((v.initialUnitCost ?? 0) * 100);
    }
    this.busy.set(true);
    const req = this.id ? this.api.updateArticle(this.id, body) : this.api.createArticle(body);
    req.subscribe({
      next: (a) => {
        if (!addNext) return this.router.navigate(['/inventory', a.id]);
        this.busy.set(false);
        this.snack.open(`Sparade ${a.label}`, undefined, { duration: 3000 });
        // Behåll märke, modell, säsong, pris m.m.; nollställ det som skiljer storlekar åt.
        this.form.patchValue({
          sku: '',
          width: null,
          profile: null,
          rimDiameter: null,
          dot: '',
          initialQuantity: null,
        });
        this.form.markAsUntouched();
        return;
      },
      error: () => this.busy.set(false),
    });
  }
}
