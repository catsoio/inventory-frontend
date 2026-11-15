import { Component, computed, inject, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { CatalogApi } from '../../../core/api/catalog-api';
import {
  StartStockCount,
  StockCount,
  StockCountApi,
  StockCountKind,
} from '../../../core/api/stock-count-api';
import { Warehouse } from '../../../core/models';
import { Billing } from '../../../core/billing/billing';

/** Startar en inventering: vad som räknas (lagret eller hotellet), var, och om det är en hel hylla. */
@Component({
  selector: 'app-stock-count-start-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Ny inventering</h2>
    <mat-dialog-content class="flex flex-col gap-4">
      @if (hotelAllowed()) {
        <app-segmented
          label="Vad ska räknas"
          [options]="kinds"
          [value]="kind()"
          (valueChange)="setKind($event)"
          [fill]="true"
        />
      }
      <p class="text-sm text-gray-600">
        @if (kind() === 'articles') {
          Axle skriver ner vad lagret säger finns. Du skannar varorna och räknar, och först när du
          bokför blir skillnaderna lagerjusteringar.
        } @else {
          Du skannar hyllan och sedan varje hjulset på den. Set som står på en annan hylla än
          registret säger flyttas när du bokför.
        }
      </p>
      @if (!options().length) {
        <p class="text-sm text-red-700">
          @if (kind() === 'articles') {
            Det finns inget eget lager ännu. Skapa ett under Register → Lager.
          } @else {
            Det finns inget lager för kundgods ännu. Skapa ett under Register → Lager.
          }
        </p>
      } @else {
        <mat-form-field>
          <mat-label>Lager</mat-label>
          <mat-select [value]="warehouseId()" (valueChange)="setWarehouse($event)">
            @for (w of options(); track w.id) {
              <mat-option [value]="w.id">{{ w.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Hylla</mat-label>
          <mat-select [value]="locationId()" (valueChange)="locationId.set($event)">
            <mat-option [value]="null">Hela lagret</mat-option>
            @for (l of places(); track l.id) {
              <mat-option [value]="l.id">{{ l.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Avbryt</button>
      <button mat-flat-button type="button" [disabled]="!warehouseId() || busy()" (click)="start()">
        Starta
      </button>
    </mat-dialog-actions>
  `,
})
export class StockCountStartDialog {
  private readonly api = inject(StockCountApi);
  private readonly catalog = inject(CatalogApi);
  private readonly ref = inject(MatDialogRef<StockCountStartDialog, StockCount>);
  private readonly billing = inject(Billing);

  readonly kinds = [
    { value: 'articles', label: 'Lager' },
    { value: 'hotel', label: 'Däckhotell' },
  ];
  readonly kind = signal<StockCountKind>('articles');
  readonly all = signal<Warehouse[]>([]);
  readonly warehouseId = signal<string | null>(null);
  readonly locationId = signal<string | null>(null);
  readonly busy = signal(false);

  readonly hotelAllowed = computed(() => this.billing.allows('dackhotell'));
  readonly options = computed(() =>
    this.all().filter((w) => (this.kind() === 'hotel' ? w.kind === 'customer' : w.kind === 'own')),
  );
  readonly places = computed(
    () => this.all().find((w) => w.id === this.warehouseId())?.locations ?? [],
  );

  constructor() {
    this.catalog.warehouses().subscribe((w) => {
      this.all.set(w);
      this.pick();
    });
  }

  setKind(k: string) {
    this.kind.set(k as StockCountKind);
    this.pick();
  }

  setWarehouse(id: string) {
    this.warehouseId.set(id);
    this.locationId.set(null);
  }

  /** Första lagret av rätt sort förvalt. */
  private pick() {
    this.warehouseId.set(this.options()[0]?.id ?? null);
    this.locationId.set(null);
  }

  start() {
    const warehouseId = this.warehouseId();
    if (!warehouseId) return;
    const body: StartStockCount = {
      kind: this.kind(),
      warehouseId,
      locationId: this.locationId(),
    };
    this.busy.set(true);
    this.api.start(body).subscribe({
      next: (c) => this.ref.close(c),
      error: () => this.busy.set(false),
    });
  }
}
