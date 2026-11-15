import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import {
  TOW_KIND_LABELS,
  TOW_STATUS_LABELS,
  TowApi,
  TowJob,
  TowKind,
  TowStatus,
} from '../../core/api/tow-api';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { ensureValid } from '../../shared/form-guard';

/** Kortet för ett bärgningsuppdrag: vem som ringde, bilen, var den står och vart den ska. */
@Component({
  selector: 'app-tow-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/towing"
      listLabel="Bärgning"
      newTitle="Nytt uppdrag"
      [title]="card()?.customerName ?? ''"
      [code]="card()?.code ?? null"
    >
      <div actions class="flex items-center gap-2">
        @if (card() && admin) {
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
        <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">Spara</button>
      </div>

      <form
        [formGroup]="form"
        class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-2"
      >
        <mat-form-field>
          <mat-label>Typ av uppdrag</mat-label>
          <mat-select formControlName="kind">
            @for (k of kinds; track k[0]) {
              <mat-option [value]="k[0]">{{ k[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (card()) {
          <mat-form-field>
            <mat-label>Status</mat-label>
            <mat-select formControlName="status">
              @for (s of statuses; track s[0]) {
                <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>Vem ringde</mat-label>
          <input matInput formControlName="customerName" autocomplete="off" />
          <mat-error>Ange vem som ringde</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Telefon</mat-label>
          <input matInput type="tel" formControlName="phone" autocomplete="off" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Regnummer</mat-label>
          <input matInput formControlName="regNo" autocomplete="off" class="uppercase" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Bil (märke och modell)</mat-label>
          <input matInput formControlName="vehicle" autocomplete="off" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Var står bilen</mat-label>
          <input matInput formControlName="pickupAddress" autocomplete="off" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Vart ska den</mat-label>
          <input matInput formControlName="destination" autocomplete="off" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-2">
          <mat-label>Anteckning</mat-label>
          <textarea matInput rows="3" formControlName="note"></textarea>
        </mat-form-field>
      </form>
    </app-card-page>
  `,
})
export class TowCard implements OnInit {
  private readonly auth = inject(Auth);
  /** Bara ägare tar bort ett uppdrag. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(TowApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly kinds = Object.entries(TOW_KIND_LABELS);
  readonly statuses = Object.entries(TOW_STATUS_LABELS);
  readonly busy = signal(false);
  readonly card = signal<TowJob | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    kind: ['tow' as TowKind],
    status: ['new' as TowStatus],
    customerName: ['', Validators.required],
    phone: [''],
    regNo: [''],
    vehicle: [''],
    pickupAddress: [''],
    destination: [''],
    note: [''],
  });

  ngOnInit() {
    if (this.id) this.load();
  }

  private load() {
    this.api.get(this.id!).subscribe({
      next: (j) => {
        this.card.set(j);
        this.form.reset({
          kind: j.kind,
          status: j.status,
          customerName: j.customerName,
          phone: j.phone ?? '',
          regNo: j.regNo ?? '',
          vehicle: j.vehicle ?? '',
          pickupAddress: j.pickupAddress ?? '',
          destination: j.destination ?? '',
          note: j.note ?? '',
        });
      },
      error: () => void this.router.navigate(['/towing']),
    });
  }

  /** Sidoguarden (unsavedGuard): finns det osparade ändringar? */
  hasUnsaved() {
    return this.form.dirty;
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;
    const { status, ...rest } = this.form.getRawValue();
    this.busy.set(true);
    const req = this.id ? this.api.update(this.id, { ...rest, status }) : this.api.create(rest);
    req.subscribe({
      next: (j) => {
        this.busy.set(false);
        this.snack.open('Sparat', undefined, { duration: 2000 });
        this.form.markAsPristine();
        if (this.id) this.load();
        else this.router.navigate(['/towing', j.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    const j = this.card()!;
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Ta bort ${j.code}?`,
          message:
            'Uppdraget försvinner helt. Ett uppdrag som blivit fel kan i stället sättas till Avbruten.',
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) =>
          ok &&
          this.api.remove(j.id).subscribe(() => {
            this.form.markAsPristine();
            this.router.navigate(['/towing']);
          }),
      );
  }
}
