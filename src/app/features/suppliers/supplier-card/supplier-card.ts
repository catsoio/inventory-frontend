import { Component, OnInit, inject, signal } from '@angular/core';
import { ensureValid } from '../../../shared/form-guard';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { SupplierDetail } from '../../../core/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Auth } from '../../../core/auth/auth';

/** Leverantörens kort: fälten överst och senaste inköp under. */
@Component({
  selector: 'app-supplier-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/suppliers"
      listLabel="Leverantörer"
      newTitle="Ny leverantör"
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
            <button mat-stroked-button (click)="restore()">Återställ</button>
          }
        }
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="busy()"
        >
          Spara
        </button>
      </div>

      <form
        [formGroup]="form"
        class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-2"
      >
        <mat-form-field class="sm:col-span-2">
          <mat-label>Företagsnamn</mat-label>
          <input matInput formControlName="name" autocomplete="off" />
          <mat-error>Ange namn</mat-error>
        </mat-form-field>
        <mat-form-field class="sm:col-span-2">
          <mat-label>Organisationsnummer</mat-label>
          <input matInput formControlName="orgNo" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Telefon</mat-label>
          <input matInput type="tel" formControlName="phone" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>E-post</mat-label>
          <input matInput type="email" formControlName="email" />
          <mat-error>Ogiltig e-postadress</mat-error>
        </mat-form-field>
        <mat-form-field class="sm:col-span-2">
          <mat-label>Anmärkning</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
      </form>

      @if (card(); as c) {
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="mb-2 flex items-center">
            <h2 class="flex-1 text-lg font-semibold">Inköp ({{ c.purchaseCount }})</h2>
            @if (c.active) {
              <a
                mat-stroked-button
                routerLink="/purchases/new"
                [queryParams]="{ supplierId: c.id }"
              >
                <mat-icon>add</mat-icon> Nytt inköp
              </a>
            }
          </div>
          <app-trade-history
            [rows]="c.purchases"
            kind="purchases"
            empty="Inga inköp från den här leverantören än."
          />
        </section>
      }
    </app-card-page>
  `,
})
export class SupplierCard implements OnInit {
  private readonly auth = inject(Auth);
  /** Bara ägare får ta bort. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly busy = signal(false);
  readonly card = signal<SupplierDetail | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    orgNo: [''],
    phone: [''],
    email: ['', Validators.email],
    notes: [''],
  });

  ngOnInit() {
    if (this.id) this.load();
  }

  private load() {
    this.api.supplier(this.id!).subscribe((s) => {
      this.card.set(s);
      this.form.reset({
        name: s.name,
        orgNo: s.orgNo ?? '',
        phone: s.phone ?? '',
        email: s.email ?? '',
        notes: s.notes ?? '',
      });
    });
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;

    const v = this.form.getRawValue();
    const body = {
      name: v.name,
      orgNo: v.orgNo || null,
      phone: v.phone || null,
      email: v.email || null,
      notes: v.notes || null,
    };
    this.busy.set(true);
    const req = this.id ? this.api.updateSupplier(this.id, body) : this.api.createSupplier(body);
    req.subscribe({
      next: (s) => {
        this.busy.set(false);
        this.snack.open('Sparat', undefined, { duration: 2000 });
        if (this.id) this.load();
        else this.router.navigate(['/suppliers', s.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    const s = this.card()!;
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Ta bort ${s.name}?`,
          message: 'Har leverantören inköp arkiveras den i stället, så historiken ligger kvar.',
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) =>
          ok &&
          this.api.removeSupplier(s.id).subscribe((r) => {
            if (!r.archived) return void this.router.navigate(['/suppliers']);
            this.snack.open('Leverantören har historik och arkiverades', undefined, {
              duration: 3000,
            });
            this.load();
          }),
      );
  }

  restore() {
    this.api.updateSupplier(this.id!, { active: true }).subscribe(() => this.load());
  }
}
