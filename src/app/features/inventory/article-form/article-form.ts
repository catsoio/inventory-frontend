import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, switchMap } from 'rxjs';
import { InventoryApi } from '../../../core/api/inventory-api';
import {
  Article,
  ArticleInput,
  CATEGORY_LABELS,
  Category,
  RIM_MATERIAL_LABELS,
  SEASON_LABELS,
} from '../../../core/models';
import { Settings } from '../../../core/settings';

const int = Validators.pattern(/^\d+$/);
const signedInt = Validators.pattern(/^-?\d+$/);

@Component({
  selector: 'app-article-form',
  standalone: false,
  template: `
    <h1 class="mb-4 text-2xl font-semibold">{{ id ? 'Ändra artikel' : 'Ny artikel' }}</h1>
    <form [formGroup]="form" (ngSubmit)="save()" class="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
      <div class="mb-4 sm:col-span-2 lg:col-span-3">
        <mat-button-toggle-group formControlName="category" hideSingleSelectionIndicator>
          @for (c of categories; track c[0]) {
            <mat-button-toggle [value]="c[0]">{{ c[1] }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
        @if (id) {
          <div class="mt-1 text-xs text-gray-500">
            Du kan byta kategori; fyll då i måtten för den nya kategorin.
          </div>
        }
      </div>

      <mat-form-field
        ><mat-label>Märke</mat-label><mat-icon matPrefix class="mr-2 text-gray-400">label</mat-icon
        ><input matInput formControlName="brand" list="brands" />
        <datalist id="brands">
          @for (b of brands(); track b) {
            <option [value]="b"></option>
          }
        </datalist>
        <mat-error>Obligatoriskt</mat-error></mat-form-field
      >
      <mat-form-field
        ><mat-label>Modell</mat-label
        ><mat-icon matPrefix class="mr-2 text-gray-400">inventory_2</mat-icon
        ><input matInput formControlName="model" />
        <mat-error>Obligatoriskt</mat-error></mat-form-field
      >
      <mat-form-field
        ><mat-label>Artikelnummer</mat-label
        ><mat-icon matPrefix class="mr-2 text-gray-400">qr_code</mat-icon
        ><input matInput formControlName="sku"
      /></mat-form-field>

      @if (category() === 'tyre') {
        <div formGroupName="tyre" class="contents">
          <mat-form-field
            ><mat-label>Bredd (mm)</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">straighten</mat-icon>
            <input matInput type="number" inputmode="numeric" formControlName="width" /><mat-error
              >Heltal krävs</mat-error
            ></mat-form-field
          >
          <mat-form-field
            ><mat-label>Profil</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">straighten</mat-icon>
            <input matInput type="number" inputmode="numeric" formControlName="profile" /><mat-error
              >Heltal krävs</mat-error
            ></mat-form-field
          >
          <mat-form-field
            ><mat-label>Fälg (tum)</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">straighten</mat-icon>
            <input
              matInput
              type="number"
              inputmode="numeric"
              formControlName="rimDiameter"
            /><mat-error>Heltal krävs</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Lastindex</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">weight</mat-icon>
            <input
              matInput
              type="number"
              inputmode="numeric"
              formControlName="loadIndex"
            /><mat-error>Heltal</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Hastighetsindex</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">speed</mat-icon
            ><input matInput formControlName="speedIndex"
          /></mat-form-field>
          <mat-form-field
            ><mat-label>Säsong</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">thermostat</mat-icon>
            <mat-select formControlName="season">
              @for (s of seasons; track s[0]) {
                <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
              }
            </mat-select></mat-form-field
          >
          <mat-form-field
            ><mat-label>DOT</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">calendar_month</mat-icon
            ><input matInput formControlName="dot"
          /></mat-form-field>
          <div class="flex items-center gap-6 pb-4">
            <mat-slide-toggle formControlName="studded">Dubb</mat-slide-toggle>
            <mat-slide-toggle formControlName="runFlat">Runflat</mat-slide-toggle>
          </div>
          <div class="hidden lg:block"></div>
        </div>
      }

      @if (category() === 'rim') {
        <div formGroupName="rim" class="contents">
          <mat-form-field
            ><mat-label>Diameter (tum)</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">straighten</mat-icon>
            <input
              matInput
              type="number"
              inputmode="numeric"
              formControlName="diameter"
            /><mat-error>Heltal krävs</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Bredd (J)</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">straighten</mat-icon>
            <input
              matInput
              type="number"
              inputmode="decimal"
              step="0.5"
              formControlName="width"
            /><mat-error>Ange bredd, t.ex. 7 eller 7,5</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Offset ET (mm)</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">swap_horiz</mat-icon>
            <input matInput type="number" inputmode="numeric" formControlName="offset" /><mat-error
              >Heltal krävs (kan vara negativt)</mat-error
            ></mat-form-field
          >
          <mat-form-field
            ><mat-label>Antal bultar</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">settings</mat-icon>
            <input
              matInput
              type="number"
              inputmode="numeric"
              formControlName="boltCount"
            /><mat-error>3–8</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Delningscirkel PCD (mm)</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">radio_button_unchecked</mat-icon>
            <input
              matInput
              type="number"
              inputmode="decimal"
              step="0.1"
              formControlName="boltCircle"
            />
            <mat-hint>T.ex. 112 för 5x112</mat-hint>
            <mat-error>Ange PCD</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Centrumhål (mm)</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">adjust</mat-icon>
            <input
              matInput
              type="number"
              inputmode="decimal"
              step="0.1"
              formControlName="centerBore"
            />
          </mat-form-field>
          <mat-form-field
            ><mat-label>Material</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">album</mat-icon>
            <mat-select formControlName="material">
              @for (m of materials; track m[0]) {
                <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
              }
            </mat-select></mat-form-field
          >
          <mat-form-field
            ><mat-label>Färg</mat-label
            ><mat-icon matPrefix class="mr-2 text-gray-400">palette</mat-icon
            ><input matInput formControlName="color"
          /></mat-form-field>
          <div class="hidden lg:block"></div>
        </div>
      }

      <mat-form-field
        ><mat-label>Hyllplats</mat-label
        ><mat-icon matPrefix class="mr-2 text-gray-400">location_on</mat-icon
        ><input matInput formControlName="location"
      /></mat-form-field>
      <mat-form-field
        ><mat-label>Beställningspunkt</mat-label
        ><mat-icon matPrefix class="mr-2 text-gray-400">notification_important</mat-icon>
        <input
          matInput
          type="number"
          inputmode="numeric"
          formControlName="reorderLevel"
        /><mat-error>Heltal</mat-error></mat-form-field
      >
      <mat-form-field
        ><mat-label>Leverantör</mat-label
        ><mat-icon matPrefix class="mr-2 text-gray-400">local_shipping</mat-icon
        ><input matInput formControlName="supplier"
      /></mat-form-field>

      <mat-form-field
        ><mat-label>Inköpspris per styck (kr)</mat-label
        ><mat-icon matPrefix class="mr-2 text-gray-400">shopping_cart</mat-icon>
        <input
          matInput
          type="number"
          inputmode="decimal"
          step="0.01"
          min="0"
          formControlName="averageCost"
        />
        @if (id) {
          <mat-hint>Snittpris. Tidigare försäljningar påverkas inte.</mat-hint>
        }
        <mat-error>Krävs om ingångslager anges</mat-error></mat-form-field
      >
      <mat-form-field
        ><mat-label>Försäljningspris (kr)</mat-label
        ><mat-icon matPrefix class="mr-2 text-gray-400">sell</mat-icon>
        <input matInput type="number" inputmode="decimal" step="0.01" formControlName="sellPrice" />
        <mat-error>Ange pris (0 eller mer)</mat-error></mat-form-field
      >
      @if (id) {
        <mat-form-field
          ><mat-label>Lagersaldo (st)</mat-label
          ><mat-icon matPrefix class="mr-2 text-gray-400">inventory</mat-icon>
          <input matInput type="number" inputmode="numeric" formControlName="quantity" />
          <mat-hint>Ändring loggas som inventering</mat-hint>
          <mat-error>Heltal, 0 eller mer</mat-error></mat-form-field
        >
      } @else {
        <mat-form-field
          ><mat-label>Ingångslager (antal)</mat-label
          ><mat-icon matPrefix class="mr-2 text-gray-400">inventory</mat-icon>
          <input
            matInput
            type="number"
            inputmode="numeric"
            formControlName="initialQuantity"
          /><mat-error>Heltal</mat-error></mat-form-field
        >
      }
      <mat-form-field class="sm:col-span-2 lg:col-span-3"
        ><mat-label>Anteckningar</mat-label
        ><mat-icon matPrefix class="mr-2 text-gray-400">notes</mat-icon
        ><input matInput formControlName="notes"
      /></mat-form-field>

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
        <a mat-button class="!h-12" [routerLink]="id ? ['/inventory', id] : '/inventory'">Avbryt</a>
      </div>
    </form>
  `,
})
export class ArticleForm {
  private readonly api = inject(InventoryApi);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly settings = inject(Settings);
  private readonly fb = inject(FormBuilder);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  readonly seasons = Object.entries(SEASON_LABELS);
  readonly materials = Object.entries(RIM_MATERIAL_LABELS);
  readonly categories = Object.entries(CATEGORY_LABELS) as [Category, string][];
  readonly busy = signal(false);
  readonly brands = signal<string[]>([]);
  readonly category = signal<Category>('tyre');
  private savedQuantity = 0;

