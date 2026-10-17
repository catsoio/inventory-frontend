import { Component, Inject, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ensureValid } from '../form-guard';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { BookingApi } from '../../core/api/booking-api';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import {
  BOOKING_STATUS_LABELS,
  Booking,
  BookingStatus,
  Resource,
  ServiceType,
  WORK_ORDER_STATUS_LABELS,
  WorkOrder,
} from '../../core/models';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';
import type { PickerValue } from '../customer-vehicle-picker/customer-vehicle-picker';
import { LinkResolver, type ResolvedLink } from '../customer-vehicle-picker/link-resolver';
import { Auth } from '../../core/auth/auth';

export interface BookingDialogData {
  /** Befintlig bokning, eller null för en ny. */
  booking: Booking | null;
  /** Förvald tid för en ny bokning. */
  start: Date;
  end: Date;
  /** Förvald mekaniker eller lyft/plats för en ny bokning (från resursvyn). */
  resourceId?: string;
  placeId?: string;
}

/** Resultat: den sparade bokningen, 'deleted' eller inget (avbrutet). */
export type BookingDialogResult = Booking | 'deleted';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const at = (day: string, time: string) => new Date(`${day}T${time}:00`);

@Component({
  selector: 'app-booking-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>
      {{ data.booking ? 'Ändra bokning' : 'Ny bokning' }}
      @if (data.booking) {
        <span class="ml-2 text-sm font-normal text-gray-500">{{ data.booking.code }}</span>
      }
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="!flex flex-col gap-5 !pt-2">
        <section>
          <h3 class="sec">Kund och bil</h3>
          <app-customer-vehicle-picker formControlName="link" [legacy]="legacy" />
        </section>

        <section>
          <h3 class="sec">Vad ska göras</h3>
          <mat-form-field class="w-full">
            <mat-label>Åtgärd</mat-label>
            <mat-select
              formControlName="serviceTypeId"
              (selectionChange)="pickService($event.value)"
            >
              <mat-option value="">Annat</mat-option>
              @for (t of serviceOptions(); track t.id) {
                <mat-option [value]="t.id">{{ t.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="w-full">
            <mat-label>Vad ska göras</mat-label>
            <textarea
              matInput
              rows="3"
              maxlength="2000"
              formControlName="title"
              placeholder="En rad per åtgärd, t.ex. byt däck"
            ></textarea>
            <mat-error>Ange vad som ska göras</mat-error>
          </mat-form-field>
          <p class="-mt-2 text-xs text-gray-500 max-md:hidden">
            Varje rad blir en kryssruta på arbetsordern.
          </p>
        </section>

        <section>
          <h3 class="sec">När</h3>
          <div class="grid grid-cols-2 gap-x-3 sm:grid-cols-6">
            <app-date-field
              class="col-span-2 sm:col-span-2"
              label="Datum"
              icon="event"
              error="Ange datum"
              formControlName="day"
            />
            <app-time-field
              class="col-span-1 sm:col-span-2"
              label="Från"
              formControlName="startTime"
            />
            <app-time-field
              class="col-span-1 sm:col-span-2"
              label="Till"
              formControlName="endTime"
              [error]="form.errors?.['order'] ? 'Efter starttiden' : ''"
            />
            <app-date-field
              class="col-span-2 sm:col-span-3"
              label="Klar senast (om det dröjer)"
              icon="event_available"
              [error]="form.errors?.['due'] ? 'Före datumet' : ''"
              formControlName="dueDay"
            />
            <p
              class="col-span-2 self-center pb-4 text-xs text-gray-500 max-md:hidden sm:col-span-3"
            >
              Lämna tomt om jobbet görs på tiden ovan. Annars blir det arbetsordernas "Klar senast".
            </p>
          </div>
        </section>

        <section>
          <h3 class="sec">Vem och var</h3>
          <div class="grid grid-cols-2 gap-x-3 sm:grid-cols-6">
            <mat-form-field class="col-span-1 sm:col-span-2">
              <mat-label>Mekaniker</mat-label>
              <mat-select formControlName="resourceId">
                <mat-option value="">Ingen vald</mat-option>
                @for (r of mechanicOptions(); track r.id) {
                  <mat-option [value]="r.id">{{ r.name }}</mat-option>
                }
              </mat-select>
              @if (!resourcesLoaded() || mechanicOptions().length === 0) {
                <mat-hint>Lägg till mekaniker under Register › Mekaniker och platser</mat-hint>
              }
            </mat-form-field>
            <mat-form-field class="col-span-1 sm:col-span-2">
              <mat-label>Lyft / plats</mat-label>
              <mat-select formControlName="placeId">
                <mat-option value="">Ingen vald</mat-option>
                @for (r of placeOptions(); track r.id) {
                  <mat-option [value]="r.id">{{ r.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field class="col-span-2 sm:col-span-2">
              <mat-label>Status</mat-label>
              <mat-select formControlName="status">
                @for (s of statuses; track s[0]) {
                  <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
        </section>

        <section>
          <h3 class="sec">Pris och anteckning</h3>
          <div class="grid grid-cols-2 gap-x-3 sm:grid-cols-6">
            <mat-form-field class="col-span-2 sm:col-span-2">
              <mat-label>Pris (kr, exkl. moms)</mat-label>
              <input matInput type="number" inputmode="decimal" min="0" formControlName="price" />
              <mat-hint>{{ form.controls.price.value | inclVat }}</mat-hint>
            </mat-form-field>
            <mat-form-field class="col-span-2 sm:col-span-4">
              <mat-label>Anmärkning (syns på arbetsbladet)</mat-label>
              <textarea matInput rows="2" formControlName="notes"></textarea>
            </mat-form-field>
          </div>
        </section>

        @if (workOrdersOn && !legacy) {
          <section class="rounded-xl bg-gray-50 p-3">
            @if (data.booking) {
              @if (order(); as o) {
                <app-pill [tone]="o.status === 'done' ? 'green' : 'blue'">
                  {{ o.code }} · {{ orderStatuses[o.status] }}
                </app-pill>
                @if (o.hasMissing && o.status !== 'done') {
                  <app-pill tone="amber">Del saknas</app-pill>
                }
              } @else if (orderLoaded()) {
                <span class="text-sm text-gray-600">Ingen arbetsorder än.</span>
              }
            } @else {
              <mat-checkbox formControlName="createOrder">
                Skapa arbetsorder när jag sparar
              </mat-checkbox>
            }
          </section>
        }
      </mat-dialog-content>
      <mat-dialog-actions>
        @if (data.booking && admin) {
          <button mat-button type="button" class="!text-red-700" (click)="remove()">Ta bort</button>
        }
        @if (data.booking && workOrdersOn && !legacy) {
          <button
            mat-button
            type="button"
            [disabled]="busy() || !orderLoaded()"
            (click)="openWorkOrder()"
          >
            <mat-icon>assignment</mat-icon>
            {{ order() ? 'Öppna arbetsorder' : 'Skapa arbetsorder' }}
          </button>
        }
        <span class="flex-1"></span>
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button mat-flat-button color="primary" [disabled]="busy()">Spara</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class BookingDialog {
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(Auth);
  /** Bara ägare får ta bort. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(BookingApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly links = inject(LinkResolver);
  private readonly workOrders = inject(WorkOrderApi);
  private readonly router = inject(Router);
  readonly workOrdersOn = environment.workOrders;
  private readonly ref = inject<MatDialogRef<BookingDialog, BookingDialogResult>>(MatDialogRef);

  readonly busy = signal(false);
  /** Bokningens arbetsorder, om den har en. */
  readonly order = signal<WorkOrder | null>(null);
  readonly orderLoaded = signal(false);
  readonly orderStatuses = WORK_ORDER_STATUS_LABELS;
  readonly statuses = Object.entries(BOOKING_STATUS_LABELS);
  readonly resourceOptions = signal<Resource[]>([]);
  readonly resourcesLoaded = signal(false);
  readonly mechanicOptions = computed(() =>
    this.resourceOptions().filter((r) => r.kind === 'mechanic'),
  );
  readonly placeOptions = computed(() =>
    this.resourceOptions().filter((r) => r.kind !== 'mechanic'),
  );
  readonly serviceOptions = signal<ServiceType[]>([]);
  /** Bokning från före registren: texten visas tills kund och bil väljs om. */
  readonly legacy: { customer: string; regNo: string } | null;
  readonly form;

  constructor(@Inject(MAT_DIALOG_DATA) public data: BookingDialogData) {
    const b = data.booking;
    const start = b ? new Date(b.start) : data.start;
    const end = b ? new Date(b.end) : data.end;
    const kr = (ore: number | null | undefined) => (ore == null ? null : ore / 100);
    this.legacy =
      b && !(b.customerId && b.vehicleId)
        ? { customer: b.customerName, regNo: b.regNo ?? '' }
        : null;
    this.form = inject(FormBuilder).nonNullable.group(
      {
        link: [
          (b?.customerId && b.vehicleId
            ? { customerId: b.customerId, vehicleId: b.vehicleId }
            : null) as PickerValue | null,
          // Gamla bokningar utan kund/bil i registren går att ändra utan att välja om dem.
          this.legacy ? [] : Validators.required,
        ],
        serviceTypeId: [b?.serviceTypeId ?? ''],
        title: [b?.title ?? '', Validators.required],
        resourceId: [b?.resourceId ?? data.resourceId ?? ''],
        placeId: [b?.placeId ?? data.placeId ?? ''],
        day: [ymd(start), Validators.required],
        dueDay: [b?.dueAt ? ymd(new Date(b.dueAt)) : ''],
        startTime: [hm(start), Validators.required],
        endTime: [hm(end), Validators.required],
        price: [kr(b?.priceTo ?? b?.priceFrom) as number | null, Validators.min(0)],
        createOrder: [environment.workOrders],
        status: [(b?.status ?? 'booked') as BookingStatus],
        notes: [b?.notes ?? ''],
      },
      {
        validators: (g) => {
          const v = g.getRawValue();
          const errors: Record<string, boolean> = {};
          if (v.startTime && v.endTime && v.endTime <= v.startTime) errors['order'] = true;
          if (v.dueDay && v.dueDay < v.day) errors['due'] = true;
          return Object.keys(errors).length ? errors : null;
        },
      },
    );
    if (b && environment.workOrders) {
      this.workOrders.list({ bookingId: b.id, limit: 1 }).subscribe({
        next: (p) => {
          this.order.set(p.items[0] ?? null);
          this.orderLoaded.set(true);
        },
        error: () => this.orderLoaded.set(true),
      });
    }
    // Ändrar man dag eller starttid följer sluttiden med, så att tiden inte blir ogiltig.
    let duration = end.getTime() - start.getTime();
    const f = this.form.controls;
    f.endTime.valueChanges.subscribe(() => {
      const ms =
        at(f.day.value, f.endTime.value).getTime() - at(f.day.value, f.startTime.value).getTime();
      if (ms > 0) duration = ms;
    });
    const followStart = () => {
      const next = new Date(at(f.day.value, f.startTime.value).getTime() + duration);
      if (ymd(next) === f.day.value) f.endTime.setValue(hm(next), { emitEvent: false });
    };
    f.startTime.valueChanges.subscribe(followStart);
    forkJoin([this.workshop.resources(true), this.workshop.serviceTypes(true)]).subscribe(
      ([r, s]) => {
        // Arkiverade val syns bara om just den här bokningen använder dem.
        this.resourceOptions.set(
          r.filter((x) => x.active || x.id === b?.resourceId || x.id === b?.placeId),
        );
        this.serviceOptions.set(s.filter((x) => x.active || x.id === b?.serviceTypeId));
        this.resourcesLoaded.set(true);
      },
    );
  }

  /** Åtgärden fyller i rubrik, tid och pris (bara det som inte redan är ifyllt). */
  pickService(id: string) {
    const t = this.serviceOptions().find((x) => x.id === id);
    if (!t) return;
    const f = this.form.controls;
    const previous = this.serviceOptions().find((x) => x.name === f.title.value);
    if (!f.title.value || previous) f.title.setValue(t.name);
    const start = at(f.day.value, f.startTime.value);
    f.endTime.setValue(hm(new Date(start.getTime() + t.durationMinutes * 60_000)));
    const price = t.priceTo ?? t.priceFrom;
    if (f.price.value == null && price !== null) f.price.setValue(price / 100);
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;

    const v = this.form.getRawValue();
    const ore = (kr: number | null) => (kr == null ? null : Math.round(kr * 100));
    const body = {
      resourceId: v.resourceId || null,
      placeId: v.placeId || null,
      serviceTypeId: v.serviceTypeId || null,
      title: v.title,
      start: at(v.day, v.startTime).toISOString(),
      end: at(v.day, v.endTime).toISOString(),
      // Klar senast är en dag; mitt på dagen så att tidszonen inte flyttar den.
      dueAt: v.dueDay ? at(v.dueDay, '12:00').toISOString() : null,
      status: v.status,
      priceFrom: ore(v.price),
      priceTo: ore(v.price),
      notes: v.notes || null,
    };
    this.busy.set(true);
    // Nyskriven kund och bil skapas först. Gamla bokningar utan länk skickas utan kund/bil.
    const link$: Observable<ResolvedLink | null> = v.link ? this.links.resolve(v.link) : of(null);
    link$
      .pipe(
        switchMap((link) => {
          if (this.data.booking)
            return this.api.update(this.data.booking.id, { ...body, ...(link ?? {}) });
          return this.api.create({
            ...body,
            customerId: link!.customerId,
            vehicleId: link!.vehicleId,
          });
        }),
      )
      .pipe(
        // Ny bokning med kryssrutan i: arbetsordern skapas direkt från bokningen.
        switchMap((b) =>
          !this.data.booking && this.workOrdersOn && v.createOrder
            ? this.workOrders.fromBooking(b.id).pipe(
                map((o) => {
                  this.snack.open(`${o.code} skapad`, undefined, { duration: 2500 });
                  return b;
                }),
                catchError(() => of(b)),
              )
            : of(b),
        ),
      )
      .subscribe({
        next: (b) => this.ref.close(b),
        error: () => this.busy.set(false),
      });
  }

  /** Öppnar bokningens arbetsorder, och skapar den första gången. */
  openWorkOrder() {
    this.busy.set(true);
    this.workOrders.fromBooking(this.data.booking!.id).subscribe({
      next: (o) => {
        this.ref.close();
        this.router.navigate(['/workorders', o.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Ta bort bokningen?',
          message: `${this.data.booking!.title} – ${this.data.booking!.customerName}`,
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.remove(this.data.booking!.id).subscribe({
          next: () => this.ref.close('deleted'),
          error: () => this.busy.set(false),
        });
      });
  }
}
