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
  BookingOrder,
  BookingStatus,
  Customer,
  Resource,
  ServiceType,
  Vehicle,
  WORK_ORDER_STATUS_LABELS,
  WorkOrder,
} from '../../core/models';
import { priceContextOf, priceOfService, priceTitle } from '../../core/service-pricing';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';
import type { PickerValue } from '../customer-vehicle-picker/customer-vehicle-picker';
import { LinkResolver, type ResolvedLink } from '../customer-vehicle-picker/link-resolver';
import { Auth } from '../../core/auth/auth';
import { Confirm } from '../confirm';
import { at, hm, linkWhen, whenOrder, whenRange, whenValue, ymd } from '../when/when';

export interface BookingDialogData {
  /** Befintlig bokning, eller null för en ny. */
  booking: Booking | null;
  /** Förvald tid för en ny bokning. */
  start: Date;
  end: Date;
  /** Förvald mekaniker eller lyft/plats för en ny bokning (från resursvyn). */
  resourceId?: string;
  placeId?: string;
  /** En arbetsorder som ska planeras: väljs som "Koppla befintlig" och fyller i kund, bil och text. */
  workOrder?: WorkOrder;
}

/** Hur bokningen och arbetsordern hör ihop när man sparar. */
type OrderMode = 'new' | 'existing' | 'none';

