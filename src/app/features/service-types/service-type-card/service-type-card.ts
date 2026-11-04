import { Component, OnInit, inject, signal } from '@angular/core';
import { ensureValid } from '../../../shared/form-guard';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkshopApi } from '../../../core/api/workshop-api';
import {
  PriceCampaign,
  PriceRule,
  ServicePrice,
  ServiceTemplateLine,
  ServiceType,
  VEHICLE_CLASS_LABELS,
  VehicleClass,
} from '../../../core/models';
import { fromPrice, today } from '../../../core/service-pricing';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Auth } from '../../../core/auth/auth';

const toNum = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);
/** Kronor → öre; tomt är null. */
const toOre = (kr: unknown): number | null => {
  const n = toNum(kr);
  return n === null ? null : Math.round(n * 100);
};

/**
 * Kortet för en åtgärd: namn, standardtid och prisspann som bokningen fylls i med, en mall
 * (operationskod och färdiga rader) som läggs på ett jobb på arbetsordern med ett klick, pris
 * efter bil (klass, fälgstorlek, per bil eller per hjul) och en kampanj.
 */
@Component({
  selector: 'app-service-type-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/service-types"
      listLabel="Åtgärder"
      newTitle="Ny åtgärd"
      [title]="card()?.name ?? ''"
      [code]="card()?.code ?? null"
      [archived]="!!card() && !card()!.active"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          @if (c.active) {
            @if (admin) {
              <button
                mat-icon-button
                class="!text-red-700"
                aria-label="Ta bort"
                matTooltip="Ta bort"
                (click)="remove()"
              >
                <mat-icon>delete_outline</mat-icon>
              </button>
            }
          } @else {
            @if (admin) {
              <button mat-stroked-button (click)="restore()">Återställ</button>
            }
          }
        }
        @if (admin) {
          <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
            Spara
          </button>
        }
      </div>

      <form
        [formGroup]="form"
        class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-[1fr_11rem_11rem]"
      >
        <mat-form-field>
          <mat-label>Åtgärd</mat-label>
          <input matInput formControlName="name" autocomplete="off" />
          <mat-error>Ange namn</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Tid (minuter)</mat-label>
          <input matInput type="number" min="5" step="5" formControlName="minutes" />
          <mat-error>Minst 5 minuter</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Pris (kr, inkl. moms)</mat-label>
          <input matInput type="number" min="0" formControlName="priceFrom" />
          <mat-hint>{{ form.controls.priceFrom.value | vatPart }}</mat-hint>
        </mat-form-field>
      </form>

      <section class="mt-4 rounded-xl bg-white p-5 shadow-sm" [formGroup]="form">
        <div class="mb-1 flex flex-wrap items-center gap-2">
          <h2 class="flex-1 text-base font-semibold">Mall för arbetsorder</h2>
          @if (admin) {
            <button mat-stroked-button type="button" (click)="addRow('labour')">
              <mat-icon>build</mat-icon> Arbete
            </button>
            <button mat-stroked-button type="button" (click)="addRow('part')">
              <mat-icon>inventory_2</mat-icon> Del
            </button>
            <button mat-stroked-button type="button" (click)="addRow('fee')">
              <mat-icon>add</mat-icon> Avgift
            </button>
          }
        </div>
        <p class="mb-3 text-sm text-gray-600">
          Raderna läggs på jobbet när man väljer åtgärden ("Från åtgärd"). Utan rader blir det en
          arbetsrad med åtgärdens namn och pris. Priser inkl. moms; tiden är bara intern.
        </p>
        <div formArrayName="lines" class="flex flex-col gap-2">
          @for (row of lines.controls; track row; let i = $index) {
            <div [formGroupName]="i" class="flex flex-wrap items-end gap-2">
              <span class="w-16 pb-3 text-xs text-gray-500">{{ typeLabel(row.value.type) }}</span>
              <input
                formControlName="description"
                placeholder="Text"
                class="h-10 min-w-48 flex-1 px-2 field"
              />
              <label class="flex flex-col gap-0.5 text-xs text-gray-500"
                >Antal
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  formControlName="quantity"
                  class="h-10 w-16 px-2 text-right field"
              /></label>
              <label class="flex flex-col gap-0.5 text-xs text-gray-500"
                >Pris
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  formControlName="unitPrice"
                  class="h-10 w-24 px-2 text-right field"
              /></label>
              <label class="flex flex-col gap-0.5 text-xs text-gray-500"
                >Min
                <input
                  type="number"
                  min="0"
                  step="5"
                  formControlName="minutes"
                  class="h-10 w-16 px-2 text-right field"
              /></label>
              @if (admin) {
                <button
                  mat-icon-button
                  type="button"
                  (click)="removeRow(i)"
                  aria-label="Ta bort raden"
                >
                  <mat-icon>delete_outline</mat-icon>
                </button>
              }
            </div>
          } @empty {
            <p class="text-sm text-gray-500">Ingen mall.</p>
          }
        </div>
      </section>

      <section class="mt-4 rounded-xl bg-white p-5 shadow-sm" [formGroup]="form">
        <div class="mb-1 flex flex-wrap items-center gap-2">
          <h2 class="flex-1 text-base font-semibold">Pris efter bil</h2>
          @if (admin) {
            <button mat-stroked-button type="button" (click)="addPrice()">
              <mat-icon>add</mat-icon> Prisrad
            </button>
          }
        </div>
        <p class="mb-3 text-sm text-gray-600">
          Olika pris för personbil, större bil, husvagn och så vidare, och efter fälgstorlek. Ett
          pris kan gälla hela bilen eller varje hjul (punktering, husvagn). Raden som passar bilen
          bäst gäller. Utan prisrader gäller priset högst upp för alla bilar. Priser inkl. moms.
        </p>
        <div formArrayName="prices" class="flex flex-col gap-2">
          @for (row of prices.controls; track row; let i = $index) {
            <div [formGroupName]="i" class="flex flex-wrap items-end gap-2">
              <label class="flex flex-col gap-0.5 text-xs text-gray-500"
                >Bil
                <select
                  formControlName="vehicleClass"
                  class="h-10 w-40 px-2 text-sm text-gray-900 field"
                >
                  <option value="">Alla bilar</option>
                  @for (c of classes; track c.value) {
                    <option [value]="c.value">{{ c.label }}</option>
                  }
                </select>
              </label>
              <label class="flex flex-col gap-0.5 text-xs text-gray-500"
                >Fälg från (tum)
                <input
                  type="number"
                  min="8"
                  max="30"
                  step="1"
                  formControlName="rimFrom"
                  class="h-10 w-24 px-2 text-right field"
              /></label>
              <label class="flex flex-col gap-0.5 text-xs text-gray-500"
                >Fälg till (tum)
                <input
                  type="number"
                  min="8"
                  max="30"
                  step="1"
                  formControlName="rimTo"
                  class="h-10 w-24 px-2 text-right field"
              /></label>
              <label class="flex flex-col gap-0.5 text-xs text-gray-500"
                >Priset gäller
                <select formControlName="unit" class="h-10 w-32 px-2 text-sm text-gray-900 field">
                  <option value="vehicle">Hela bilen</option>
                  <option value="wheel">Varje hjul</option>
                </select>
              </label>
              @if (row.value.unit === 'wheel') {
                <label class="flex flex-col gap-0.5 text-xs text-gray-500"
                  >Antal hjul
                  <input
                    type="number"
                    min="1"
                    max="99"
                    step="1"
                    formControlName="quantity"
                    class="h-10 w-20 px-2 text-right field"
                /></label>
              }
              <label class="flex flex-col gap-0.5 text-xs text-gray-500"
                >Pris (kr)
                <input
                  type="number"
                  min="0"
                  step="1"
                  formControlName="price"
                  class="h-10 w-24 px-2 text-right field"
              /></label>
              @if (admin) {
                <button
                  mat-icon-button
                  type="button"
                  (click)="removePrice(i)"
                  aria-label="Ta bort prisraden"
                >
                  <mat-icon>delete_outline</mat-icon>
                </button>
              }
            </div>
          } @empty {
            <p class="text-sm text-gray-500">Inga prisrader: priset högst upp gäller alla bilar.</p>
          }
        </div>
        @if (preview(); as p) {
          <p class="mt-3 text-sm text-gray-700">
            Visas som <b>från {{ p.total | kr }}</b>
            @if (p.unit === 'wheel') {
              ({{ p.quantity }} hjul à {{ p.unitPrice | kr }})
            }
          </p>
        }
      </section>

      <section class="mt-4 rounded-xl bg-white p-5 shadow-sm" [formGroup]="form">
        <h2 class="mb-1 text-base font-semibold">Kampanj</h2>
        <p class="mb-3 text-sm text-gray-600">
          Ett tillfälligt pris eller en procent av. Det gäller överallt i Axle medan kampanjen
          pågår, höjer aldrig ett pris och tar slut av sig själv efter slutdatumet.
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <label class="flex flex-col gap-0.5 text-xs text-gray-500"
            >Typ
            <select
              formControlName="campaignKind"
              class="h-10 w-40 px-2 text-sm text-gray-900 field"
            >
              <option value="none">Ingen kampanj</option>
              <option value="price">Fast pris</option>
              <option value="percent">Procent av</option>
            </select>
          </label>
          @if (form.controls.campaignKind.value === 'price') {
            <label class="flex flex-col gap-0.5 text-xs text-gray-500"
              >Pris (kr)
              <input
                type="number"
                min="0"
                step="1"
                formControlName="campaignPrice"
                class="h-10 w-24 px-2 text-right field"
            /></label>
          }
          @if (form.controls.campaignKind.value === 'percent') {
            <label class="flex flex-col gap-0.5 text-xs text-gray-500"
              >Procent
              <input
                type="number"
                min="1"
                max="99"
                step="1"
                formControlName="campaignPercent"
                class="h-10 w-20 px-2 text-right field"
            /></label>
          }
          @if (form.controls.campaignKind.value !== 'none') {
            <label class="flex flex-col gap-0.5 text-xs text-gray-500"
              >Från och med
              <input type="date" formControlName="campaignFrom" class="h-10 px-2 field"
            /></label>
            <label class="flex flex-col gap-0.5 text-xs text-gray-500"
              >Till och med <input type="date" formControlName="campaignTo" class="h-10 px-2 field"
            /></label>
            <label class="flex min-w-40 flex-1 flex-col gap-0.5 text-xs text-gray-500"
              >Text till kunden
              <input
                formControlName="campaignLabel"
                maxlength="60"
                placeholder="t.ex. Höstkampanj"
                class="h-10 px-2 field"
            /></label>
          }
        </div>
      </section>
    </app-card-page>
  `,
})
export class ServiceTypeCard implements OnInit {
  private readonly auth = inject(Auth);
  /** Bara ägare får ta bort. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly busy = signal(false);
  readonly card = signal<ServiceType | null>(null);

  private readonly fb = inject(FormBuilder);
  readonly typeLabels: Record<ServiceTemplateLine['type'], string> = {
    labour: 'Arbete',
    part: 'Del',
    fee: 'Avgift',
  };
  readonly lines = this.fb.array<FormGroup>([]);
  readonly prices = this.fb.array<FormGroup>([]);
  readonly classes = (Object.entries(VEHICLE_CLASS_LABELS) as [VehicleClass, string][]).map(
    ([value, label]) => ({ value, label }),
  );
  readonly form = this.fb.nonNullable.group(
    {
      name: ['', Validators.required],
      opCode: [''],
      lines: this.lines,
      prices: this.prices,
      minutes: [60, [Validators.required, Validators.min(5)]],
      priceFrom: [null as number | null, Validators.min(0)],
      priceTo: [null as number | null, Validators.min(0)],
      campaignKind: ['none' as 'none' | 'price' | 'percent'],
      campaignPrice: [null as number | null, Validators.min(0)],
      campaignPercent: [null as number | null, [Validators.min(1), Validators.max(99)]],
      campaignFrom: [''],
      campaignTo: [''],
      campaignLabel: [''],
    },
    {
      validators: (g) => {
        const { priceFrom, priceTo } = g.getRawValue();
        return priceFrom != null && priceTo != null && priceFrom > priceTo ? { price: true } : null;
      },
    },
  );

  private newRow(t: Partial<ServiceTemplateLine> & { type: ServiceTemplateLine['type'] }) {
    return this.fb.nonNullable.group({
      type: [t.type],
      code: [t.code ?? ''],
      description: [t.description ?? '', Validators.required],
      articleId: [t.articleId ?? (null as string | null)],
      quantity: [t.quantity ?? 1, [Validators.required, Validators.min(0.01)]],
      unitPrice: [t.unitPrice == null ? null : t.unitPrice / 100, Validators.min(0)],
      minutes: [t.minutes ?? (null as number | null), Validators.min(0)],
    });
  }

  private newPrice(r: Partial<PriceRule> = {}) {
    return this.fb.nonNullable.group({
      vehicleClass: [(r.vehicleClass ?? '') as VehicleClass | ''],
      rimFrom: [r.rimFrom ?? (null as number | null), [Validators.min(8), Validators.max(30)]],
      rimTo: [r.rimTo ?? (null as number | null), [Validators.min(8), Validators.max(30)]],
      unit: [r.unit ?? ('vehicle' as PriceRule['unit'])],
      quantity: [r.quantity ?? 1, [Validators.min(1), Validators.max(99)]],
      price: [
        r.price == null ? (null as number | null) : r.price / 100,
        [Validators.required, Validators.min(0)],
      ],
    });
  }

  addPrice() {
    this.prices.push(this.newPrice());
    this.form.markAsDirty();
  }

  removePrice(i: number) {
    this.prices.removeAt(i);
    this.form.markAsDirty();
  }

  /** Prisraderna som står i formuläret, i öre. */
  private priceRules(): PriceRule[] {
    return (this.prices.getRawValue() as Record<string, unknown>[]).map((r) => ({
      vehicleClass: (r['vehicleClass'] as VehicleClass | '') || null,
      rimFrom: toNum(r['rimFrom']),
      rimTo: toNum(r['rimTo']),
      unit: r['unit'] as PriceRule['unit'],
      quantity: r['unit'] === 'wheel' ? Math.round(Number(r['quantity'])) || 1 : 1,
      price: toOre(r['price']) ?? 0,
    }));
  }

  /** Kampanjen som står i formuläret; null när ingen är vald eller något saknas. */
  private campaignBody(): PriceCampaign | null {
    const v = this.form.getRawValue();
    if (v.campaignKind === 'none') return null;
    const price = v.campaignKind === 'price' ? toOre(v.campaignPrice) : null;
    const percent = v.campaignKind === 'percent' ? toNum(v.campaignPercent) : null;
    if (price === null && percent === null) return null;
    return {
      price,
      percent,
      from: v.campaignFrom || null,
      to: v.campaignTo || null,
      label: v.campaignLabel.trim() || null,
    };
  }

  /** Det "från"-pris kortet ger med prisraderna och kampanjen som står i formuläret. */
  preview(): ServicePrice | null {
    if (!this.prices.length) return null;
    return fromPrice(
      { priceFrom: null, lines: [], prices: this.priceRules(), campaign: this.campaignBody() },
      today(),
    );
  }

  typeLabel(t: unknown) {
    return this.typeLabels[t as ServiceTemplateLine['type']] ?? '';
  }

  addRow(type: ServiceTemplateLine['type']) {
    this.lines.push(this.newRow({ type }));
    this.form.markAsDirty();
  }

  removeRow(i: number) {
    this.lines.removeAt(i);
    this.form.markAsDirty();
  }

  ngOnInit() {
    if (!this.admin) this.form.disable();
    if (this.id) this.load();
  }

  private load() {
    this.api.serviceTypes(true).subscribe((all) => {
      const t = all.find((x) => x.id === this.id);
      if (!t) return void this.router.navigate(['/service-types']);
      this.card.set(t);
      this.lines.clear();
      for (const l of t.lines ?? []) this.lines.push(this.newRow(l));
      this.prices.clear();
      for (const r of t.prices ?? []) this.prices.push(this.newPrice(r));
      if (!this.admin) this.form.disable();
      const c = t.campaign;
      this.form.reset({
        opCode: t.opCode ?? '',
        name: t.name,
        minutes: t.durationMinutes,
        priceFrom: t.priceFrom == null ? null : t.priceFrom / 100,
        priceTo: t.priceTo == null ? null : t.priceTo / 100,
        campaignKind: c ? (c.percent != null ? 'percent' : 'price') : 'none',
        campaignPrice: c?.price == null ? null : c.price / 100,
        campaignPercent: c?.percent ?? null,
        campaignFrom: c?.from ?? '',
        campaignTo: c?.to ?? '',
        campaignLabel: c?.label ?? '',
      });
    });
  }

  /** Sidoguarden (unsavedGuard): finns det osparade ändringar? */
  hasUnsaved() {
    return this.form.dirty;
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;

    const v = this.form.getRawValue();
    const campaign = this.campaignBody();
    if (v.campaignKind !== 'none' && !campaign) {
      this.snack.open('Fyll i kampanjens pris eller procent', undefined, { duration: 4000 });
      return;
    }
    const ore = (kr: number | null) => (kr == null ? null : Math.round(kr * 100));
    const body = {
      prices: this.priceRules(),
      campaign,
      name: v.name,
      opCode: v.opCode || null,
      lines: (v.lines as Record<string, unknown>[]).map((l) => ({
        type: l['type'] as ServiceTemplateLine['type'],
        code: (l['code'] as string) || null,
        description: l['description'] as string,
        articleId: (l['articleId'] as string | null) ?? null,
        quantity: Number(l['quantity']) || 1,
        unitPrice: ore(l['unitPrice'] === '' ? null : (l['unitPrice'] as number | null)),
        minutes:
          l['minutes'] == null || l['minutes'] === '' ? null : Math.round(Number(l['minutes'])),
      })),
      durationMinutes: v.minutes,
      priceFrom: ore(v.priceFrom),
      priceTo: ore(v.priceFrom),
    };
    this.busy.set(true);
    const req = this.id
      ? this.api.updateServiceType(this.id, body)
      : this.api.createServiceType(body);
    req.subscribe({
      next: (t) => {
        this.busy.set(false);
        this.snack.open('Sparat', undefined, { duration: 2000 });
        this.form.markAsPristine();
        if (this.id) this.load();
        else this.router.navigate(['/service-types', t.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    const t = this.card()!;
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Ta bort ${t.name}?`,
          message: 'Används den i bokningar arkiveras den i stället, så historiken ligger kvar.',
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) =>
          ok &&
          this.api.removeServiceType(t.id).subscribe((a) => {
            if (!a.archived) {
              this.form.markAsPristine();
              return void this.router.navigate(['/service-types']);
            }
            this.snack.open('Används i bokningar och arkiverades', undefined, { duration: 3000 });
            this.load();
          }),
      );
  }

  restore() {
    this.api.updateServiceType(this.id!, { active: true }).subscribe(() => this.load());
  }
}
