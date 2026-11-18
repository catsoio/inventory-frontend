import { Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { catchError, map, of } from 'rxjs';
import { AxleApi } from '../api/axle-api';
import { StockCountApi, type ScanHit } from '../api/stock-count-api';
import { StorageApi } from '../api/storage-api';
import { SharedModule } from '../../shared/shared-module';
import { ScanTile } from './scan-tile';

export type ShelfSheetData = Extract<ScanHit, { kind: 'location' }>;

export type ShelfSheetResult = {
  kind: 'go';
  commands: string[];
  queryParams?: Record<string, string>;
};

/**
 * Blad för en hylla man skannat etiketten på: vad som står där och rutorna för det man gör vid
 * hyllan. Däckhotellets hylla: lägg in här, visa seten, räkna hyllan. Lagrets hylla: ta emot här,
 * visa artiklarna, räkna hyllan. Att räkna startar en inventering för just den hyllan.
 */
@Component({
  selector: 'app-shelf-sheet',
  standalone: true,
  imports: [SharedModule, ScanTile],
  template: `
    <h2 mat-dialog-title>{{ place }}</h2>
    <mat-dialog-content class="flex flex-col gap-4">
      <div class="rounded-xl bg-gray-50 p-3">
        <div class="text-xs text-gray-500">{{ warehouse }}</div>
        <div class="text-[15px] font-medium">
          @if (onShelf() === null) {
            Hämtar…
          } @else if (hotel) {
            {{ onShelf() }} set på hyllan
          } @else {
            {{ onShelf() }} {{ onShelf() === 1 ? 'artikel' : 'artiklar' }} på hyllan
          }
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        @if (hotel) {
          <button
            type="button"
            app-scan-tile
            icon="add_circle"
            label="Lägg in här"
            sub="Ny inlämning"
            [primary]="true"
            (click)="intake()"
          ></button>
          <button
            type="button"
            app-scan-tile
            icon="list"
            label="Visa set"
            (click)="show('/storage', { status: 'stored', q: place })"
          ></button>
        } @else {
          <button
            type="button"
            app-scan-tile
            icon="move_to_inbox"
            label="Ta emot här"
            sub="Varor till hyllan"
            [primary]="true"
            (click)="receive()"
          ></button>
          <button
            type="button"
            app-scan-tile
            icon="list"
            label="Visa artiklar"
            (click)="show('/inventory', { q: place })"
          ></button>
        }
        <button
          type="button"
          app-scan-tile
          icon="fact_check"
          label="Räkna hyllan"
          sub="Inventering"
          [disabled]="busy()"
          (click)="startCount()"
        ></button>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Stäng</button>
    </mat-dialog-actions>
  `,
})
export class ShelfSheet implements OnInit {
  readonly ref = inject<MatDialogRef<ShelfSheet, ShelfSheetResult>>(MatDialogRef);
  readonly data = inject<ShelfSheetData>(MAT_DIALOG_DATA);
  private readonly storage = inject(StorageApi);
  private readonly axle = inject(AxleApi);
  private readonly counts = inject(StockCountApi);

  /** "Däckhotellet · Hylla H-12" delas i lagret och platsen. */
  readonly warehouse = this.data.label.split(' · ').slice(0, -1).join(' · ');
  readonly place = this.data.label.split(' · ').slice(-1)[0];
  readonly hotel = this.data.warehouseKind === 'customer';

  /** Hur många set eller artiklar som står på hyllan; null medan det hämtas. */
  readonly onShelf = signal<number | null>(null);
  readonly busy = signal(false);

  ngOnInit() {
    const here = <T extends { locationId?: string | null }>(items: T[]) =>
      items.filter((x) => x.locationId === this.data.locationId).length;
    (this.hotel
      ? this.storage
          .deposits({ q: this.place, status: 'stored', limit: 100 })
          .pipe(map((p) => here(p.items)))
      : this.axle.articles({ q: this.place, limit: 100 }).pipe(map((p) => here(p.items)))
    )
      .pipe(catchError(() => of(0)))
      .subscribe((n) => this.onShelf.set(n));
  }

  intake() {
    this.ref.close({
      kind: 'go',
      commands: ['/storage/new'],
      queryParams: {
        scan: '1',
        warehouseId: this.data.warehouseId,
        locationId: this.data.locationId,
      },
    });
  }

  receive() {
    this.ref.close({
      kind: 'go',
      commands: ['/inventory/receive'],
      queryParams: { warehouseId: this.data.warehouseId, locationId: this.data.locationId },
    });
  }

  show(path: string, queryParams: Record<string, string>) {
    this.ref.close({ kind: 'go', commands: [path], queryParams });
  }

  /** Inventeringen av bara den här hyllan (omfånget är lagret och platsen). */
  startCount() {
    this.busy.set(true);
    this.counts
      .start({
        kind: this.hotel ? 'hotel' : 'articles',
        warehouseId: this.data.warehouseId,
        locationId: this.data.locationId,
      })
      .subscribe({
        next: (c) => this.ref.close({ kind: 'go', commands: ['/inventory/counts', c.id] }),
        error: () => this.busy.set(false),
      });
  }
}
