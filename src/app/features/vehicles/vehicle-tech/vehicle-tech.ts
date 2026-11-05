import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { VEHICLE_CLASS_LABELS, type Vehicle, type VehicleClass } from '../../../core/models';
import { techGroups } from './tech-groups';

/**
 * Allt fordonsregistret berättar om bilen: däck och fälg fram och bak, drivlina, vikter, besiktning.
 * En bil som sparades innan vi läste allt uppdateras en gång av sig själv; "Uppdatera" läser om.
 */
@Component({
  selector: 'app-vehicle-tech',
  standalone: false,
  template: `
    <details class="rounded-xl bg-white shadow-sm">
      <summary class="cursor-pointer px-5 py-4 text-lg font-semibold select-none">
        Tekniska uppgifter
      </summary>
      <div class="p-5 pt-0">
        <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span class="flex-1"></span>
          @if (vehicle.registryFetchedAt; as at) {
            <span class="text-xs text-gray-500">Hämtat {{ at | date: 'yyyy-MM-dd' }}</span>
          }
          <button mat-stroked-button type="button" (click)="refresh()" [disabled]="busy()">
            <mat-icon>refresh</mat-icon> Uppdatera från registret
          </button>
        </div>
        <div class="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <label for="vehicle-class" class="text-gray-500">Prisklass</label>
          <select
            id="vehicle-class"
            class="h-9 px-2 text-sm text-gray-900 field"
            [disabled]="!vehicle.active"
            (change)="setClass($any($event.target).value)"
          >
            <option value="" [selected]="!vehicle.classOverride">
              Automatisk ({{ autoClass }})
            </option>
            @for (c of classes; track c.value) {
              <option [value]="c.value" [selected]="vehicle.classOverride === c.value">
                {{ c.label }}
              </option>
            }
          </select>
          <span class="text-xs text-gray-500">
            Styr vilket pris åtgärderna får. Registret gissar efter fordonstyp och vikt.
          </span>
        </div>
        @if (busy() && !groups.length) {
          <p class="text-sm text-gray-500">Hämtar tekniska uppgifter…</p>
        } @else if (groups.length) {
          <div class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            @for (g of groups; track g.title) {
              <div>
                <h3 class="mb-1 text-sm font-semibold text-gray-700">{{ g.title }}</h3>
                <dl class="text-sm">
                  @for (r of g.rows; track r.label) {
                    <div class="flex justify-between gap-4 border-t border-gray-100 py-1">
                      <dt class="text-gray-500">{{ r.label }}</dt>
                      <dd class="text-right font-medium tabular-nums">{{ r.value }}</dd>
                    </div>
                  }
                </dl>
              </div>
            }
          </div>
        } @else {
          <p class="text-sm text-gray-500">
            Inga tekniska uppgifter än. Tryck på Uppdatera från registret för att hämta dem.
          </p>
        }
      </div>
    </details>
  `,
})
export class VehicleTech implements OnInit {
  private readonly api = inject(WorkshopApi);
  private readonly snack = inject(MatSnackBar);

  @Input({ required: true }) vehicle!: Vehicle;
  /** Bilen är uppdaterad från registret; kortet ska läsa om den. */
  @Output() refreshed = new EventEmitter<void>();

  readonly busy = signal(false);
  readonly classes = (Object.entries(VEHICLE_CLASS_LABELS) as [VehicleClass, string][]).map(
    ([value, label]) => ({ value, label }),
  );

  get groups() {
    return techGroups(this.vehicle);
  }

  /** Klassen registret ger, för "Automatisk (…)". */
  get autoClass(): string {
    const c = this.vehicle.tech?.vehicleClass;
    return c ? VEHICLE_CLASS_LABELS[c] : 'okänd';
  }

  /** Sätter prisklassen för hand, eller tillbaka till registrets med tomt val. */
  setClass(value: string) {
    this.api
      .updateVehicle(this.vehicle.id, { classOverride: (value || null) as VehicleClass | null })
      .subscribe(() => {
        this.snack.open('Prisklassen sparades', undefined, { duration: 2000 });
        this.refreshed.emit();
      });
  }

  ngOnInit() {
    // Sparad före den fulla läsaren: hämta en gång i bakgrunden (misslyckas det är knappen kvar).
    if (
      (this.vehicle.tech === undefined || this.vehicle.details === undefined) &&
      this.vehicle.active
    ) {
      this.refresh(true);
    }
  }

  refresh(silent = false) {
    this.busy.set(true);
    this.api.lookupVehicle(this.vehicle.regNo, true).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (r.status === 'found') {
          if (!silent) this.snack.open('Uppdaterat från registret', undefined, { duration: 2500 });
          this.refreshed.emit();
        } else if (!silent) {
          this.snack.open(
            r.status === 'unavailable'
              ? 'Registret gick inte att nå just nu. Försök igen om en stund.'
              : 'Registret hittade ingen bil med det numret.',
            undefined,
            { duration: 4000 },
          );
        }
      },
      error: () => this.busy.set(false),
    });
  }
}
