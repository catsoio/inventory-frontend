import { Component, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { InventoryApi } from '../../core/api/inventory-api';
import { MOVEMENT_LABELS, MovementType, Report } from '../../core/models';

const iso = (d: Date) => d.toISOString().slice(0, 10);

@Component({
  selector: 'app-reports',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <h1 class="mb-4 shrink-0 text-2xl font-semibold">Logg och rapport</h1>
    <form [formGroup]="form" class="mb-4 flex shrink-0 flex-wrap items-center gap-3">
      <mat-form-field
        ><mat-label>Från</mat-label><input matInput type="date" formControlName="from"
      /></mat-form-field>
      <mat-form-field
        ><mat-label>Till</mat-label><input matInput type="date" formControlName="to"
      /></mat-form-field>
      <mat-form-field
        ><mat-label>Typ</mat-label>
        <mat-select formControlName="type">
          <mat-option [value]="null">Alla</mat-option>
          @for (t of types; track t[0]) {
            <mat-option [value]="t[0]">{{ t[1] }}</mat-option>
          }
        </mat-select></mat-form-field
      >
      <button mat-flat-button color="primary" type="button" (click)="apply()">Visa</button>
    </form>

    @if (report(); as r) {
      <div class="mb-4 grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        @for (
          k of [
            ['Inköp', r.purchasedUnits + ' st · ' + (r.purchasedCost | kr)],
            ['Försäljning', r.soldUnits + ' st · ' + (r.soldRevenue | kr)],
            ['Kostnad såld vara', r.soldCost | kr],
            ['Bruttovinst', r.grossProfit | kr],
            ['Kasserat', r.writtenOffUnits + ' st · ' + (r.writtenOffCost | kr)],
          ];
          track k[0]
        ) {
          <mat-card class="p-4"
            ><div class="text-sm text-gray-500">{{ k[0] }}</div>
            <div class="text-lg font-semibold">{{ k[1] }}</div></mat-card
          >
        }
      </div>
    }
    <app-movement-list class="min-h-64 flex-1" [type]="applied().type" [from]="applied().from" [to]="applied().to" />
  `,
})
export class Reports {
  private readonly api = inject(InventoryApi);
  readonly types = Object.entries(MOVEMENT_LABELS);
  readonly form = inject(FormBuilder).group({
    from: [iso(new Date(Date.now() - 30 * 864e5))],
    to: [iso(new Date())],
    type: [null as MovementType | null],
  });
  readonly report = signal<Report | null>(null);
  readonly applied = signal<{ type?: MovementType; from?: string; to?: string }>({});

  constructor() {
    this.apply();
  }

  apply() {
    const { from, to, type } = this.form.getRawValue();
    this.applied.set({ type: type ?? undefined, from: from || undefined, to: to || undefined });
    this.api.report(from || undefined, to || undefined).subscribe((r) => this.report.set(r));
  }
}
