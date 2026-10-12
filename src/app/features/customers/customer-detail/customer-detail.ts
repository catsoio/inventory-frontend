import { Component, OnInit, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkshopApi } from '../../../core/api/workshop-api';
import {
  BOOKING_STATUS_LABELS,
  CUSTOMER_TYPE_LABELS,
  Customer,
  CustomerDetail,
  Vehicle,
} from '../../../core/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { CustomerDialog } from '../../../shared/customer-dialog/customer-dialog';
import { VehicleDialog } from '../../../shared/vehicle-dialog/vehicle-dialog';

@Component({
  selector: 'app-customer-detail',
  standalone: false,
  template: `
    @if (c(); as c) {
      <div class="mx-auto flex max-w-4xl flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2">
          <a mat-icon-button routerLink="/customers" aria-label="Tillbaka"
            ><mat-icon>arrow_back</mat-icon></a
          >
          <h1 class="text-2xl font-semibold">{{ c.name }}</h1>
          <span class="text-gray-500">{{ c.code }}</span>
          @if (!c.active) {
            <app-pill>Arkiverad</app-pill>
          }
          <span class="flex-1"></span>
          <button mat-stroked-button (click)="editCustomer(c)">
            <mat-icon>edit</mat-icon> Ändra
          </button>
          @if (c.active) {
            <button mat-button class="!text-red-700" (click)="removeCustomer(c)">Ta bort</button>
          } @else {
            <button mat-button (click)="restoreCustomer(c)">Återställ</button>
          }
        </div>

        <div class="grid gap-x-6 gap-y-2 rounded-xl bg-white p-4 text-sm shadow-sm sm:grid-cols-2">
          <div><span class="text-gray-500">Typ:</span> {{ types[c.type] }}</div>
          @if (c.orgNo) {
            <div><span class="text-gray-500">Orgnr:</span> {{ c.orgNo }}</div>
          }
          <div><span class="text-gray-500">Telefon:</span> {{ c.phone || '–' }}</div>
          <div><span class="text-gray-500">E-post:</span> {{ c.email || '–' }}</div>
          @if (c.notes) {
            <div class="sm:col-span-2">
              <span class="text-gray-500">Anmärkning:</span> {{ c.notes }}
            </div>
          }
        </div>

        <section class="rounded-xl bg-white p-4 shadow-sm">
          <div class="mb-2 flex items-center">
            <h2 class="flex-1 text-lg font-semibold">Bilar ({{ activeCars(c).length }})</h2>
            @if (c.active) {
              <button mat-stroked-button (click)="addVehicle(c)">
                <mat-icon>add</mat-icon> Ny bil
              </button>
            }
          </div>
          @for (v of c.vehicles; track v.id) {
            <div
              class="flex items-start gap-3 border-t border-gray-100 py-3"
              [class.opacity-50]="!v.active"
            >
              <app-reg-plate [value]="v.regNo" size="sm" />
              <div class="min-w-0 flex-1">
                <div>
                  {{ carLabel(v) || '–' }}
                  @if (!v.active) {
                    <span class="text-xs text-gray-500">(arkiverad)</span>
                  }
                </div>
                @if (v.notes) {
                  <div class="mt-1 rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">
                    {{ v.notes }}
                  </div>
                }
              </div>
              <button mat-icon-button (click)="editVehicle(c, v)" aria-label="Ändra bil">
                <mat-icon>edit</mat-icon>
              </button>
              @if (v.active) {
                <button mat-icon-button (click)="removeVehicle(v)" aria-label="Ta bort bil">
                  <mat-icon>delete_outline</mat-icon>
                </button>
              } @else {
                <button mat-icon-button (click)="restoreVehicle(v)" aria-label="Återställ bil">
                  <mat-icon>restore_from_trash</mat-icon>
                </button>
              }
            </div>
          } @empty {
            <p class="text-sm text-gray-500">Inga bilar än.</p>
          }
        </section>

        <section class="rounded-xl bg-white p-4 shadow-sm">
          <h2 class="mb-2 text-lg font-semibold">Senaste bokningar</h2>
          @for (b of c.bookings; track b.id) {
            <div class="flex flex-wrap items-center gap-x-4 border-t border-gray-100 py-2 text-sm">
              <span class="tabular-nums">{{ b.start | date: 'yyyy-MM-dd HH:mm' }}</span>
              <span class="font-medium">{{ b.title }}</span>
              <span class="text-gray-500"
                >{{ b.regNo }}{{ b.resourceName ? ' · ' + b.resourceName : '' }}</span
              >
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
      </div>
    }
  `,
})
export class CustomerDetailPage implements OnInit {
  private readonly api = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly c = signal<CustomerDetail | null>(null);
  readonly types = CUSTOMER_TYPE_LABELS;
  readonly statuses = BOOKING_STATUS_LABELS;

  ngOnInit() {
    this.load();
  }

  carLabel = (v: Vehicle) => [v.make, v.model, v.year].filter(Boolean).join(' ');

  activeCars(c: CustomerDetail) {
    return c.vehicles.filter((v) => v.active);
  }

  private load() {
    this.api.customer(this.route.snapshot.paramMap.get('id')!).subscribe((c) => this.c.set(c));
  }

  editCustomer(c: Customer) {
    this.dialog
      .open(CustomerDialog, { data: { customer: c }, width: '560px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.load());
  }

  removeCustomer(c: CustomerDetail) {
    this.confirm(
      `Ta bort ${c.name}?`,
      'Har kunden bilar eller bokningar arkiveras den i stället.',
    ).subscribe(
      (ok) =>
        ok &&
        this.api.removeCustomer(c.id).subscribe((r) => {
          if (r.archived) {
            this.snack.open('Kunden har historik och arkiverades', undefined, { duration: 3000 });
            this.load();
          } else {
            this.router.navigate(['/customers']);
          }
        }),
    );
  }

  restoreCustomer(c: CustomerDetail) {
    this.api.updateCustomer(c.id, { active: true }).subscribe(() => this.load());
  }

  addVehicle(c: CustomerDetail) {
    this.openVehicle({ customerId: c.id, customerName: c.name });
  }

  editVehicle(c: CustomerDetail, v: Vehicle) {
    this.openVehicle({ customerId: c.id, customerName: c.name, vehicle: v });
  }

  private openVehicle(data: object) {
    this.dialog
      .open(VehicleDialog, { data, width: '640px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.load());
  }

  removeVehicle(v: Vehicle) {
    this.confirm(`Ta bort ${v.regNo}?`, 'Har bilen bokningar arkiveras den i stället.').subscribe(
      (ok) =>
        ok &&
        this.api.removeVehicle(v.id).subscribe((r) => {
          if (r.archived) {
            this.snack.open('Bilen har historik och arkiverades', undefined, { duration: 3000 });
          }
          this.load();
        }),
    );
  }

  restoreVehicle(v: Vehicle) {
    this.api.updateVehicle(v.id, { active: true }).subscribe(() => this.load());
  }

  private confirm(title: string, message: string) {
    return this.dialog
      .open(ConfirmDialog, { data: { title, message, confirmText: 'Ta bort', danger: true } })
      .afterClosed();
  }
}
