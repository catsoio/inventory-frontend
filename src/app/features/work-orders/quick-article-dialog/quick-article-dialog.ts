import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { InventoryApi } from '../../../core/api/inventory-api';
import { Article } from '../../../core/models';
import { ensureValid } from '../../../shared/form-guard';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Snabbt skapa en lagerartikel (kategori Övrigt) från en arbetsorder, när delen inte finns i
 * lagret än. Däck och fälgar läggs in på Artiklar med full spec.
 */
@Component({
  selector: 'app-quick-article-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Ny artikel</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="!flex flex-col !pt-2">
        <p class="mb-3 text-sm text-gray-600">
          Delen finns inte i lagret. Lägg in den här så kan den kopplas till ordern. Däck och fälgar
          läggs in under Artiklar.
        </p>
        <mat-form-field>
          <mat-label>Märke</mat-label>
          <input matInput formControlName="brand" />
          <mat-error>Obligatoriskt</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Benämning</mat-label>
          <input matInput formControlName="model" />
          <mat-error>Obligatoriskt</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Försäljningspris (kr, exkl. moms)</mat-label>
          <input matInput type="number" inputmode="decimal" min="0" formControlName="sellPrice" />
          <mat-error>Ange pris (0 eller mer)</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Lagersaldo (st)</mat-label>
          <input matInput type="number" min="0" step="1" formControlName="initialQuantity" />
          <mat-hint>0 om delen ska beställas</mat-hint>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button mat-flat-button color="primary" [disabled]="busy()">Skapa</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class QuickArticleDialog {
  private readonly api = inject(InventoryApi);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject<MatDialogRef<QuickArticleDialog, Article>>(MatDialogRef);
  readonly busy = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    brand: ['', Validators.required],
    model: ['', Validators.required],
    sellPrice: [0, [Validators.required, Validators.min(0)]],
    initialQuantity: [0, [Validators.min(0)]],
  });

  constructor(@Inject(MAT_DIALOG_DATA) data: { name?: string } | null) {
    if (data?.name) this.form.patchValue({ model: data.name });
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.api
      .createArticle({
        category: 'other',
        brand: v.brand,
        model: v.model,
        sellPrice: Math.round(v.sellPrice * 100),
        initialQuantity: Math.floor(v.initialQuantity) || undefined,
      })
      .subscribe({
        next: (a) => this.ref.close(a),
        error: () => this.busy.set(false),
      });
  }
}
