import { netOf } from '../../../shared/vat';
import { Component, computed, inject, signal } from '@angular/core';
import { ensureValid } from '../../../shared/form-guard';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, forkJoin, switchMap } from 'rxjs';
import { CatalogApi } from '../../../core/api/catalog-api';
import { InventoryApi } from '../../../core/api/inventory-api';
import {
  Article,
  ArticleField,
  ArticleInput,
  ArticleType,
  Category,
  FieldMode,
  RIM_MATERIAL_LABELS,
  SEASON_LABELS,
  Warehouse,
} from '../../../core/models';
import { Auth } from '../../../core/auth/auth';
import { Pricing } from '../../../core/pricing';
import { Settings } from '../../../core/settings';

const int = Validators.pattern(/^\d+$/);
const signedInt = Validators.pattern(/^-?\d+$/);
/** Senast valda artikeltyp, så att nästa nya artikel börjar där. */
const TYPE_KEY = 'garagestock.articleType';

const lastType = (): string => {
  try {
    return localStorage.getItem(TYPE_KEY) ?? '';
  } catch {
    return '';
  }
};

/** Typens mått ger artikelns kategori (för däck- och fälgspecen). */
const categoryOf = (t: ArticleType | undefined): Category =>
  t?.spec === 'tyre' ? 'tyre' : t?.spec === 'rim' ? 'rim' : 'other';

/**
 * Artikelkortet (ny och ändra). Typen väljs i en rullista bland företagets artikeltyper och styr
 * kortet: vilka fält som krävs, är valfria eller dolda, och om det frågar efter däck- eller
 * fälgmått. Lager och plats väljs ur lagerregistret. Alla priser skrivs inkl. moms; inköpspriset
 * lagras utan moms (ingående moms dras av) med momssatsen från Prissättning.
 */