/** Resultat: den sparade bokningen, 'deleted' eller inget (avbrutet). */
export type BookingDialogResult = Booking | 'deleted';

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
      <mat-dialog-content
        class="!grid content-start gap-x-10 gap-y-5 !pt-2 md:grid-cols-2 md:items-start"
      >
        @if (data.booking?.status === 'requested'; as _) {
          <div
            class="rounded-lg bg-violet-50 p-3 text-sm text-violet-900 max-md:order-0 md:col-span-2"
          >
            <b>Förfrågan från bokningssidan.</b>
            {{ data.booking!.customerName
            }}{{ data.booking!.phone ? ' · ' + data.booking!.phone : ''
            }}{{ data.booking!.regNo ? ' · ' + data.booking!.regNo : '' }}. Välj tid och mekaniker
            och bekräfta.
            {{
              data.booking!.regNo
                ? 'Kunden och bilen skapas i registren om de saknas.'
                : 'Kunden har inget regnummer: välj kund och bil nedan först.'
            }}
            <div class="mt-2">
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="busy()"
                (click)="confirmRequest()"
              >
                Bekräfta tiden
              </button>
            </div>
          </div>
        }
        @if (workOrdersOn && !legacy) {
          <section class="flex flex-col gap-3 max-md:order-1 md:col-span-2">
            <h3 class="sec">Arbetsorder</h3>
            @if (order(); as o) {
              <div class="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3">
                <app-pill [tone]="o.status === 'done' ? 'green' : 'blue'">
                  {{ o.code }} · {{ orderStatuses[o.status] }}
                </app-pill>
                @if (o.hasMissing && o.status !== 'done') {
                  <app-pill tone="amber">Del saknas</app-pill>
                }
                <span class="text-sm text-gray-600">
                  Bokningen är planeringen för ordern: tid, mekaniker och plats gäller båda.
                </span>
                <span class="flex-1"></span>
                @if (o.status !== 'done') {
                  <button mat-button type="button" [disabled]="busy()" (click)="detach()">
                    Koppla loss
                  </button>
                }
              </div>
            } @else {
              <mat-button-toggle-group
                formControlName="orderMode"
                hideSingleSelectionIndicator
                aria-label="Arbetsorder"
                class="self-start max-md:w-full"
              >
                <mat-button-toggle value="new" class="max-md:flex-1"
                  >Ny arbetsorder</mat-button-toggle
                >
                <mat-button-toggle value="existing" class="max-md:flex-1"
                  >Koppla befintlig</mat-button-toggle
                >
                <mat-button-toggle value="none" class="max-md:flex-1">Ingen</mat-button-toggle>
              </mat-button-toggle-group>
              @switch (form.controls.orderMode.value) {
                @case ('new') {
                  <p class="text-xs text-gray-500">
                    En arbetsorder skapas när du sparar, med raderna under "Vad ska göras".
                  </p>
                }
                @case ('existing') {
                  <mat-form-field class="w-full" subscriptSizing="dynamic">
                    <mat-label>Arbetsorder</mat-label>
                    <mat-select
                      formControlName="workOrderId"
                      (selectionChange)="pickOrder($event.value)"
                    >
                      @for (c of candidates(); track c.id) {
                        <mat-option [value]="c.id">
                          <b>{{ c.code }}</b> · {{ c.regNo }} · {{ c.customerName }} ·
                          {{ jobText(c) }}
                          <span class="text-xs text-gray-500">({{ orderStatuses[c.status] }})</span>
                        </mat-option>
                      } @empty {
                        <mat-option disabled value="">
                          {{
                            candidatesLoaded() ? 'Inga öppna arbetsorder att planera' : 'Hämtar…'
                          }}
                        </mat-option>
                      }
                    </mat-select>
                    <mat-hint>
                      Öppna, pågående och väntande order som inte har någon tid i kalendern.
                    </mat-hint>
                    <mat-error>Välj arbetsorder</mat-error>
                  </mat-form-field>
                }
              }
            }
          </section>
        }
        <div class="flex flex-col gap-5 max-md:contents">
          <section class="flex flex-col gap-3 max-md:order-2">
            <h3 class="sec">Kund och bil</h3>
            <app-customer-vehicle-picker
              formControlName="link"
              [legacy]="legacy"
              [phoneFirst]="true"
            />
          </section>

          <section class="flex flex-col gap-3 max-md:order-3">
            <h3 class="sec">Vad ska göras</h3>
            <mat-form-field class="w-full" subscriptSizing="dynamic">
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
            <mat-form-field class="w-full" subscriptSizing="dynamic">
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
          <section class="flex flex-col gap-3 max-md:order-6" [class]="moreCls()">
            <h3 class="sec">Pris och anteckning</h3>
            <div class="grid grid-cols-2 gap-x-3 gap-y-3">
              <mat-form-field class="col-span-2" subscriptSizing="dynamic">
                <mat-label>Pris (kr, inkl. moms)</mat-label>
                <input matInput type="number" inputmode="decimal" min="0" formControlName="price" />
                <mat-hint>{{ form.controls.price.value | vatPart }}</mat-hint>
              </mat-form-field>
              <mat-form-field class="col-span-2" subscriptSizing="dynamic">
                <mat-label>Anmärkning (syns på arbetsbladet)</mat-label>
                <textarea matInput rows="2" formControlName="notes"></textarea>
              </mat-form-field>
            </div>
          </section>
        </div>
        <div class="flex flex-col gap-5 max-md:contents">
          <section class="flex flex-col gap-3 max-md:order-4">
            <h3 class="sec">När</h3>
            <app-when-fields [group]="form" />
            <p class="-mt-1 text-xs text-gray-500">
              Tar jobbet flera dagar sätter du ett senare slutdatum.
            </p>
          </section>

          <section class="flex flex-col gap-3 max-md:order-7" [class]="moreCls()">
            <h3 class="sec">Vem och var</h3>
            <div class="grid grid-cols-2 gap-x-3 gap-y-3">
              <mat-form-field class="col-span-1" subscriptSizing="dynamic">
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
              <mat-form-field class="col-span-1" subscriptSizing="dynamic">
                <mat-label>Lyft / plats</mat-label>
                <mat-select formControlName="placeId">
                  <mat-option value="">Ingen vald</mat-option>
                  @for (r of placeOptions(); track r.id) {
                    <mat-option [value]="r.id">{{ r.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field class="col-span-2" subscriptSizing="dynamic">
                <mat-label>Status</mat-label>
                <mat-select formControlName="status">
                  @for (s of statuses; track s[0]) {
                    <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
          </section>
        </div>
        <!-- Mobil: det mesta man behöver vid ett snabbt samtal syns direkt, resten ligger här. -->
        <div class="flex flex-col gap-1 pb-1 max-md:order-5 md:hidden">
          <button
            mat-stroked-button
            type="button"
            class="self-start"
            (click)="more.set(!more())"
            [attr.aria-expanded]="more()"
          >
            <mat-icon>{{ more() ? 'expand_less' : 'expand_more' }}</mat-icon>
            {{ more() ? 'Färre val' : 'Fler val' }}
          </button>
          @if (!more() && moreSummary()) {
            <span class="text-xs text-gray-500">{{ moreSummary() }}</span>
          }
        </div>
      </mat-dialog-content>
      <mat-dialog-actions>
        @if (data.booking && admin) {
          <button mat-button type="button" class="!text-red-700" (click)="remove()">Ta bort</button>
        }
        @if (order(); as o) {
          <button mat-button type="button" [disabled]="busy()" (click)="openWorkOrder(o)">
            <mat-icon>handyman</mat-icon>
            Öppna arbetsorder
          </button>
        }
        <span class="flex-1"></span>
        <button mat-button type="button" (click)="tryClose()">Avbryt</button>
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
  private readonly confirm = inject(Confirm);
  readonly workOrdersOn = environment.workOrders;
  private readonly ref = inject<MatDialogRef<BookingDialog, BookingDialogResult>>(MatDialogRef);

  readonly busy = signal(false);
  /** Mobil: visar pris, anmärkning, klar senast, mekaniker och status. */
  readonly more = signal(false);
  moreCls() {
    return this.more() ? '' : 'max-md:hidden';
  }

  /** En rad om vad som redan är ifyllt under "Fler val", så att man ser det utan att öppna. */
  moreSummary() {
    if (!this.form) return '';
    const v = this.form.getRawValue();
    const mech = this.resourceOptions().find((r) => r.id === v.resourceId)?.name;
    const place = this.resourceOptions().find((r) => r.id === v.placeId)?.name;
    return [
      v.price ? `Pris ${v.price} kr` : '',
      mech ?? '',
      place ?? '',
      v.notes?.trim() ? 'Anmärkning' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /** Stänger direkt, eller frågar först om formuläret har ändrats. */
  tryClose() {
    if (!this.form.dirty) return this.ref.close();
    this.confirm
      .ask({
        title: 'Släng ändringarna?',
        message: 'Bokningen är inte sparad. Det du fyllt i försvinner.',
        confirmText: 'Släng',
        danger: true,
      })
      .subscribe((ok) => ok && this.ref.close());
  }
  /** Arbetsordern bokningen planerar, om den har en. */
  readonly order = signal<BookingOrder | null>(null);
  readonly orderStatuses = WORK_ORDER_STATUS_LABELS;
  /** Order att koppla: öppna, pågående och väntande utan tid i kalendern. */
  readonly candidates = signal<WorkOrder[]>([]);
  readonly candidatesLoaded = signal(false);
  /** Rubriken som sattes av en vald arbetsorder, så att ett byte av order byter den med. */
  private titleFromOrder = '';
  /** "Förfrågan" väljs aldrig för hand: den kommer från bokningssidan och bekräftas till "Bokad". */
  get statuses() {
    return Object.entries(BOOKING_STATUS_LABELS).filter(
      ([s]) => s !== 'requested' || this.data.booking?.status === 'requested',
    );
  }
  readonly resourceOptions = signal<Resource[]>([]);
  readonly resourcesLoaded = signal(false);
  readonly mechanicOptions = computed(() =>
    this.resourceOptions().filter((r) => r.kind === 'mechanic'),
  );
  readonly placeOptions = computed(() =>
    this.resourceOptions().filter((r) => r.kind !== 'mechanic'),
  );
  readonly serviceOptions = signal<ServiceType[]>([]);
  /** Bilen på bokningen; åtgärdens pris räknas efter dess klass och fälgstorlek. */
  private readonly vehicle = signal<Vehicle | null>(null);
  /** Bokning från före registren: texten visas tills kund och bil väljs om. */
  readonly legacy: { customer: string; regNo: string } | null;
  readonly form;

  constructor(@Inject(MAT_DIALOG_DATA) public data: BookingDialogData) {
    // Klick utanför eller Esc stänger inte tyst om man har skrivit något.
    this.ref.disableClose = true;
    this.ref.backdropClick().subscribe(() => this.tryClose());
    this.ref.keydownEvents().subscribe((e) => e.key === 'Escape' && this.tryClose());
    const b = data.booking;
    const start = b ? new Date(b.start) : data.start;
    const end = b ? new Date(b.end) : data.end;
    // En äldre bokning med "Klar senast" efter slutet visar den dagen som slutdatum.
    const due = b?.dueAt ? new Date(b.dueAt) : null;
    const endShown = due && ymd(due) > ymd(end) ? at(ymd(due), hm(end)) : end;
    const planned = data.workOrder ?? null;
    this.order.set(b?.workOrder ?? null);
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
        ...whenValue(start, endShown),
        price: [kr(b?.priceTo ?? b?.priceFrom) as number | null, Validators.min(0)],
        // En ny bokning gör en arbetsorder som standard; en befintlig ändras utan att röra ordern.
        orderMode: [
          (planned ? 'existing' : !b && environment.workOrders ? 'new' : 'none') as OrderMode,
        ],
        workOrderId: [planned?.id ?? ''],
        status: [(b?.status ?? 'booked') as BookingStatus],
        notes: [b?.notes ?? ''],
      },
      { validators: whenOrder },
    );
    const f = this.form.controls;
    linkWhen(this.form, { start, end: endShown });
    // Det som skrivs i datum- och tidsfälten är strängar; whenValue ger dem rätt namn.
    f.link.valueChanges.subscribe((v) => this.loadVehicle(v?.vehicleId, v?.vehicle));
    this.loadVehicle(b?.vehicleId ?? undefined);
    // Kund och bil följer ordern så länge en är kopplad.
    if (this.order()) f.link.disable({ emitEvent: false });
    f.orderMode.valueChanges.subscribe((m) => {
      if (m === 'existing') f.workOrderId.addValidators(Validators.required);
      else {
        f.workOrderId.clearValidators();
        f.workOrderId.setValue('', { emitEvent: false });
        if (f.link.disabled) f.link.enable({ emitEvent: false });
      }
      f.workOrderId.updateValueAndValidity({ emitEvent: false });
    });
    if (planned) f.workOrderId.addValidators(Validators.required);
    if (environment.workOrders && !this.legacy && !this.order()) this.loadCandidates(planned);
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

  /** Bilen med registrets uppgifter; en vald bil ur listan har dem redan, annars hämtas den. */
  private loadVehicle(vehicleId: string | undefined, picked?: Vehicle) {
    if (!vehicleId) {
      this.vehicle.set(null);
      return;
    }
    if (this.vehicle()?.id === vehicleId) return;
    if (picked?.tech !== undefined) {
      this.vehicle.set(picked);
      return;
    }
    this.workshop.vehicle(vehicleId).subscribe((v) => this.vehicle.set(v));
  }

  /**
   * Åtgärden fyller i rubrik, tid och pris (bara det som inte redan är ifyllt). Priset följer
   * bilens klass och fälgstorlek och en pågående kampanj; per hjul skrivs antalet i rubriken.
   */
  pickService(id: string) {
    const t = this.serviceOptions().find((x) => x.id === id);
    if (!t) return;
    const f = this.form.controls;
    const quoted = priceOfService(t, priceContextOf(this.vehicle()));
    const previous = this.serviceOptions().find((x) => x.name === f.title.value);
    if (!f.title.value || previous) f.title.setValue(priceTitle(t.name, quoted));
    const start = at(f.day.value, f.startTime.value);
    const finish = new Date(start.getTime() + t.durationMinutes * 60_000);
    f.endDay.setValue(ymd(finish));
    f.endTime.setValue(hm(finish));
    // En prisrad eller en pågående kampanj styr; annars gäller åtgärdens eget spann som förut (till-priset först).
    const price =
      quoted && (quoted.basis === 'rule' || quoted.campaign)
        ? quoted.total
        : t.prices?.length
          ? null
          : (t.priceTo ?? t.priceFrom);
    if (f.price.value == null && price !== null) f.price.setValue(price / 100);
  }

  /** Order som går att planera; en order som kommer från planeringspanelen finns alltid med. */
  private loadCandidates(planned: WorkOrder | null) {
    this.workOrders.list({ active: true, unbooked: true, limit: 100 }).subscribe({
      next: (p) => {
        const items = p.items.filter((o) => !o.locked);
        if (planned && !items.some((o) => o.id === planned.id)) items.unshift(planned);
        this.candidates.set(items);
        this.candidatesLoaded.set(true);
        if (planned) this.pickOrder(planned.id, true);
      },
      error: () => this.candidatesLoaded.set(true),
    });
  }

  /** Jobben på ordern som en rad text. */
  jobText(o: WorkOrder) {
    return (o.jobs ?? [])
      .map((j) => j.title.trim())
      .filter(Boolean)
      .join(', ');
  }

  /**
   * En vald arbetsorder bestämmer kund och bil, och fyller i vad som ska göras, mekaniker och
   * plats där det inte redan är ifyllt. Tiden är bokningens: ordern får den när man sparar.
   */
  pickOrder(id: string, initial = false) {
    const o = this.candidates().find((x) => x.id === id);
    const f = this.form.controls;
    if (!o) return;
    f.link.enable({ emitEvent: false });
    f.link.setValue({ customerId: o.customerId, vehicleId: o.vehicleId });
    f.link.disable({ emitEvent: false });
    const jobs = (o.jobs ?? [])
      .map((j) => j.title.trim())
      .filter(Boolean)
      .join('\n');
    const text = jobs || o.remarks?.trim() || o.code;
    if (!f.title.value || f.title.value === this.titleFromOrder) {
      f.title.setValue(text);
      this.titleFromOrder = text;
    }
    if (!f.resourceId.value && o.resourceId) f.resourceId.setValue(o.resourceId);
    if (!f.placeId.value && o.placeId) f.placeId.setValue(o.placeId);
    if (!initial) f.workOrderId.setValue(id);
  }

  /** Släpper ordern: bokningen blir fristående och kund och bil kan ändras igen. */
  detach() {
    this.order.set(null);
    this.form.controls.link.enable({ emitEvent: false });
    this.form.controls.orderMode.setValue('none');
    this.form.markAsDirty();
    this.detached = true;
    if (!this.candidatesLoaded()) this.loadCandidates(null);
  }
  private detached = false;

  save() {
    // Ett fel i ett dolt fält ska synas: öppna "Fler val" då.
    if (this.form.controls.price.invalid) this.more.set(true);
    if (!ensureValid(this.form, this.snack)) return;

    const v = this.form.getRawValue();
    const ore = (kr: number | null) => (kr == null ? null : Math.round(kr * 100));
    const range = whenRange(v)!;
    const mode = this.order() ? 'none' : v.orderMode;
    const body = {
      resourceId: v.resourceId || null,
      placeId: v.placeId || null,
      serviceTypeId: v.serviceTypeId || null,
      title: v.title,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      // Slutdatumet är arbetsordernas slut; ett gammalt särskilt "klar senast" tas bort.
      dueAt: null,
      status: v.status,
      priceFrom: ore(v.price),
      priceTo: ore(v.price),
      notes: v.notes || null,
      // Befintlig order: kopplas här. Annars släpps en tidigare order bara om man kopplat loss den.
      ...(mode === 'existing'
        ? { workOrderId: v.workOrderId }
        : this.detached
          ? { workOrderId: null }
          : {}),
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
        // "Ny arbetsorder": den skapas direkt från bokningen.
        switchMap((b) =>
          this.workOrdersOn && !this.legacy && mode === 'new'
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

  /**
   * Bekräftar en förfrågan från bokningssidan: status Bokad, och kunden och bilen skapas om de
   * saknas (en kund med samma telefonnummer återanvänds). Har kunden inget regnummer måste
   * personalen välja kund och bil först.
   */
  confirmRequest() {
    const b = this.data.booking!;
    const f = this.form.controls;
    f.status.setValue('booked');
    if (f.link.value) return this.save();
    if (!b.regNo) {
      f.status.setValue('requested');
      this.snack.open('Välj kund och bil först', undefined, { duration: 3000 });
      return;
    }
    this.busy.set(true);
    // Telefonnumret söks som siffror: servern matchar det hur det än är sparat.
    const digits = (b.phone ?? '').replace(/\D/g, '');
    const email = /^E-post: (\S+@\S+)$/m.exec(b.notes ?? '')?.[1]?.toLowerCase();
    // Samma kund = samma mobilnummer (sista nio siffrorna, oavsett 0/+46) eller samma e-post.
    const tail = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').slice(-9);
    const search = (q: string) =>
      this.workshop.customers({ q, limit: 10 }).pipe(
        map((p) => p.items),
        catchError(() => of([] as Customer[])),
      );
    const known$: Observable<string | undefined> = (
      digits ? search(digits) : of([] as Customer[])
    ).pipe(
      switchMap((byPhone) => {
        const hit = byPhone.find(
          (c) => tail(c.phone).length >= 7 && tail(c.phone) === tail(digits),
        );
        if (hit || !email) return of(hit);
        return search(email).pipe(map((l) => l.find((c) => c.email?.toLowerCase() === email)));
      }),
      map((c) => c?.id),
    );
    known$
      .pipe(
        switchMap((customerId) =>
          this.links.resolve({
            customerId: '',
            vehicleId: '',
            pending: {
              customerId,
              customerName: b.customerName,
              customerPhone: b.phone ?? undefined,
              // Bokningssidan sparar kundens e-post i anteckningen ("E-post: …").
              customerEmail: /^E-post: (\S+@\S+)$/m.exec(b.notes ?? '')?.[1],
              regNo: b.regNo ?? undefined,
            },
          }),
        ),
      )
      .subscribe({
        next: (r) => {
          this.busy.set(false);
          f.link.setValue({ customerId: r.customerId, vehicleId: r.vehicleId });
          this.save();
        },
        error: () => {
          this.busy.set(false);
          f.status.setValue('requested');
        },
      });
  }

  /** Öppnar bokningens arbetsorder. */
  openWorkOrder(o: BookingOrder) {
    this.ref.close();
    this.router.navigate(['/workorders', o.id]);
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
