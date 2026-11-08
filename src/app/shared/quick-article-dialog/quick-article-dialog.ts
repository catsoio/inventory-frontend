import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AxleApi } from '../../core/api/axle-api';
import { Article } from '../../core/models';
import { Settings } from '../../core/settings';
import { ensureValid } from '../form-guard';

/**
 * Snabbt skapa en artikel (kategori Övrigt) när delen inte finns i registret: från en arbetsorder
 * eller ett inköp. Standard är en enstaka del som köps in till ett jobb, utan påminnelse. Däck och
 * fälgar läggs in på Artiklar med full spec.
 */
@Component({
  selector: 'app-quick-article-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Ny artikel</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="!flex flex-col !pt-2">
        <p class="mb-3 text-sm text-gray-600">
          Delen finns inte i registret. Lägg in den här så kan den
          {{ purchase ? 'köpas in' : 'kopplas till ordern' }}. Däck och fälgar läggs in under
          Artiklar.
        </p>
        <mat-form-field>
          <mat-label>Benämning</mat-label>
          <input matInput formControlName="model" />
          <mat-error>Obligatoriskt</mat-error>
        </mat-form-field>
        <div class="grid gap-x-3 sm:grid-cols-2">
          <mat-form-field>
            <mat-label>Märke (valfritt)</mat-label>
            <input matInput formControlName="brand" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>Artikelnummer (valfritt)</mat-label>
            <input matInput formControlName="sku" />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>Försäljningspris (kr, inkl. moms)</mat-label>
          <input matInput type="number" inputmode="decimal" min="0" formControlName="sellPrice" />
          <mat-error>Ange pris (0 eller mer)</mat-error>
        </mat-form-field>
        @if (!purchase) {
          <mat-form-field>
            <mat-label>Lagersaldo (st)</mat-label>
            <input matInput type="number" min="0" step="1" formControlName="initialQuantity" />
            <mat-hint>0 om delen ska beställas</mat-hint>
          </mat-form-field>
        }
        <mat-slide-toggle class="mt-3" formControlName="stocked"
          >Lagerför den här artikeln</mat-slide-toggle
        >
        <span class="mt-1 mb-2 text-sm text-gray-600">
          @if (form.controls.stocked.value) {
            Du har den hemma och köper in mer när den tar slut.
          } @else {
            Enstaka del som köps in till ett jobb: ingen påminnelse, och den försvinner ur listan
            när den är förbrukad.
          }
        </span>
        @if (form.controls.stocked.value) {
          <mat-form-field>
            <mat-label>Påminn när det är kvar (st)</mat-label>
            <input matInput type="number" min="0" step="1" formControlName="reorderLevel" />
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button mat-flat-button color="primary" [disabled]="busy()">Skapa</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class QuickArticleDialog {
  private readonly api = inject(AxleApi);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject<MatDialogRef<QuickArticleDialog, Article>>(MatDialogRef);
  private readonly settings = inject(Settings);
  readonly busy = signal(false);
  /** Öppnad från ett inköp: antalet kommer av inköpet, så inget saldo att skriva här. */
  readonly purchase: boolean;
  readonly form = inject(FormBuilder).nonNullable.group({
    brand: [''],
    model: ['', Validators.required],
    sku: [''],
    sellPrice: [0, [Validators.required, Validators.min(0)]],
    initialQuantity: [0, [Validators.min(0)]],
    stocked: [false],
    reorderLevel: [this.settings.value().defaultReorderLevel, [Validators.min(0)]],
  });

  constructor(@Inject(MAT_DIALOG_DATA) data: { name?: string; purchase?: boolean } | null) {
    this.purchase = !!data?.purchase;
    if (data?.name) this.form.patchValue({ model: data.name });
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.api
      .createArticle({
        category: 'other',
        brand: v.brand.trim(),
        model: v.model.trim(),
        sku: v.sku.trim() || undefined,
        sellPrice: Math.round(v.sellPrice * 100),
        stocked: v.stocked,
        reorderLevel: v.stocked ? Math.floor(v.reorderLevel) || 0 : 0,
        initialQuantity: this.purchase ? undefined : Math.floor(v.initialQuantity) || undefined,
      })
      .subscribe({
        next: (a) => this.ref.close(a),
        error: () => this.busy.set(false),
      });
  }
}