@Component({
  selector: 'app-article-form',
  standalone: false,
  template: `
    <h1 class="mb-3 text-xl font-semibold md:mb-4 md:text-2xl">
      {{ id ? 'Ändra artikel' : 'Ny artikel' }}
    </h1>
    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4 pb-4">
      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="sec">Artikel</h2>
        <div class="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
          <mat-form-field>
            <mat-label>Artikeltyp</mat-label>
            <mat-select formControlName="typeId">
              @for (t of types(); track t.id) {
                <mat-option [value]="t.id">{{ t.name }}</mat-option>
              }
            </mat-select>
            @if (admin) {
              <mat-hint
                ><a routerLink="/article-types" class="text-brand">Hantera typer</a></mat-hint
              >
            }
            <mat-error>Välj typ</mat-error>
          </mat-form-field>
          @if (show('sku')) {
            <mat-form-field>
              <mat-label>Artikelnummer</mat-label>
              <input matInput formControlName="sku" autocomplete="off" />
              <mat-error>Krävs för {{ type()?.name }}</mat-error>
            </mat-form-field>
          }
          @if (show('brand')) {
            <mat-form-field>
              <mat-label>Märke</mat-label>
              <input matInput formControlName="brand" list="brands" />
              <datalist id="brands">
                @for (b of brands(); track b) {
                  <option [value]="b"></option>
                }
              </datalist>
              <mat-error>Krävs för {{ type()?.name }}</mat-error>
            </mat-form-field>
          }
          @if (show('model')) {
            <mat-form-field class="lg:col-span-2">
              <mat-label>{{ category() === 'tyre' ? 'Modell' : 'Benämning' }}</mat-label>
              <input
                matInput
                formControlName="model"
                [placeholder]="category() === 'tyre' ? 't.ex. Hakkapeliitta 10' : 't.ex. Sensor'"
              />
              <mat-error>Krävs för {{ type()?.name }}</mat-error>
            </mat-form-field>
          }
          @if (show('supplier')) {
            <mat-form-field>
              <mat-label>Leverantör</mat-label>
              <input matInput formControlName="supplier" />
              <mat-error>Krävs för {{ type()?.name }}</mat-error>
            </mat-form-field>
          }
          @if (show('warehouse')) {
            <mat-form-field>
              <mat-label>Lager</mat-label>
              <mat-select formControlName="warehouseId">
                @if (type()?.fields?.warehouse !== 'required') {
                  <mat-option [value]="null">Inget</mat-option>
                }
                @for (w of ownWarehouses(); track w.id) {
                  <mat-option [value]="w.id">{{ w.name }}</mat-option>
                }
              </mat-select>
              @if (admin) {
                <mat-hint
                  ><a routerLink="/warehouses" class="text-brand">Hantera lager</a></mat-hint
                >
              }
              <mat-error>Krävs för {{ type()?.name }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Plats</mat-label>
              <mat-select formControlName="locationId">
                <mat-option [value]="null">Ingen särskild</mat-option>
                @for (l of places(); track l.id) {
                  <mat-option [value]="l.id">{{ l.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
        </div>
        @if (!types().length) {
          <p class="text-sm text-gray-500">Laddar artikeltyper…</p>
        }
      </section>

      @if (category() === 'tyre') {
        <section class="rounded-xl bg-white p-5 shadow-sm" formGroupName="tyre">
          <h2 class="sec">Däck</h2>
          <div class="grid grid-cols-3 gap-x-4 lg:grid-cols-6 2xl:grid-cols-8">
            <mat-form-field>
              <mat-label>Bredd</mat-label>
              <input matInput type="number" inputmode="numeric" formControlName="width" />
              <mat-error>Heltal</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Profil</mat-label>
              <input matInput type="number" inputmode="numeric" formControlName="profile" />
              <mat-error>Heltal</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Tum</mat-label>
              <input matInput type="number" inputmode="numeric" formControlName="rimDiameter" />
              <mat-error>Heltal</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Säsong</mat-label>
              <mat-select formControlName="season">
                @for (s of seasons; track s[0]) {
                  <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Lastindex</mat-label>
              <input matInput type="number" inputmode="numeric" formControlName="loadIndex" />
              <mat-error>Heltal</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Hastighet</mat-label>
              <input matInput formControlName="speedIndex" placeholder="V" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>DOT</mat-label>
              <input matInput formControlName="dot" placeholder="2425" />
            </mat-form-field>
            <div class="col-span-3 flex items-center gap-6 pb-5 lg:col-span-6 2xl:col-span-1">
              <mat-slide-toggle formControlName="studded">Dubb</mat-slide-toggle>
              <mat-slide-toggle formControlName="runFlat">Runflat</mat-slide-toggle>
            </div>
          </div>
        </section>
      }

      @if (category() === 'rim') {
        <section class="rounded-xl bg-white p-5 shadow-sm" formGroupName="rim">
          <h2 class="sec">Fälg</h2>
          <div class="grid grid-cols-2 gap-x-4 sm:grid-cols-4 2xl:grid-cols-8">
            <mat-form-field>
              <mat-label>Tum</mat-label>
              <input matInput type="number" inputmode="numeric" formControlName="diameter" />
              <mat-error>Heltal</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Bredd (J)</mat-label>
              <input
                matInput
                type="number"
                inputmode="decimal"
                step="0.5"
                formControlName="width"
              />
              <mat-error>t.ex. 7 eller 7,5</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Bultar</mat-label>
              <input matInput type="number" inputmode="numeric" formControlName="boltCount" />
              <mat-error>3–8</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>PCD (mm)</mat-label>
              <input
                matInput
                type="number"
                inputmode="decimal"
                step="0.1"
                formControlName="boltCircle"
              />
              <mat-hint>112 för 5x112</mat-hint>
            </mat-form-field>
            <mat-form-field>
              <mat-label>ET (mm)</mat-label>
              <input matInput type="number" inputmode="numeric" formControlName="offset" />
              <mat-error>Heltal</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Centrumhål (mm)</mat-label>
              <input
                matInput
                type="number"
                inputmode="decimal"
                step="0.1"
                formControlName="centerBore"
              />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Material</mat-label>
              <mat-select formControlName="material">
                @for (m of materials; track m[0]) {
                  <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Färg</mat-label>
              <input matInput formControlName="color" />
            </mat-form-field>
          </div>
        </section>
      }

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="sec">Pris och lager</h2>
        <div class="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          @if (admin || !id) {
            <mat-form-field>
              <mat-label>Inköpspris (kr, inkl. moms)</mat-label>
              <input
                matInput
                type="number"
                inputmode="decimal"
                step="0.01"
                min="0"
                formControlName="cost"
              />
              <mat-hint>{{ costHint() }}</mat-hint>
              <mat-error>Krävs när du lägger in lager</mat-error>
            </mat-form-field>
          }
          <mat-form-field>
            <mat-label>Försäljningspris (kr, inkl. moms)</mat-label>
            <input
              matInput
              type="number"
              inputmode="decimal"
              step="0.01"
              formControlName="sellPrice"
            />
            <mat-hint>{{ marginHint() }}</mat-hint>
            <mat-error>Ange pris (0 eller mer)</mat-error>
          </mat-form-field>
          @if (id) {
            <mat-form-field>
              <mat-label>I lager (st)</mat-label>
              <input matInput type="number" inputmode="numeric" formControlName="quantity" />
              <mat-hint>En ändring sparas som inventering</mat-hint>
              <mat-error>Heltal, 0 eller mer</mat-error>
            </mat-form-field>
          } @else {
            <mat-form-field>
              <mat-label>I lager nu (st)</mat-label>
              <input matInput type="number" inputmode="numeric" formControlName="initialQuantity" />
              <mat-hint>Valfritt: det du har på hyllan</mat-hint>
              <mat-error>Heltal</mat-error>
            </mat-form-field>
          }
        </div>

        <button
          mat-button
          type="button"
          class="mt-1 !px-0"
          (click)="more.set(!more())"
          [attr.aria-expanded]="more()"
        >
          <mat-icon>{{ more() ? 'expand_less' : 'expand_more' }}</mat-icon>
          Fler val
        </button>
        @if (more()) {
          <div class="mt-2 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
            <mat-form-field>
              <mat-label>Påminn när det är kvar (st)</mat-label>
              <input matInput type="number" inputmode="numeric" formControlName="reorderLevel" />
              <mat-hint>Artikeln visas som "Lågt lager". Tomt eller 0 = ingen påminnelse.</mat-hint>
              <mat-error>Heltal</mat-error>
            </mat-form-field>
            <mat-form-field class="lg:col-span-3">
              <mat-label>Anteckningar</mat-label>
              <input matInput formControlName="notes" />
            </mat-form-field>
          </div>
        }
      </section>

      <div class="flex flex-wrap gap-2">
        <button mat-flat-button color="primary" class="!h-12 max-md:flex-1" [disabled]="busy()">
          Spara
        </button>
        @if (!id) {
          <button
            mat-stroked-button
            type="button"
            class="!h-12"
            [disabled]="busy()"
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
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly settings = inject(Settings);
  private readonly pricing = inject(Pricing);
  readonly admin = inject(Auth).isAdmin();
  private readonly fb = inject(FormBuilder);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  readonly seasons = Object.entries(SEASON_LABELS);
  readonly materials = Object.entries(RIM_MATERIAL_LABELS);
  readonly busy = signal(false);
  readonly brands = signal<string[]>([]);
  readonly types = signal<ArticleType[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  /** "Fler val": påminnelsenivå och anteckningar. Öppen om något redan är ifyllt. */
  readonly more = signal(false);
  private savedQuantity = 0;

  readonly form = this.fb.group({
    typeId: ['', Validators.required],
    brand: [''],
    model: [''],
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
      offset: [null as number | null, signedInt],
      boltCount: [null as number | null, [Validators.min(3), Validators.max(8), int]],
      boltCircle: [null as number | null, Validators.min(1)],
      centerBore: [null as number | null],
      material: ['alloy', Validators.required],
      color: [''],
    }),
    warehouseId: [null as string | null],
    locationId: [null as string | null],
    reorderLevel: [null as number | null, [Validators.min(0), int]],
    /** Inköpspris per styck, kr inkl. moms (lagras utan). */
    cost: [null as number | null, [Validators.min(0)]],
    sellPrice: [null as number | null, [Validators.required, Validators.min(0)]],
    supplier: [''],
    notes: [''],
    quantity: [null as number | null, [Validators.min(0), int]],
    initialQuantity: [null as number | null, [Validators.min(0), int]],
  });

  private readonly typeId = toSignal(this.form.controls.typeId.valueChanges, {
    initialValue: this.form.controls.typeId.value,
  });
  private readonly warehouseId = toSignal(this.form.controls.warehouseId.valueChanges, {
    initialValue: null as string | null,
  });
  private readonly values = toSignal(this.form.valueChanges, { initialValue: null });

  /** Den valda artikeltypen. */
  readonly type = computed(() => this.types().find((t) => t.id === this.typeId()));
  readonly category = computed(() => categoryOf(this.type()));
  readonly ownWarehouses = computed(() => this.warehouses().filter((w) => w.kind === 'own'));
  /** Platserna i det valda lagret. */
  readonly places = computed(
    () => this.warehouses().find((w) => w.id === this.warehouseId())?.locations ?? [],
  );

  /** Är fältet synligt för typen? Utan vald typ visas allt. */
  show(f: ArticleField) {
    return (this.type()?.fields[f] ?? 'optional') !== 'hidden';
  }

  /** "varav moms 199 kr · 796 kr exkl." under inköpspriset. */
  readonly costHint = computed(() => {
    this.values();
    const kr = this.form.controls.cost.value;
    if (kr == null || Number.isNaN(kr)) return `Moms ${this.pricing.value().purchaseVatRate} %`;
    const gross = Math.round(kr * 100);
    const net = this.pricing.costNet(gross);
    return `varav moms ${fmt(gross - net)} kr · ${fmt(net)} kr exkl.`;
  });

  /** Marginal på försäljningspriset mot inköpspriset, båda utan moms. */
  readonly marginHint = computed(() => {
    this.values();
    const sell = this.form.controls.sellPrice.value;
    const cost = this.form.controls.cost.value;
    if (sell == null || Number.isNaN(sell) || sell <= 0) return '';
    const sellNet = netOf(Math.round(sell * 100));
    const vat = `varav moms ${fmt(Math.round(sell * 100) - sellNet)} kr`;
    if (cost == null || Number.isNaN(cost)) return vat;
    const costNet = this.pricing.costNet(Math.round(cost * 100));
    const margin = sellNet - costNet;
    return `${vat} · marginal ${fmt(margin)} kr (${Math.round((margin / sellNet) * 100)} %)`;
  });

  constructor() {
    // Typen styr kortet: kategori (mått) och vilka fält som krävs.
    this.form.controls.typeId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => this.applyType(this.types().find((t) => t.id === id)));
    // Ett annat lager har andra platser.
    this.form.controls.warehouseId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const w = this.warehouses().find((x) => x.id === this.form.controls.warehouseId.value);
      const place = this.form.controls.locationId.value;
      if (place && !w?.locations.some((l) => l.id === place)) {
        this.form.controls.locationId.setValue(null, { emitEvent: false });
      }
    });

    this.api.facets().subscribe((f) => this.brands.set(f.brands.map((b) => String(b.value))));
    forkJoin([this.catalog.articleTypes(), this.catalog.warehouses()]).subscribe(([types, whs]) => {
      this.types.set(types);
      this.warehouses.set(whs);
      this.start();
    });
  }

  /** Typer och lager är laddade: fyll i kortet. */
  private start() {
    if (this.id) {
      this.form.controls.initialQuantity.disable();
      this.api.article(this.id).subscribe((a) => {
        this.savedQuantity = a.quantity;
        // Äldre artiklar utan typ får den som passar kategorin.
        const typeId =
          a.typeId && this.types().some((t) => t.id === a.typeId)
            ? a.typeId
            : this.typeForCategory(a.category)?.id;
        this.form.patchValue({
          ...a,
          typeId,
          tyre: a.tyre ?? undefined,
          rim: a.rim ?? undefined,
          sellPrice: a.sellPrice / 100,
          cost: a.averageCost == null ? null : this.pricing.costIncl(a.averageCost) / 100,
          warehouseId: a.warehouseId ?? null,
          locationId: a.locationId ?? null,
        } as never);
        this.applyType(this.types().find((t) => t.id === typeId));
        this.more.set(!!a.reorderLevel || !!a.notes);
      });
      return;
    }
    this.form.controls.quantity.disable();
    const d = this.settings.value();
    const remembered = this.types().find((t) => t.id === lastType());
    this.form.patchValue({
      typeId: (remembered ?? this.types().find((t) => t.spec === 'tyre') ?? this.types()[0])?.id,
      tyre: { season: d.defaultSeason },
      supplier: d.defaultSupplier,
      reorderLevel: d.defaultReorderLevel || null,
    });
    // Föreslå försäljningspris från inköpspris + påslag så länge priset inte fyllts i.
    this.form.controls.cost.valueChanges.pipe(takeUntilDestroyed()).subscribe((cost) => {
      if (cost != null && !this.form.controls.sellPrice.dirty) {
        // Påslaget räknas på nettot; försäljningspriset blir inkl. 25 % moms.
        const net = this.pricing.costNet(Math.round(cost * 100)) / 100;
        this.form.controls.sellPrice.setValue(Math.round(net * (1 + d.markupPercent / 100) * 1.25));
      }
    });
    this.form.controls.cost.addValidators((c) =>
      this.form?.value.initialQuantity && c.value == null ? { required: true } : null,
    );
    this.form.controls.initialQuantity.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.cost.updateValueAndValidity());
  }

  private typeForCategory(c: Category) {
    const spec = c === 'tyre' ? 'tyre' : c === 'rim' ? 'rim' : 'none';
    const list = this.types().filter((t) => t.spec === spec);
    // Övrigt: den enda typen vid namn Övrigt, annars den första utan mått.
    return (spec === 'none' ? list.find((t) => t.name === 'Övrigt') : undefined) ?? list[0];
  }

  /** Sätter krav och synlighet efter typen, och slår på rätt mått. */
  private applyType(t: ArticleType | undefined) {
    const mode = (f: ArticleField): FieldMode => t?.fields[f] ?? 'optional';
    const c = this.form.controls;
    const set = (ctl: typeof c.brand, f: ArticleField) => {
      ctl.setValidators(mode(f) === 'required' ? [Validators.required] : []);
      ctl.updateValueAndValidity({ emitEvent: false });
    };
    set(c.brand, 'brand');
    set(c.model, 'model');
    set(c.sku, 'sku');
    set(c.supplier, 'supplier');
    c.warehouseId.setValidators(mode('warehouse') === 'required' ? [Validators.required] : []);
    c.warehouseId.updateValueAndValidity({ emitEvent: false });

    const cat = categoryOf(t);
    if (cat === 'tyre') c.tyre.enable({ emitEvent: false });
    else c.tyre.disable({ emitEvent: false });
    if (cat === 'rim') c.rim.enable({ emitEvent: false });
    else c.rim.disable({ emitEvent: false });
    if (t && !this.id) {
      try {
        localStorage.setItem(TYPE_KEY, t.id);
      } catch {
        // Utan lagring börjar nästa artikel på standardtypen; inget mer händer.
      }
    }
  }

  save(addNext = false) {
    if (!ensureValid(this.form, this.snack)) return;

    const v = this.form.getRawValue();
    const editing = !!this.id;
    const opt = <T>(x: T | null | '') => (x === null || x === '' ? undefined : x);
    const num = <T>(x: T | null | '') => (x === null || x === '' ? null : x);
    // Vid ändring måste en tömd text skickas som '' för att faktiskt rensas.
    const text = (x: string | null) => (editing ? (x ?? '') : opt(x));
    const cat = this.category();
    const body: ArticleInput = {
      category: cat,
      typeId: v.typeId,
      brand: v.brand?.trim() ?? '',
      model: v.model?.trim() ?? '',
      sku: text(v.sku),
      warehouseId: v.warehouseId,
      locationId: v.locationId,
      reorderLevel: editing ? (v.reorderLevel ?? 0) : opt(v.reorderLevel),
      sellPrice: Math.round(v.sellPrice! * 100),
      // Inköpspriset skrivs inkl. moms och lagras utan (ingående moms dras av).
      averageCost:
        v.cost == null || (editing && !this.admin)
          ? undefined
          : this.pricing.costNet(Math.round(v.cost * 100)),
      supplier: text(v.supplier),
      notes: text(v.notes),
    };
    // null rensar den andra typens mått vid typbyte.
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
        offset: num(r.offset),
        boltCount: num(r.boltCount),
        boltCircle: num(r.boltCircle),
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
        // Behåll typ, märke, lager, säsong, pris m.m.; nollställ det som skiljer artiklar åt.
        this.form.patchValue({
          sku: '',
          model: this.category() === 'other' ? '' : this.form.controls.model.value,
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

const fmt = (ore: number) =>
  (ore / 100).toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
