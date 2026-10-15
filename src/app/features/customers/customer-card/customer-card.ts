import { Component, OnInit, inject, signal } from '@angular/core';
import { ensureValid } from '../../../shared/form-guard';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { WorkshopApi } from '../../../core/api/workshop-api';
import {
  BOOKING_STATUS_LABELS,
  CUSTOMER_TYPE_LABELS,
  WORK_ORDER_STATUS_LABELS,
  CustomerDetail,
  CustomerType,
} from '../../../core/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Auth } from '../../../core/auth/auth';

/** Kundens kort: fälten överst, kundens bilar och senaste bokningar under. */
@Component({
  selector: 'app-customer-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/customers"
      listLabel="Kunder"
      newTitle="Ny kund"
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
        <mat-button-toggle-group
          class="mb-4 self-start sm:col-span-2"
          hideSingleSelectionIndicator
          formControlName="type"
        >
          @for (t of types; track t[0]) {
            <mat-button-toggle [value]="t[0]">{{ t[1] }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
        <mat-form-field class="sm:col-span-2">
          <mat-label>{{
            form.controls.type.value === 'company' ? 'Företagsnamn' : 'Namn'
          }}</mat-label>
          <input matInput formControlName="name" autocomplete="off" />
          <mat-error>Ange namn</mat-error>
        </mat-form-field>
        @if (form.controls.type.value === 'company') {
          <mat-form-field class="sm:col-span-2">
            <mat-label>Organisationsnummer</mat-label>
            <input matInput formControlName="orgNo" />
          </mat-form-field>
        }
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
            <h2 class="flex-1 text-lg font-semibold">Bilar ({{ activeCars() }})</h2>
            @if (c.active) {
              <a mat-stroked-button routerLink="/vehicles/new" [queryParams]="{ customerId: c.id }">
                <mat-icon>add</mat-icon> Ny bil
              </a>
            }
          </div>
          @for (v of c.vehicles; track v.id) {
            <a
              [routerLink]="['/vehicles', v.id]"
              class="flex items-center gap-3 border-t border-gray-100 py-3 hover:bg-gray-50"
              [class.opacity-50]="!v.active"
            >
              <app-reg-plate [value]="v.regNo" size="sm" />
              <span class="text-xs text-gray-500">{{ v.code }}</span>
              <span class="flex-1">{{ label(v) || '–' }}</span>
              @if (v.notes) {
                <mat-icon class="text-amber-600" matTooltip="{{ v.notes }}">warning</mat-icon>
              }
              @if (!v.active) {
                <span class="text-xs text-gray-500">arkiverad</span>
              }
            </a>
          } @empty {
            <p class="text-sm text-gray-500">Inga bilar än.</p>
          }
        </section>

        @if (workOrdersOn) {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-2 text-lg font-semibold">Arbetsorder</h2>
            @for (o of c.workOrders; track o.id) {
              <a
                [routerLink]="['/workorders', o.id]"
                class="flex flex-wrap items-center gap-x-4 border-t border-gray-100 py-2 text-sm hover:bg-gray-50"
              >
                <span class="text-xs text-gray-500">{{ o.code }}</span>
                <span class="tabular-nums">{{ o.receivedAt | date: 'yyyy-MM-dd' }}</span>
                <span>{{ o.regNo }}</span>
                <span class="flex-1"></span>
                <app-pill
                  [tone]="
                    o.status === 'done' ? 'green' : o.status === 'cancelled' ? 'gray' : 'blue'
                  "
                  >{{ orderStatuses[o.status] }}</app-pill
                >
              </a>
            } @empty {
              <p class="text-sm text-gray-500">Inga arbetsorder än.</p>
            }
          </section>
        }

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="mb-2 flex items-center">
            <h2 class="flex-1 text-lg font-semibold">Försäljningar ({{ c.saleCount }})</h2>
            @if (c.active) {
              <a mat-stroked-button routerLink="/sales/new" [queryParams]="{ customerId: c.id }">
                <mat-icon>add</mat-icon> Ny försäljning
              </a>
            }
          </div>
          <app-trade-history
            [rows]="c.sales"
            kind="sales"
            empty="Inga försäljningar till den här kunden än."
          />
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-lg font-semibold">Senaste bokningar</h2>
          @for (b of c.bookings; track b.id) {
            <div class="flex flex-wrap items-center gap-x-4 border-t border-gray-100 py-2 text-sm">
              <span class="text-xs text-gray-500">{{ b.code }}</span>
              <span class="tabular-nums">{{ b.start | date: 'yyyy-MM-dd HH:mm' }}</span>
              <span class="font-medium">{{ b.title }}</span>
              <span class="text-gray-500">
                {{ b.regNo }}{{ b.resourceName ? ' · ' + b.resourceName : '' }}
              </span>
              <span class="flex-1"></span>
              <app-pill
                [tone]="b.status === 'done' ? 'green' : b.status === 'booked' ? 'blue' : 'gray'"
                >{{ statuses[b.status] }}</app-pill
              >
            </div>
          } @empty {
            <p class="text-sm text-gray-500">Inga bokningar än.</p>
          }
        </section>
      }
    </app-card-page>
  `,
})
export class CustomerCard implements OnInit {
  private readonly auth = inject(Auth);
  /** Bara ägare får ta bort. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly types = Object.entries(CUSTOMER_TYPE_LABELS);
  readonly statuses = BOOKING_STATUS_LABELS;
  readonly orderStatuses = WORK_ORDER_STATUS_LABELS;
  readonly workOrdersOn = environment.workOrders;
  readonly busy = signal(false);
  readonly card = signal<CustomerDetail | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    type: ['private' as CustomerType],
    name: ['', Validators.required],
    orgNo: [''],
    phone: [''],
    email: ['', Validators.email],
    notes: [''],
  });

  ngOnInit() {
    if (this.id) this.load();
  }

  activeCars() {
    return this.card()?.vehicles.filter((v) => v.active).length ?? 0;
  }

  label(v: { make: string | null; model: string | null; year: number | null }) {
    return [v.make, v.model, v.year].filter(Boolean).join(' ');
  }

  private load() {
    this.api.customer(this.id!).subscribe((c) => {
      this.card.set(c);
      this.form.reset({
        type: c.type,
        name: c.name,
        orgNo: c.orgNo ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        notes: c.notes ?? '',
      });
    });
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;

    const v = this.form.getRawValue();
    const body = {
      type: v.type,
      name: v.name,
      orgNo: v.type === 'company' ? v.orgNo || null : null,
      phone: v.phone || null,
      email: v.email || null,
      notes: v.notes || null,
    };
    this.busy.set(true);
    const req = this.id ? this.api.updateCustomer(this.id, body) : this.api.createCustomer(body);
    req.subscribe({
      next: (c) => {
        this.busy.set(false);
        this.snack.open('Sparat', undefined, { duration: 2000 });
        if (this.id) this.load();
        else this.router.navigate(['/customers', c.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    const c = this.card()!;
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Ta bort ${c.name}?`,
          message:
            'Har kunden bilar eller bokningar arkiveras den i stället, så historiken ligger kvar.',
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) =>
          ok &&
          this.api.removeCustomer(c.id).subscribe((r) => {
            if (!r.archived) return void this.router.navigate(['/customers']);
            this.snack.open('Kunden har historik och arkiverades', undefined, { duration: 3000 });
            this.load();
          }),
      );
  }

  restore() {
    this.api.updateCustomer(this.id!, { active: true }).subscribe(() => this.load());
  }
}
