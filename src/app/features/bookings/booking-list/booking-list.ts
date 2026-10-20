import { Component, Input, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { BookingApi } from '../../../core/api/booking-api';
import { BOOKING_STATUS_LABELS, Booking } from '../../../core/models';
import { DtCol } from '../../../shared/data-table/data-table';
import { KrPipe } from '../../../shared/kr-pipe';
import {
  BookingDialog,
  BookingDialogData,
  BookingDialogResult,
} from '../../../shared/booking-dialog/booking-dialog';

const kr = new KrPipe();
const when = (iso: string) =>
  new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

const COLS: DtCol<Booking>[] = [
  { key: 'code', label: 'Nr', value: (b) => b.number, fmt: (b) => b.code },
  { key: 'start', label: 'Tid', value: (b) => b.start, fmt: (b) => when(b.start) },
  { key: 'title', label: 'Vad', value: (b) => b.title },
  { key: 'regNo', label: 'Regnr', value: (b) => b.regNo ?? '', fmt: (b) => b.regNo || '–' },
  { key: 'customer', label: 'Kund', value: (b) => b.customerName },
  {
    key: 'resource',
    label: 'Mekaniker',
    value: (b) => b.resourceName ?? '',
    fmt: (b) => b.resourceName || '–',
  },
  {
    key: 'price',
    label: 'Pris inkl. moms',
    right: true,
    value: (b) => b.priceFrom ?? 0,
    fmt: (b) =>
      b.priceFrom === null
        ? '–'
        : kr.transform(b.priceFrom) +
          (b.priceTo !== null && b.priceTo !== b.priceFrom ? ` – ${kr.transform(b.priceTo)}` : ''),
  },
  { key: 'status', label: 'Status', value: (b) => BOOKING_STATUS_LABELS[b.status] },
];

type Range = 'upcoming' | 'past';
const DAY = 86_400_000;

/** Alla bokningar som en lista, som alternativ till kalendern. */
@Component({
  selector: 'app-booking-list',
  standalone: false,
  host: { class: 'block h-full' },
  template: `
    <app-list-page
      [title]="embedded ? '' : 'Bokningar'"
      [columns]="cols"
      [rows]="shown()"
      [loading]="loading()"
      newLabel="Ny bokning"
      emptyText="Inga bokningar i perioden."
      searchPlaceholder="Sök kund, regnr, åtgärd eller TID-nummer…"
      (search)="query.set($event)"
      (rowClick)="open($event)"
    >
      <div class="mb-3 flex shrink-0 flex-wrap items-center gap-3">
        @if (!embedded) {
          <app-booking-views value="list" (pick)="goView($event)" />
        }
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [value]="range()"
          (change)="setRange($event.value)"
          aria-label="Period"
        >
          <mat-button-toggle value="upcoming">Kommande 30 dagar</mat-button-toggle>
          <mat-button-toggle value="past">Senaste 30 dagarna</mat-button-toggle>
        </mat-button-toggle-group>
        @if (!embedded) {
          <button mat-flat-button color="primary" (click)="create()">
            <mat-icon>add</mat-icon> Ny bokning
          </button>
        }
      </div>
      <ng-template #cell let-b="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill
            [tone]="
              b.status === 'done'
                ? 'green'
                : b.status === 'booked'
                  ? 'blue'
                  : b.status === 'arrived'
                    ? 'amber'
                    : 'gray'
            "
            >{{ text }}</app-pill
          >
        } @else if (col.key === 'regNo' && b.regNo) {
          <app-reg-plate [value]="text" size="sm" />
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class BookingList {
  /** Visas inuti kalendersidan: då äger kalenderns verktygsrad vyväljare och Ny bokning. */
  @Input() embedded = false;
  private readonly api = inject(BookingApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly cols = COLS;
  private readonly items = signal<Booking[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly range = signal<Range>('upcoming');
  readonly shown = computed(() => {
    const q = this.query().toLowerCase();
    return this.items().filter(
      (b) =>
        !q ||
        `${b.code} ${b.title} ${b.regNo ?? ''} ${b.customerName} ${b.resourceName ?? ''}`
          .toLowerCase()
          .includes(q),
    );
  });

  constructor() {
    this.load();
  }

  setRange(r: Range) {
    this.range.set(r);
    this.load();
  }

  private load() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const from = this.range() === 'upcoming' ? now : new Date(now.getTime() - 30 * DAY);
    const to = this.range() === 'upcoming' ? new Date(now.getTime() + 30 * DAY) : now;
    this.loading.set(true);
    this.api.between(from, to).subscribe((list) => {
      this.items.set(
        [...list].sort((a, b) =>
          this.range() === 'upcoming'
            ? a.start.localeCompare(b.start)
            : b.start.localeCompare(a.start),
        ),
      );
      this.loading.set(false);
    });
  }

  goView(v: string) {
    this.router.navigate(['/bookings'], { queryParams: { view: v } });
  }

  open(booking: Booking) {
    this.show({ booking, start: new Date(booking.start), end: new Date(booking.end) });
  }

  create() {
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    this.show({ booking: null, start, end: new Date(start.getTime() + 3600_000) });
  }

  private show(data: BookingDialogData) {
    this.dialog
      .open<BookingDialog, BookingDialogData, BookingDialogResult>(BookingDialog, {
        data,
        width: '1040px',
        maxWidth: '96vw',
        panelClass: 'dialog-sheet',
      })
      .afterClosed()
      .subscribe((r) => r && this.load());
  }
}
