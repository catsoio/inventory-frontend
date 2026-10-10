import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { InventoryApi } from '../../../core/api/inventory-api';
import { Article, StockAction } from '../../../core/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';

export interface StockActionData {
  article: Article;
  action: StockAction;
}

const TITLES: Record<StockAction, string> = {
  receive: 'Inköp',
  sell: 'Sälj',
  return: 'Retur',
  'write-off': 'Kassera',
  adjust: 'Räkna om',
};

const int = [Validators.required, Validators.pattern(/^\d+$/)];

@Component({
  selector: 'app-stock-action-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>{{ title }} – {{ data.article.label }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-dialog-content class="flex flex-col gap-1 !pt-2">
        @if (data.action === 'adjust') {
          <p class="text-sm text-gray-600">Nuvarande saldo: {{ data.article.quantity }} st</p>
          <mat-form-field
            ><mat-label>Räknat antal</mat-label>
            <input
              matInput
              type="number"
              inputmode="numeric"
              step="1"
              min="0"
              formControlName="countedQuantity"
              (focus)="$any($event.target).select()"
            />
            <mat-error>Ange ett heltal (0 eller mer)</mat-error></mat-form-field
          >
        } @else {
          <mat-form-field
            ><mat-label>Antal</mat-label>
            <input
              matInput
              type="number"
              inputmode="numeric"
              step="1"
              min="1"
              formControlName="quantity"
              (focus)="$any($event.target).select()"
            />
            <mat-error
              >Ange ett heltal på minst 1 (högst {{ data.article.quantity }} vid
              sälj/kassera)</mat-error
            ></mat-form-field
          >
        }
        @if (data.action === 'receive') {
          <mat-form-field
            ><mat-label>Inköpspris per styck (kr)</mat-label>
            <input
              matInput
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0"
              formControlName="unitCost"
              (focus)="$any($event.target).select()"
            />
            <mat-error>Ange pris</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Leverantör</mat-label><input matInput formControlName="supplier"
          /></mat-form-field>
        }
        @if (data.action === 'sell') {
          <mat-form-field
            ><mat-label>Pris per styck (kr)</mat-label>
            <input
              matInput
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0"
              formControlName="unitPrice"
              (focus)="$any($event.target).select()"
          /></mat-form-field>
        }
        <mat-form-field
          ><mat-label>Referens (t.ex. ordernr)</mat-label
          ><input matInput formControlName="reference"
        /></mat-form-field>
        <mat-form-field
          ><mat-label>Anteckning</mat-label><input matInput formControlName="note"
        /></mat-form-field>
        @if (total() !== null) {
          <div class="text-right text-lg font-semibold">Summa: {{ total() | kr }}</div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button
          mat-flat-button
          [color]="data.action === 'write-off' ? 'warn' : 'primary'"
          [disabled]="form.invalid || busy()"
        >
          {{ title }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class StockActionDialog {
  private readonly api = inject(InventoryApi);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject<MatDialogRef<StockActionDialog, Article>>(MatDialogRef);

  readonly busy = signal(false);

  total(): number | null {
    const v = this.form.getRawValue();
    const unit =
      this.data.action === 'sell' ? v.unitPrice : this.data.action === 'receive' ? v.unitCost : '';
    const q = Number(v.quantity);
    return unit === '' || !q ? null : Math.round(q * Number(unit) * 100);
  }
  readonly title: string;
  readonly form;

  constructor(@Inject(MAT_DIALOG_DATA) public data: StockActionData) {
    this.title = TITLES[data.action];
    const fb = inject(FormBuilder).nonNullable;
    const art = data.article;
    const outgoing = data.action === 'sell' || data.action === 'write-off';
    const kr = (ore: number) => (ore > 0 ? String(ore / 100) : '');
    this.form = fb.group({
      quantity: [
        '1',
        [...int, Validators.min(1), ...(outgoing ? [Validators.max(art.quantity)] : [])],
      ],
      countedQuantity: [String(art.quantity), int],
      unitCost: [kr(art.averageCost), [Validators.required, Validators.min(0)]],
      unitPrice: [kr(art.sellPrice), [Validators.min(0)]],
      supplier: [art.supplier ?? ''],
      reference: [''],
      note: [''],
    });
    const c = this.form.controls;
    const a = data.action;
    if (a === 'adjust') c.quantity.disable();
    else c.countedQuantity.disable();
    if (a !== 'receive') c.unitCost.disable();
    if (a !== 'sell') c.unitPrice.disable();
    if (a !== 'receive') c.supplier.disable();
  }

  submit() {
    const v = this.form.getRawValue();
    const ore = (kr: string) => Math.round(Number(kr) * 100);
    const common = { reference: v.reference || undefined, note: v.note || undefined };
    const q = Number(v.quantity);
    const bodies: Record<StockAction, object> = {
      receive: {
        quantity: q,
        unitCost: ore(v.unitCost),
        supplier: v.supplier || undefined,
        ...common,
      },
      sell: {
        quantity: q,
        unitPrice: v.unitPrice === '' ? undefined : ore(v.unitPrice),
        ...common,
      },
      return: { quantity: q, ...common },
      'write-off': { quantity: q, ...common },
      adjust: { countedQuantity: Number(v.countedQuantity), ...common },
    };
    const run = () => {
      this.busy.set(true);
      this.api
        .stockAction(this.data.article.id, this.data.action, bodies[this.data.action])
        .subscribe({
          next: (a) => this.ref.close(a),
          error: () => this.busy.set(false),
        });
    };
    if (this.data.action !== 'write-off') return run();
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Kassera artikel?',
          message: `${q} st ${this.data.article.label} tas bort ur lagret som kasserade. Detta går inte att ångra.`,
          confirmText: 'Kassera',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe((ok) => ok && run());
  }
}
