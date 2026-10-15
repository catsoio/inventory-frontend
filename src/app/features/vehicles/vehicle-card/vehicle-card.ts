import { Component, OnInit, inject, signal } from '@angular/core';
import { map, of, switchMap, tap } from 'rxjs';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkshopApi } from '../../../core/api/workshop-api';
import {
  BOOKING_STATUS_LABELS,
  VehicleDetail,
  WORK_ORDER_STATUS_LABELS,
} from '../../../core/models';
import { environment } from '../../../../environments/environment';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { VehicleAutofill } from '../../../shared/vehicle-autofill';
import { Auth } from '../../../core/auth/auth';
import { ensureValid } from '../../../shared/form-guard';
import { PENDING_CUSTOMER } from '../../../shared/customer-select/customer-select';

/** Bilens kort: ägare, uppgifter och bestående anmärkningar, med bilens bokningar under. */
@Component({
  selector: 'app-vehicle-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/vehicles"
      listLabel="Bilar"
      newTitle="Ny bil"
      [title]="card()?.regNo ?? ''"
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
        class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-6"
      >
        <app-customer-select class="sm:col-span-4" [allowNew]="true" label="Ägare" formControlName="customerId" />
        <mat-form-field class="sm:col-span-2">
          <mat-label>Registreringsnummer</mat-label>
          <app-sv-flag matPrefix class="mr-2" />
          <input matInput formControlName="regNo" appRegNo class="uppercase" (blur)="lookup()" />
          <mat-error>Ange regnr</mat-error>
        </mat-form-field>
        @if (looking()) {
          <p class="mb-3 text-sm text-gray-500 sm:col-span-6">Hämtar bilinfo…</p>
        }
        @if (note(); as n) {
          <p
            class="mb-3 rounded-lg px-3 py-2 text-sm sm:col-span-6"
            [class]="n.warn ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-900'"
          >
            {{ n.text }}
            @if (n.link) {
              <a class="font-medium underline" [routerLink]="n.link">Öppna bilen</a>
            }
            @if (locked()) {
              <button type="button" class="ml-2 font-medium underline" (click)="unlock()">
                Ändra manuellt
              </button>
            }
          </p>
        }
        <mat-form-field class="sm:col-span-2">
          <mat-label>Märke</mat-label>
          <input matInput formControlName="make" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-2">
          <mat-label>Modell</mat-label>
          <input matInput formControlName="model" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-2">
          <mat-label>Årsmodell</mat-label>
          <input matInput type="number" inputmode="numeric" formControlName="year" />
          <mat-error>Ogiltigt år</mat-error>
        </mat-form-field>
        <mat-form-field class="sm:col-span-6">
          <mat-label>Chassinummer (VIN)</mat-label>
          <input matInput formControlName="vin" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-6">
          <mat-label>Anmärkning på bilen</mat-label>
          <textarea
            matInput
            rows="2"
            formControlName="notes"
            placeholder="t.ex. Dragkrok helt rostad. Visas för mekanikern vid varje besök."
          ></textarea>
        </mat-form-field>
      </form>

      @if (card(); as c) {
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
                <span class="text-gray-500">{{ o.resourceName }}</span>
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
            <h2 class="flex-1 text-lg font-semibold">Försäljningar</h2>
            @if (c.active) {
              <a
                mat-stroked-button
                routerLink="/sales/new"
                [queryParams]="{ customerId: c.customerId, vehicleId: c.id }"
              >
                <mat-icon>add</mat-icon> Ny försäljning
              </a>
            }
          </div>
          <app-trade-history
            [rows]="c.sales"
            kind="sales"
            empty="Inget sålt till den här bilen än."
          />
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-lg font-semibold">Bokningar</h2>
          @for (b of c.bookings; track b.id) {
            <div class="flex flex-wrap items-center gap-x-4 border-t border-gray-100 py-2 text-sm">
              <span class="text-xs text-gray-500">{{ b.code }}</span>
              <span class="tabular-nums">{{ b.start | date: 'yyyy-MM-dd HH:mm' }}</span>
              <span class="font-medium">{{ b.title }}</span>
              <span class="text-gray-500">{{ b.resourceName }}</span>
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
export class VehicleCard implements OnInit {
  private readonly auth = inject(Auth);
  /** Bara ägare får ta bort. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(WorkshopApi);
  private readonly autofill = inject(VehicleAutofill);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly id = this.route.snapshot.paramMap.get('id');

  readonly statuses = BOOKING_STATUS_LABELS;
  readonly orderStatuses = WORK_ORDER_STATUS_LABELS;
  readonly workOrdersOn = environment.workOrders;
  readonly busy = signal(false);
  readonly card = signal<VehicleDetail | null>(null);
  readonly note = signal<{ warn: boolean; text: string; link?: string[] } | null>(null);
  /** Regnumret finns redan på en annan bil. */
  readonly taken = signal(false);
  /** Bilinfo hämtas just nu. */
  readonly looking = signal(false);
  /** Fälten är ifyllda från fordonsregistret och låsta. */
  readonly locked = signal(false);

  readonly form = inject(FormBuilder).nonNullable.group({
    customerId: ['', Validators.required],
    regNo: ['', [Validators.required, Validators.minLength(2)]],
    make: [''],
    model: [''],
    year: [null as number | null, [Validators.min(1900), Validators.max(2100)]],
    vin: [''],
    notes: [''],
  });

  ngOnInit() {
    if (this.id) return this.load();
    // "Ny bil" från en kunds kort kommer med kunden förvald.
    const customerId = this.route.snapshot.queryParamMap.get('customerId');
    if (customerId) this.form.controls.customerId.setValue(customerId);
  }

  private load() {
    this.api.vehicle(this.id!).subscribe((v) => {
      this.card.set(v);
      this.form.reset({
        customerId: v.customerId,
        regNo: v.regNo,
        make: v.make ?? '',
        model: v.model ?? '',
        year: v.year,
        vin: v.vin ?? '',
        notes: v.notes ?? '',
      });
      // En bil som lagts upp med bara regnr: försök hämta bilinfon igen.
      if (this.autofill.missingInfo(this.form)) this.lookup();
    });
  }

  /** När man lämnat regnr-fältet: finns bilen redan, annars hämtas bilinfo och fälten låses. */
  lookup() {
    const regNo = this.form.controls.regNo.value;
    this.note.set(null);
    this.taken.set(false);
    this.locked.set(false);
    // Ändrar man inte regnumret på en sparad bil finns inget att hämta, om den inte saknar bilinfo.
    if (regNo === this.card()?.regNo && !this.autofill.missingInfo(this.form)) return;
    this.looking.set(true);
    this.autofill.run(this.form, regNo, this.id ?? undefined).subscribe({
      next: (r) => {
        this.looking.set(false);
        this.taken.set(!!r.taken);
        this.locked.set(r.locked);
        this.note.set(r.note);
      },
      error: () => this.looking.set(false),
    });
  }

  /** Låser upp fälten om hämtningen blev fel eller bilen ska skrivas om. */
  unlock() {
    this.autofill.unlock(this.form);
    this.locked.set(false);
    this.note.set(null);
  }

  save() {
    if (this.taken()) {
      this.snack.open('Regnumret finns redan på en annan bil', undefined, { duration: 4000 });
      return;
    }
    const owner = this.form.controls.customerId.invalid ? 'Välj en ägare' : undefined;
    if (!ensureValid(this.form, this.snack, owner)) return;
    const v = this.form.getRawValue();
    const body = {
      customerId: v.customerId,
      regNo: v.regNo,
      make: v.make || null,
      model: v.model || null,
      year: v.year,
      vin: v.vin || null,
      notes: v.notes || null,
    };
    this.busy.set(true);
    // Ett skrivet namn som inte fanns i registret blir en ny kund först.
    const customerId$ = body.customerId.startsWith(PENDING_CUSTOMER)
      ? this.api
          .createCustomer({ type: 'private', name: body.customerId.slice(PENDING_CUSTOMER.length) })
          .pipe(
            // Blir bilen fel ska ett nytt försök inte skapa kunden en gång till.
            tap((c) => this.form.controls.customerId.setValue(c.id)),
            map((c) => c.id),
          )
      : of(body.customerId);
    customerId$
      .pipe(
        switchMap((customerId) => {
          const full = { ...body, customerId };
          return this.id ? this.api.updateVehicle(this.id, full) : this.api.createVehicle(full);
        }),
      )
      .subscribe({
      next: (c) => {
        this.busy.set(false);
        this.snack.open('Sparat', undefined, { duration: 2000 });
        if (this.id) this.load();
        else this.router.navigate(['/vehicles', c.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    const c = this.card()!;
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Ta bort ${c.regNo}?`,
          message: 'Har bilen bokningar arkiveras den i stället, så historiken ligger kvar.',
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) =>
          ok &&
          this.api.removeVehicle(c.id).subscribe((r) => {
            if (!r.archived) return void this.router.navigate(['/vehicles']);
            this.snack.open('Bilen har historik och arkiverades', undefined, { duration: 3000 });
            this.load();
          }),
      );
  }

  restore() {
    this.api.updateVehicle(this.id!, { active: true }).subscribe(() => this.load());
  }
}