  readonly form = this.fb.group({
    category: ['tyre' as Category],
    brand: ['', Validators.required],
    model: ['', Validators.required],
    sku: [''],
    tyre: this.fb.group({
      width: [null as number | null, [Validators.required, Validators.min(1), int]],
      profile: [null as number | null, [Validators.required, Validators.min(1), int]],
      rimDiameter: [null as number | null, [Validators.required, Validators.min(1), int]],
      loadIndex: [null as number | null, int],
      speedIndex: [''],
      season: ['winter', Validators.required],
      studded: [false],
      runFlat: [false],
      dot: [''],
    }),
    rim: this.fb.group({
      diameter: [null as number | null, [Validators.required, Validators.min(1), int]],
      width: [null as number | null, [Validators.required, Validators.min(1)]],
      offset: [null as number | null, [Validators.required, signedInt]],
      boltCount: [
        null as number | null,
        [Validators.required, Validators.min(3), Validators.max(8), int],
      ],
      boltCircle: [null as number | null, [Validators.required, Validators.min(1)]],
      centerBore: [null as number | null],
      material: ['alloy', Validators.required],
      color: [''],
    }),
    location: [''],
    reorderLevel: [null as number | null, [Validators.min(0), int]],
    averageCost: [null as number | null, [Validators.min(0)]],
    sellPrice: [null as number | null, [Validators.required, Validators.min(0)]],
    supplier: [''],
    notes: [''],
    quantity: [null as number | null, [Validators.min(0), int]],
    initialQuantity: [null as number | null, [Validators.min(0), int]],
  });

