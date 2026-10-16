import { Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { ClosingApi } from '../../core/api/closing-api';
import { Auth } from '../../core/auth/auth';
import { Closing, ClosingStatusInfo, closingCode } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import { BookDialog } from './book-dialog/book-dialog';
import { dateTimeText, dayText, periodLabel } from './bookkeeping-format';
import { ResetDialog } from './reset-dialog/reset-dialog';

const kr = new KrPipe();

const statusText = (c: Closing) =>
  c.status === 'voided' ? 'Annullerad' : c.kind === 'reset' ? 'Nollställning' : 'Bokförd';

@Component({
  selector: 'app-bookkeeping',
  standalone: false,
  template: `
    <div class="mx-auto max-w-[1400px]">
      <h1 class="mb-1 text-2xl font-semibold">Bokföring</h1>
      <p class="mb-4 max-w-3xl text-sm text-gray-600">
        Bokför en period för att arkivera dess siffror, lagersaldon och händelser och låsa den. Allt
        går att granska i efterhand. Garagets ägare och Catso-superadmin kan bokföra.
      </p>

      @if (status(); as s) {
        <section class="mb-4 flex flex-wrap items-center gap-4 rounded-xl bg-white p-5 shadow-sm">
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-full"
            [class]="s.latest ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'"
          >
            <mat-icon>{{ s.latest ? 'lock' : 'lock_open' }}</mat-icon>
          </span>
          <div class="min-w-0 flex-1">
            @if (s.latest; as l) {
              <div class="text-lg font-semibold">
                Bokfört till och med {{ lastDay(l) }}
                <span class="font-normal text-gray-500">· {{ code(l.number) }}</span>
              </div>
              <div class="text-sm text-gray-600">
                Det som hör till den här perioden är låst. Nästa bokföring börjar
                {{ dateTime(l.to) }}.
              </div>
            } @else {
              <div class="text-lg font-semibold">Ingen period är bokförd än</div>
              <div class="text-sm text-gray-600">
                @if (s.firstEventAt) {
                  Första händelsen var {{ day(s.firstEventAt) }}. Du kan bokföra från den dagen till
                  idag, eller välja egna datum.
                } @else if (s.hasData) {
                  Det finns lager men inga händelser än.
                } @else {
                  Det finns ingenting att bokföra än: inga artiklar, händelser eller inlämningar.
                }
              </div>
            }
          </div>
          <button mat-flat-button color="primary" [disabled]="!s.hasData" (click)="book(s)">
            <mat-icon>menu_book</mat-icon> Bokför period…
          </button>
        </section>
      }

      <app-vat-report />

      <h2 class="mb-2 text-base font-semibold">Bokförda perioder</h2>
      <app-data-table
        [columns]="columns"
        [rows]="closings()"
        [clickable]="true"
        scrollClass="max-h-[55vh]"
        [accent]="accent"
        [emptyText]="loading() ? 'Laddar…' : 'Inga bokförda perioder än.'"
        (rowClick)="open($event)"
      >
        <ng-template #cell let-c="row" let-col="col" let-text="text">
          @if (col.key === 'status') {
            <app-pill
              [tone]="c.status === 'voided' ? 'gray' : c.kind === 'reset' ? 'red' : 'green'"
              >{{ text }}</app-pill
            >
          } @else {
            {{ text }}
          }
        </ng-template>
      </app-data-table>

      @if (auth.isSuperAdmin()) {
        <section class="mt-8 rounded-xl border border-red-200 bg-white p-5">
          <h2 class="mb-1 flex items-center gap-2 text-base font-semibold text-red-700">
            <mat-icon>warning</mat-icon> Farozon (superadmin)
          </h2>
          <p class="mb-3 max-w-3xl text-sm text-gray-600">
            Nollställ {{ auth.garage()?.name }}s arbetsdata: artiklar, lagerhändelser och
            däckhotell. Användarna ligger kvar. Allt bokförs och arkiveras först, så inget
            försvinner ur historiken.
          </p>
          <button mat-stroked-button color="warn" (click)="reset()">
            <mat-icon>delete_forever</mat-icon> Nollställ garagets data…
          </button>
        </section>
      }
    </div>
  `,
})
export class Bookkeeping {
  private readonly api = inject(ClosingApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  protected readonly auth = inject(Auth);

  readonly status = signal<ClosingStatusInfo | null>(null);
  readonly closings = signal<Closing[]>([]);
  readonly loading = signal(true);

  code = closingCode;
  day = dayText;
  dateTime = dateTimeText;
  lastDay = (c: Closing) => periodLabel(c.to, c.to).split(' – ')[0];

  readonly accent = (c: Closing) =>
    c.status === 'voided'
      ? 'border-gray-300'
      : c.kind === 'reset'
        ? 'border-red-500'
        : 'border-green-500';

  readonly columns: DtCol<Closing>[] = [
    { key: 'nr', label: 'Nr', value: (c) => c.number, fmt: (c) => closingCode(c.number) },
    { key: 'period', label: 'Period', value: (c) => c.from, fmt: (c) => periodLabel(c.from, c.to) },
    {
      key: 'sales',
      label: 'Försäljning exkl. moms',
      right: true,
      value: (c) => c.summary.inventory.soldRevenue,
      fmt: (c) => kr.transform(c.summary.inventory.soldRevenue),
    },
    {
      key: 'profit',
      label: 'Bruttovinst exkl. moms',
      right: true,
      value: (c) => c.summary.inventory.grossProfit,
      fmt: (c) => kr.transform(c.summary.inventory.grossProfit),
    },
    {
      key: 'stock',
      label: 'Lagervärde ut exkl. moms',
      right: true,
      value: (c) => c.summary.stock.closing.value,
      fmt: (c) => kr.transform(c.summary.stock.closing.value),
    },
    {
      key: 'hotel',
      label: 'Hotellintäkt exkl. moms',
      right: true,
      value: (c) => c.summary.hotel.feesPaid,
      fmt: (c) => kr.transform(c.summary.hotel.feesPaid),
    },
    {
      key: 'by',
      label: 'Bokförd av',
      value: (c) => c.closedByName ?? '',
      fmt: (c) =>
        `${c.closedByName ?? 'okänd'}${c.closedBySuperAdmin ? ' (superadmin)' : ''} · ${dayText(c.closedAt)}`,
    },
    { key: 'status', label: 'Status', value: (c) => statusText(c), fmt: statusText },
  ];

  constructor() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api.status().subscribe((s) => this.status.set(s));
    this.api.list().subscribe({
      next: (p) => {
        this.closings.set(p.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(c: Closing) {
    this.router.navigate(['/bookkeeping', c.id]);
  }

  book(status: ClosingStatusInfo) {
    this.dialog
      .open<BookDialog, ClosingStatusInfo, Closing>(BookDialog, {
        data: status,
        width: '760px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((c) => {
        if (!c) return;
        this.snack.open(`${closingCode(c.number)} är bokförd`, undefined, { duration: 3000 });
        this.router.navigate(['/bookkeeping', c.id]);
      });
  }

  reset() {
    this.dialog
      .open<ResetDialog, void, Closing>(ResetDialog, { width: '760px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((c) => {
        if (!c) return;
        this.snack.open('Garagets data är nollställd och bokförd', undefined, { duration: 4000 });
        this.router.navigate(['/bookkeeping', c.id]);
      });
  }
}
