import { Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { StockCountHeader, StockCountApi } from '../../../core/api/stock-count-api';
import { STOCK_TABS } from '../../../shared/page-header/tabs';
import { StockCountStartDialog } from './stock-count-start-dialog';

/** Inventeringarna: de som pågår och de som bokförts. */
@Component({
  selector: 'app-stock-count-list',
  standalone: false,
  host: { class: 'block' },
  template: `
    <app-page-header [tabs]="tabs" [desktopOnly]="true" label="Inventering">
      <div actions class="contents">
        <button mat-flat-button type="button" (click)="start()">
          <mat-icon>add</mat-icon> Ny inventering
        </button>
      </div>
    </app-page-header>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    } @else if (!items().length) {
      <div class="rounded-xl bg-white p-8 text-center shadow-sm">
        <mat-icon class="!h-10 !w-10 !text-4xl text-gray-400">qr_code_scanner</mat-icon>
        <h2 class="mt-2 text-lg font-semibold">Ingen inventering ännu</h2>
        <p class="mx-auto mt-1 max-w-md text-sm text-gray-600">
          Räkna lagret eller däckhotellet med en streckkodsläsare. Axle visar vad som saknas och vad
          som står på fel hylla, och du bokför bara det som stämmer.
        </p>
        <button mat-flat-button class="mt-4" type="button" (click)="start()">
          Starta den första
        </button>
      </div>
    } @else {
      <div class="overflow-hidden rounded-xl bg-white shadow-sm">
        @for (c of items(); track c.id) {
          <a
            [routerLink]="['/inventory/counts', c.id]"
            class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50"
          >
            <span class="w-20 font-semibold">{{ c.code }}</span>
            <span class="min-w-0 flex-1">
              <span class="font-medium">{{ c.scopeLabel }}</span>
              <span class="ml-2 text-sm text-gray-500">{{
                c.kind === 'hotel' ? 'Däckhotell' : 'Lager'
              }}</span>
            </span>
            <span class="text-sm text-gray-600"
              >{{ c.summary.counted }} av {{ c.summary.lines }} räknade
              @if (c.summary.differing) {
                · {{ c.summary.differing }} avvikelser
              }
            </span>
            <app-pill [tone]="c.status === 'open' ? 'amber' : 'green'">{{
              c.status === 'open' ? 'Pågår' : 'Bokförd'
            }}</app-pill>
            <span class="w-24 text-right text-sm text-gray-500">{{ date(c) }}</span>
          </a>
        }
      </div>
    }
  `,
})
export class StockCountList {
  private readonly api = inject(StockCountApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly tabs = [...STOCK_TABS];
  readonly items = signal<StockCountHeader[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.api.list().subscribe({
      next: (p) => {
        this.items.set(p.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  date(c: StockCountHeader) {
    return new Date(c.postedAt ?? c.createdAt).toLocaleDateString('sv-SE');
  }

  start() {
    this.dialog
      .open(StockCountStartDialog, { width: '460px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((c) => c && this.router.navigate(['/inventory/counts', c.id]));
  }
}