  constructor() {
    this.form.controls.category.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((c) => this.applyCategory(c ?? 'tyre'));
    this.applyCategory('tyre');

    this.api.facets().subscribe((f) => this.brands.set(f.brands.map((b) => String(b.value))));
    if (this.id) {
      this.form.controls.initialQuantity.disable();
      this.api.article(this.id).subscribe((a) => {
        this.savedQuantity = a.quantity;
        this.form.patchValue({
          ...a,
          tyre: a.tyre ?? undefined,
          rim: a.rim ?? undefined,
          sellPrice: a.sellPrice / 100,
          averageCost: a.averageCost / 100,
        } as never);
        this.applyCategory(a.category);
      });
    } else {
      this.form.controls.quantity.disable();
      const d = this.settings.value();
      this.form.patchValue({
        tyre: { season: d.defaultSeason },
        supplier: d.defaultSupplier,
        reorderLevel: d.defaultReorderLevel,
      });
      // Föreslå försäljningspris från inköpspris + påslag så länge priset inte fyllts i.
      this.form.controls.averageCost.valueChanges.pipe(takeUntilDestroyed()).subscribe((cost) => {
        if (cost != null && !this.form.controls.sellPrice.dirty) {
          this.form.controls.sellPrice.setValue(Math.round(cost * (1 + d.markupPercent / 100)));
        }
      });
      this.form.controls.averageCost.addValidators((c) =>
        this.form?.value.initialQuantity && c.value == null ? { required: true } : null,
      );
      this.form.controls.initialQuantity.valueChanges
        .pipe(takeUntilDestroyed())
        .subscribe(() => this.form.controls.averageCost.updateValueAndValidity());
    }
  }

