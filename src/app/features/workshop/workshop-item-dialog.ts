import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { WorkshopApi } from '../../core/api/workshop-api';
import { RESOURCE_KIND_LABELS, Resource, ResourceKind, ServiceType } from '../../core/models';

export type WorkshopItemData =
  { kind: 'resource'; item?: Resource } | { kind: 'service'; item?: ServiceType };

/** Ny eller ändrad mekaniker/plats eller åtgärd. */
@Component({
  selector: 'app-workshop-item-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>
      {{ data.item ? 'Ändra' : 'Ny' }} {{ data.kind === 'resource' ? 'mekaniker/plats' : 'åtgärd' }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="flex flex-col !pt-2">
        <mat-form-field>
          <mat-label>Namn</mat-label>
          <input matInput formControlName="name" autocomplete="off" />
          <mat-error>Ange namn</mat-error>
        </mat-form-field>
        @if (data.kind === 'resource') {
          <mat-form-field>
            <mat-label>Typ</mat-label>
            <mat-select formControlName="kindOf">
              @for (k of kinds; track k[0]) {
                <mat-option [value]="k[0]">{{ k[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <label class="mb-4 flex items-center gap-3 text-sm">
            Färg i kalendern
            <input type="color" formControlName="color" class="h-9 w-14 cursor-pointer rounded" />
          </label>
        } @else {
          <mat-form-field>
            <mat-label>Standardtid (minuter)</mat-label>
            <input matInput type="number" min="5" step="5" formControlName="minutes" />
            <mat-error>Minst 5 minuter</mat-error>
          </mat-form-field>
          <div class="flex gap-3">
            <mat-form-field class="flex-1">
              <mat-label>Pris från (kr)</mat-label>
              <input matInput type="number" min="0" formControlName="priceFrom" />
            </mat-form-field>
            <mat-form-field class="flex-1">
              <mat-label>Pris till (kr)</mat-label>
              <input matInput type="number" min="0" formControlName="priceTo" />
            </mat-form-field>
          </div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button mat-flat-button color="primary" [disabled]="form.invalid || busy()">Spara</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class WorkshopItemDialog {
  private readonly api = inject(WorkshopApi);
  private readonly ref = inject<MatDialogRef<WorkshopItemDialog, boolean>>(MatDialogRef);

  readonly busy = signal(false);
  readonly kinds = Object.entries(RESOURCE_KIND_LABELS);
  readonly form;

  constructor(@Inject(MAT_DIALOG_DATA) public data: WorkshopItemData) {
    const r = data.kind === 'resource' ? data.item : undefined;
    const t = data.kind === 'service' ? data.item : undefined;
    const kr = (ore: number | null | undefined) => (ore == null ? null : ore / 100);
    this.form = inject(FormBuilder).nonNullable.group({
      name: [r?.name ?? t?.name ?? '', Validators.required],
      kindOf: [(r?.kind ?? 'mechanic') as ResourceKind],
      color: [r?.color ?? '#1976d2'],
      minutes: [t?.durationMinutes ?? 60, [Validators.required, Validators.min(5)]],
      priceFrom: [kr(t?.priceFrom) as number | null],
      priceTo: [kr(t?.priceTo) as number | null],
    });
  }

  save() {
    const v = this.form.getRawValue();
    const ore = (kr: number | null) => (kr == null ? null : Math.round(kr * 100));
    this.busy.set(true);
    const req: Observable<unknown> =
      this.data.kind === 'resource'
        ? this.data.item
          ? this.api.updateResource(this.data.item.id, {
              name: v.name,
              kind: v.kindOf,
              color: v.color,
            })
          : this.api.createResource({ name: v.name, kind: v.kindOf, color: v.color })
        : this.data.item
          ? this.api.updateServiceType(this.data.item.id, this.service(v, ore))
          : this.api.createServiceType(this.service(v, ore));
    req.subscribe({ next: () => this.ref.close(true), error: () => this.busy.set(false) });
  }

  private service(
    v: { name: string; minutes: number; priceFrom: number | null; priceTo: number | null },
    ore: (kr: number | null) => number | null,
  ) {
    return {
      name: v.name,
      durationMinutes: v.minutes,
      priceFrom: ore(v.priceFrom),
      priceTo: ore(v.priceTo),
    };
  }
}
