import { Component, OnInit, inject, signal } from '@angular/core';
import { ensureValid } from '../../../shared/form-guard';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { ServiceType } from '../../../core/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Auth } from '../../../core/auth/auth';

/** Kortet för en åtgärd: namn, standardtid och prisspann som bokningen fylls i med. */
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
              <button mat-button class="!text-red-700" (click)="remove()">Ta bort</button>
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
        class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-3"
      >
        <mat-form-field class="sm:col-span-3">
          <mat-label>Åtgärd</mat-label>
          <input matInput formControlName="name" autocomplete="off" />
          <mat-error>Ange namn</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Standardtid (minuter)</mat-label>
          <input matInput type="number" min="5" step="5" formControlName="minutes" />
          <mat-error>Minst 5 minuter</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Pris från (kr, exkl. moms)</mat-label>
          <input matInput type="number" min="0" formControlName="priceFrom" />
          <mat-hint>{{ form.controls.priceFrom.value | inclVat }}</mat-hint>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Pris till (kr, exkl. moms)</mat-label>
          <input matInput type="number" min="0" formControlName="priceTo" />
          <mat-hint>{{ form.controls.priceTo.value | inclVat }}</mat-hint>
          @if (form.errors?.['price']) {
            <mat-error>Lägre än "från"</mat-error>
          }
        </mat-form-field>
      </form>
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

  readonly form = inject(FormBuilder).nonNullable.group(
    {
      name: ['', Validators.required],
      minutes: [60, [Validators.required, Validators.min(5)]],
      priceFrom: [null as number | null, Validators.min(0)],
      priceTo: [null as number | null, Validators.min(0)],
    },
    {
      validators: (g) => {
        const { priceFrom, priceTo } = g.getRawValue();
        return priceFrom != null && priceTo != null && priceFrom > priceTo ? { price: true } : null;
      },
    },
  );

  ngOnInit() {
    if (!this.admin) this.form.disable();
    if (this.id) this.load();
  }

  private load() {
    this.api.serviceTypes(true).subscribe((all) => {
      const t = all.find((x) => x.id === this.id);
      if (!t) return void this.router.navigate(['/service-types']);
      this.card.set(t);
      this.form.reset({
        name: t.name,
        minutes: t.durationMinutes,
        priceFrom: t.priceFrom == null ? null : t.priceFrom / 100,
        priceTo: t.priceTo == null ? null : t.priceTo / 100,
      });
    });
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;

    const v = this.form.getRawValue();
    const ore = (kr: number | null) => (kr == null ? null : Math.round(kr * 100));
    const body = {
      name: v.name,
      durationMinutes: v.minutes,
      priceFrom: ore(v.priceFrom),
      priceTo: ore(v.priceTo),
    };
    this.busy.set(true);
    const req = this.id
      ? this.api.updateServiceType(this.id, body)
      : this.api.createServiceType(body);
    req.subscribe({
      next: (t) => {
        this.busy.set(false);
        this.snack.open('Sparat', undefined, { duration: 2000 });
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
            if (!a.archived) return void this.router.navigate(['/service-types']);
            this.snack.open('Används i bokningar och arkiverades', undefined, { duration: 3000 });
            this.load();
          }),
      );
  }

  restore() {
    this.api.updateServiceType(this.id!, { active: true }).subscribe(() => this.load());
  }
}