  /** Bara den valda kategorins måttgrupp ska valideras och skickas. */
  private applyCategory(c: Category) {
    this.category.set(c);
    const { tyre, rim } = this.form.controls;
    if (c === 'tyre') tyre.enable();
    else tyre.disable();
    if (c === 'rim') rim.enable();
    else rim.disable();
  }

  save(addNext = false) {
    const v = this.form.getRawValue();
    const editing = !!this.id;
    const opt = <T>(x: T | null | '') => (x === null || x === '' ? undefined : x);
    // Vid ändring måste en tömd text skickas som '' för att faktiskt rensas.
    const text = (x: string | null) => (editing ? (x ?? '') : opt(x));
    const cat = v.category ?? 'tyre';
    const body: ArticleInput = {
      category: cat,
      brand: v.brand!,
      model: v.model!,
      sku: text(v.sku),
      location: text(v.location),
      reorderLevel: editing ? (v.reorderLevel ?? 0) : opt(v.reorderLevel),
      sellPrice: Math.round(v.sellPrice! * 100),
      averageCost: v.averageCost == null ? undefined : Math.round(v.averageCost * 100),
      supplier: text(v.supplier),
      notes: text(v.notes),
    };
    // null rensar den andra kategorins spec vid kategoribyte.
    if (cat === 'tyre') {
      const t = v.tyre;
      body.tyre = {
        width: t.width!,
        profile: t.profile!,
        rimDiameter: t.rimDiameter!,
        loadIndex: opt(t.loadIndex),
        speedIndex: opt(t.speedIndex),
        season: t.season as never,
        studded: !!t.studded,
        runFlat: !!t.runFlat,
        dot: opt(t.dot),
      };
      if (editing) body.rim = null;
    } else if (cat === 'rim') {
      const r = v.rim;
      body.rim = {
        diameter: r.diameter!,
        width: r.width!,
        offset: r.offset!,
        boltCount: r.boltCount!,
        boltCircle: r.boltCircle!,
        centerBore: opt(r.centerBore),
        material: r.material as never,
        color: opt(r.color),
      };
      if (editing) body.tyre = null;
    } else if (editing) {
      body.tyre = null;
      body.rim = null;
    }
    if (!editing && v.initialQuantity) body.initialQuantity = v.initialQuantity;

    this.busy.set(true);
    let req: Observable<Article> = this.id
      ? this.api.updateArticle(this.id, body)
      : this.api.createArticle(body);
    // Saldot är en lagerhändelse: en ändring bokas som inventering så att loggen stämmer.
    const counted = v.quantity;
    if (this.id && counted != null && counted !== this.savedQuantity) {
      req = req.pipe(
        switchMap((a) =>
          this.api.stockAction(a.id, 'adjust', {
            countedQuantity: counted,
            note: 'Ändrat i artikelformuläret',
          }),
        ),
      );
    }
    req.subscribe({
      next: (a) => {
        if (!addNext) return this.router.navigate(['/inventory', a.id]);
        this.busy.set(false);
        this.snack.open(`Sparade ${a.label}`, undefined, { duration: 3000 });
        // Behåll märke, modell, säsong, pris m.m.; nollställ det som skiljer storlekar åt.
        this.form.patchValue({
          sku: '',
          tyre: { width: null, profile: null, rimDiameter: null, dot: '' },
          rim: { diameter: null, width: null, offset: null },
          initialQuantity: null,
        });
        this.form.markAsUntouched();
        return;
      },
      error: () => this.busy.set(false),
    });
  }
}
