import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { StorageApi } from '../api/storage-api';
import { WorkOrderApi } from '../api/work-order-api';
import { WorkshopApi } from '../api/workshop-api';
import { Auth } from '../auth/auth';
import { Billing } from '../billing/billing';
import {
  WORK_ORDER_STATUS_LABELS,
  type CustomerDetail,
  type ServiceType,
  type StorageDeposit,
  type VehicleDetail,
  type WorkOrder,
  type WorkOrderStatus,
} from '../models';
import { Confirm } from '../../shared/confirm';
import { SharedModule } from '../../shared/shared-module';
import { CarSheetResult, carTiles } from './car-actions';
import { tyreJobName } from './code';
import { ScanTile } from './scan-tile';

export interface CarSheetData {
  vehicleId: string;
  regNo: string;
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9ÅÄÖ]/g, '');

const TONES: Record<string, 'blue' | 'amber' | 'green' | 'gray'> = {
  open: 'blue',
  in_progress: 'amber',
  waiting_parts: 'amber',
  done: 'green',
  cancelled: 'gray',
};

/**
 * Blad för en skannad bil som garaget känner. Personalen ser bilen, kunden (med en ring-knapp) och
 * rutor för vad som är troligast härnäst: en order som redan pågår först så att ingen dubblett
 * skapas, sedan ny order, däckbyte, däckhotell, offert, sälj och bilkortet. Mekanikern ser bara bilen
 * och sina order på den (Starta, Klar, Öppna) och kan ta en order som ingen fått än; ingen kund, inga
 * priser.
 */
@Component({
  selector: 'app-car-sheet',
  standalone: true,
  imports: [SharedModule, ScanTile],
  template: `
    <h2 mat-dialog-title>Bil</h2>
    <mat-dialog-content class="flex flex-col gap-4">
      <div class="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
        <app-reg-plate [value]="data.regNo" size="lg" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-[15px] font-medium">{{ carName() }}</div>
          @if (!mechanic && customer(); as k) {
            <div class="truncate text-sm text-gray-600">{{ k.name }}</div>
          }
        </div>
        @if (!mechanic && customer()?.phone; as tel) {
          <a
            [href]="'tel:' + tel"
            class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 active:bg-gray-100"
            aria-label="Ring kunden"
          >
            <mat-icon>call</mat-icon>
          </a>
        }
      </div>

      @if (loading()) {
        <p class="text-sm text-gray-600">Hämtar…</p>
      } @else if (error()) {
        <p class="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">{{ error() }}</p>
      } @else if (mechanic) {
        @for (o of orders(); track o.id) {
          <section class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[15px] font-semibold">{{ o.code }}</span>
              <app-pill [tone]="tones[o.status]">{{ statuses[o.status] }}</app-pill>
            </div>
            @if (o.remarks) {
              <div class="mt-2 rounded-lg bg-gray-50 p-2 text-sm whitespace-pre-line">
                {{ o.remarks }}
              </div>
            }
            <div class="mt-3 flex gap-2">
              <button
                mat-stroked-button
                type="button"
                class="!min-h-12 flex-1"
                (click)="openOrder(o)"
              >
                Öppna
              </button>
              @if (o.status === 'open') {
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  class="!min-h-12 flex-1"
                  [disabled]="busy()"
                  (click)="setStatus(o, 'in_progress')"
                >
                  <mat-icon>play_arrow</mat-icon> Starta
                </button>
              } @else if (o.status !== 'done') {
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  class="!min-h-12 flex-1"
                  [disabled]="busy()"
                  (click)="finish(o)"
                >
                  <mat-icon>check</mat-icon> Klar
                </button>
              }
            </div>
          </section>
        }
        @for (o of free(); track o.id) {
          <section class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[15px] font-semibold">{{ o.code }}</span>
              <app-pill tone="gray">Ej tilldelad</app-pill>
            </div>
            @if (o.remarks) {
              <div class="mt-2 rounded-lg bg-gray-50 p-2 text-sm whitespace-pre-line">
                {{ o.remarks }}
              </div>
            }
            <button
              mat-flat-button
              color="primary"
              type="button"
              class="!mt-3 !min-h-12 w-full"
              [disabled]="busy()"
              (click)="take(o)"
            >
              Ta ordern
            </button>
          </section>
        }
        @if (!orders().length && !free().length) {
          <p class="text-sm text-gray-600">Ingen order på den här bilen.</p>
        }
      } @else {
        <div class="grid grid-cols-2 gap-3">
          @for (t of tiles(); track t.id) {
            <button
              type="button"
              app-scan-tile
              [icon]="t.icon"
              [label]="t.label"
              [sub]="t.sub ?? ''"
              [primary]="t.primary"
              (click)="ref.close(t.result)"
            ></button>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Stäng</button>
    </mat-dialog-actions>
  `,
})
export class CarSheet implements OnInit {
  readonly ref = inject<MatDialogRef<CarSheet, CarSheetResult>>(MatDialogRef);
  readonly data = inject<CarSheetData>(MAT_DIALOG_DATA);
  private readonly workshop = inject(WorkshopApi);
  private readonly orderApi = inject(WorkOrderApi);
  private readonly storage = inject(StorageApi);
  private readonly billing = inject(Billing);
  private readonly confirm = inject(Confirm);
  private readonly snack = inject(MatSnackBar);

