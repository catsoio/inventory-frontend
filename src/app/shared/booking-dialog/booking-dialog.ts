import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { forkJoin } from 'rxjs';
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
} from '../../core/models';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';
import type { PickerValue } from '../customer-vehicle-picker/customer-vehicle-picker';

export interface BookingDialogData {
  /** Befintlig bokning, eller null för en ny. */
  booking: Booking | null;
  /** Förvald tid för en ny bokning. */
  start: Date;
  end: Date;
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
      <mat-dialog-content class="grid gap-x-3 sm:grid-cols-6 !pt-2">
        <app-customer-vehicle-picker
          class="sm:col-span-6"
          formControlName="link"
          [legacy]="legacy"
        />

        <mat-form-field class="sm:col-span-3">
          <mat-label>Åtgärd</mat-label>
          <mat-select formControlName="serviceTypeId" (selectionChange)="pickService($event.value)">
            <mat-option value="">Annat</mat-option>
            @for (t of serviceOptions(); track t.id) {
              <mat-option [value]="t.id">{{ t.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="sm:col-span-3">
          <mat-label>Vad ska göras</mat-label>
          <input matInput formControlName="title" />
          <mat-error>Ange vad som ska göras</mat-error>
        </mat-form-field>

        <app-date-field
          class="sm:col-span-2"
          label="Datum"
          icon="event"
          error="Ange datum"
          formControlName="day"
        />
        <mat-form-field class="sm:col-span-2">
          <mat-label>Från</mat-label>
          <input matInput type="time" step="900" formControlName="startTime" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-2">
          <mat-label>Till</mat-label>
          <input matInput type="time" step="900" formControlName="endTime" />
          @if (form.errors?.['order']) {
            <mat-error>Måste vara efter starttiden</mat-error>
          }
        </mat-form-field>

        <mat-form-field class="sm:col-span-3">
          <mat-label>Mekaniker / plats</mat-label>
          <mat-select formControlName="resourceId">
            <mat-option value="">Ingen vald</mat-option>
            @for (r of resourceOptions(); track r.id) {
              <mat-option [value]="r.id">{{ r.name }}</mat-option>
            }
          </mat-select>
          @if (!resourcesLoaded() || resourceOptions().length === 0) {
            <mat-hint>Lägg till mekaniker under Verkstad › Mekaniker och åtgärder</mat-hint>
          }
        </mat-form-field>
        <mat-form-field class="sm:col-span-3">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            @for (s of statuses; track s[0]) {
              <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field class="sm:col-span-3">
          <mat-label>Pris från (kr)</mat-label>
          <input matInput type="number" inputmode="decimal" min="0" formControlName="priceFrom" />
        </mat-form-field>
        <mat-form-field class="sm:col-span-3">
          <mat-label>Pris till (kr)</mat-label>
          <input matInput type="number" inputmode="decimal" min="0" formControlName="priceTo" />
          @if (form.errors?.['price']) {
            <mat-error>Lägre än "från"</mat-error>
          }
        </mat-form-field>

        <mat-form-field class="sm:col-span-6">
          <mat-label>Anmärkning för det här besöket</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions>
        @if (data.booking) {
          <button mat-button type="button" class="!text-red-700" (click)="remove()">Ta bort</button>
        }
        @if (data.booking && workOrdersOn && !legacy) {
          <button mat-button type="button" [disabled]="busy()" (click)="openWorkOrder()">
            <mat-icon>assignment</mat-icon> Arbetsorder
          </button>
        }
        <span class="flex-1"></span>
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button mat-flat-button color="primary" [disabled]="form.invalid || busy()">Spara</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class BookingDialog {
  private readonly api = inject(BookingApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly workOrders = inject(WorkOrderApi);
  private readonly router = inject(Router);
  readonly workOrdersOn = environment.workOrders;
  private readonly ref = inject<MatDialogRef<BookingDialog, BookingDialogResult>>(MatDialogRef);

  readonly busy = signal(false);
  readonly statuses = Object.entries(BOOKING_STATUS_LABELS);
  readonly resourceOptions = signal<Resource[]>([]);
  readonly resourcesLoaded = signal(false);
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
          Validators.required,
        ],
        serviceTypeId: [b?.serviceTypeId ?? ''],
        title: [b?.title ?? '', Validators.required],
        resourceId: [b?.resourceId ?? ''],
        day: [ymd(start), Validators.required],
        startTime: [hm(start), Validators.required],
        endTime: [hm(end), Validators.required],
        priceFrom: [kr(b?.priceFrom) as number | null, Validators.min(0)],
        priceTo: [kr(b?.priceTo) as number | null, Validators.min(0)],
        status: [(b?.status ?? 'booked') as BookingStatus],
        notes: [b?.notes ?? ''],
      },
      {
        validators: (g) => {
          const v = g.getRawValue();
          const errors: Record<string, boolean> = {};
          if (v.startTime && v.endTime && v.endTime <= v.startTime) errors['order'] = true;
          if (v.priceFrom != null && v.priceTo != null && v.priceFrom > v.priceTo) {
            errors['price'] = true;
          }
          return Object.keys(errors).length ? errors : null;
        },
      },
    );
    forkJoin([this.workshop.resources(true), this.workshop.serviceTypes(true)]).subscribe(
      ([r, s]) => {
        // Arkiverade val syns bara om just den här bokningen använder dem.
        this.resourceOptions.set(r.filter((x) => x.active || x.id === b?.resourceId));
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
    if (f.priceFrom.value == null && t.priceFrom !== null) f.priceFrom.setValue(t.priceFrom / 100);
    if (f.priceTo.value == null && t.priceTo !== null) f.priceTo.setValue(t.priceTo / 100);
  }

  save() {
    const v = this.form.getRawValue();
    const link = v.link!;
    const ore = (kr: number | null) => (kr == null ? null : Math.round(kr * 100));
    const body = {
      customerId: link.customerId,
      vehicleId: link.vehicleId,
      resourceId: v.resourceId || null,
      serviceTypeId: v.serviceTypeId || null,
      title: v.title,
      start: at(v.day, v.startTime).toISOString(),
      end: at(v.day, v.endTime).toISOString(),
      status: v.status,
      priceFrom: ore(v.priceFrom),
      priceTo: ore(v.priceTo),
      notes: v.notes || null,
    };
    this.busy.set(true);
    const req = this.data.booking
      ? this.api.update(this.data.booking.id, body)
      : this.api.create(body);
    req.subscribe({
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