  readonly mechanic = inject(Auth).isMechanic();
  readonly tones = TONES;
  readonly statuses = WORK_ORDER_STATUS_LABELS;

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly vehicle = signal<VehicleDetail | null>(null);
  readonly customer = signal<CustomerDetail | null>(null);
  /** Orderna på bilen som är öppna, pågår eller väntar på del; för mekanikern bara hens egna. */
  readonly orders = signal<WorkOrder[]>([]);
  /** Mekanikern: orderna på bilen som ingen fått än. */
  readonly free = signal<WorkOrder[]>([]);
  private readonly stored = signal<StorageDeposit | null>(null);
  private readonly services = signal<ServiceType[]>([]);

  readonly carName = computed(() => {
    const v = this.vehicle();
    if (!v) return '';
    return (
      [[v.make, v.model, v.year].filter(Boolean).join(' '), v.color].filter(Boolean).join(' · ') ||
      'Okänt fordon'
    );
  });

  readonly tiles = computed(() => {
    const v = this.vehicle();
    if (!v) return [];
    const set = this.stored();
    return carTiles({
      vehicleId: v.id,
      customerId: v.customerId,
      activeOrders: this.orders().map((o) => ({ id: o.id, code: o.code, status: o.status })),
      storedSet: set ? { id: set.id, code: set.code, location: set.location } : null,
      tyreJob: tyreJobName(this.services()),
      allows: (m) => this.billing.allows(m),
    });
  });

  ngOnInit() {
    this.workshop
      .vehicle(this.data.vehicleId)
      .pipe(
        switchMap((v) =>
          forkJoin({
            vehicle: of(v),
            customer: this.mechanic
              ? of(null)
              : this.workshop.customer(v.customerId).pipe(catchError(() => of(null))),
            ...this.ordersOf(v.id),
            stored:
              !this.mechanic && this.billing.allows('dackhotell')
                ? this.storage.deposits({ q: v.regNo, status: 'stored', limit: 5 }).pipe(
                    map(
                      (p) => p.items.find((d) => norm(d.vehicle.regNo) === norm(v.regNo)) ?? null,
                    ),
                    catchError(() => of(null)),
                  )
                : of(null),
            services:
              !this.mechanic && this.billing.allows('arbetsorder')
                ? this.workshop.serviceTypes().pipe(catchError(() => of([] as ServiceType[])))
                : of([] as ServiceType[]),
          }),
        ),
      )
      .subscribe({
        next: (r) => {
          this.vehicle.set(r.vehicle);
          this.customer.set(r.customer);
          this.orders.set(r.orders);
          this.free.set(r.free);
          this.stored.set(r.stored);
          this.services.set(r.services);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Det gick inte att hämta bilen just nu. Försök igen.');
          this.loading.set(false);
        },
      });
  }

  /** Orderna på bilen: personalen ser alla pågående, mekanikern sina egna och de som ingen fått. */
  private ordersOf(vehicleId: string) {
    const list = (unassigned: boolean) =>
      this.orderApi
        .list({ vehicleId, active: true, unassigned: unassigned || undefined, limit: 10 })
        .pipe(
          map((p) => p.items),
          catchError(() => of([] as WorkOrder[])),
        );
    return { orders: list(false), free: this.mechanic ? list(true) : of([] as WorkOrder[]) };
  }

  // --- mekanikern ---

  openOrder(o: WorkOrder) {
    this.ref.close({ kind: 'go', commands: ['/workorders/mine'], queryParams: { open: o.id } });
  }

  setStatus(o: WorkOrder, status: WorkOrderStatus) {
    this.busy.set(true);
    this.orderApi.progress(o.id, { status }).subscribe({
      next: () => {
        this.orders.update((l) => l.map((x) => (x.id === o.id ? { ...x, status } : x)));
        this.busy.set(false);
      },
      error: () => this.busy.set(false),
    });
  }

  /** Klar bokar delarna ur lagret, så det frågas en gång. */
  finish(o: WorkOrder) {
    this.confirm
      .ask({
        title: `Markera ${o.code} som klar?`,
        message: 'Delarna på ordern tas ut ur lagret och bokas som en försäljning.',
        confirmText: 'Markera klar',
      })
      .subscribe((ok) => ok && this.setStatus(o, 'done'));
  }

  take(o: WorkOrder) {
    this.busy.set(true);
    this.orderApi.claim(o.id).subscribe({
      next: () => {
        this.snack.open(`${o.code} är din`, undefined, { duration: 2500 });
        this.free.update((l) => l.filter((x) => x.id !== o.id));
        this.orders.update((l) => [...l, o]);
        this.busy.set(false);
      },
      error: () => this.busy.set(false),
    });
  }
}
