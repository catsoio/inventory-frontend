import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, of, switchMap, timer } from 'rxjs';
import { ZettleApi } from '../../core/api/zettle-api';
import { appLocale } from '../../core/i18n/locale';
import { PosSale } from '../../core/models';

export interface TillPayData {
  cardId: string;
  cardCode: string;
  /** Vad kortet går på, öre inkl. moms: köpet i kassan måste vara exakt det. */
  total: number;
}

/** Köp äldre än så här (före dialogen öppnades) räknas inte som betalningen. */
const LOOKBACK_MS = 15 * 60 * 1000;
const METHOD: Record<string, string> = { card: 'kort', swish: 'Swish', cash: 'kontant' };

/**
 * Betald i PayPal-kassan, steg för steg: personalen slår in beloppet i PayPal-appen och dialogen
 * läser in köp var fjärde sekund. Ett enda köp med exakt kortets belopp, slaget in nyss, bokför
 * kortet direkt; flera sådana visas så att rätt kan väljas. Kassan registrerar köpet och ger
 * kunden kvittot; kortet blir ett kvitto som hänvisar till det.
 */
@Component({
  selector: 'app-till-pay-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Betalning i PayPal-kassan</h2>
    <mat-dialog-content class="!flex flex-col gap-3 !pt-2">
      <ol class="list-decimal space-y-1 pl-5 text-sm text-gray-700">
        <li>
          Öppna PayPal-appen och slå in <b>{{ data.total | kr }}</b> (en vara eller ett eget
          belopp).
        </li>
        <li>Låt kunden betala där: kort, Swish eller kontant.</li>
        <li>Klart! Köpet hittas här av sig självt och kortet bokförs.</li>
      </ol>

      @if (booking()) {
        <p class="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">Köpet hittades. Bokför…</p>
      } @else if (!matches().length) {
        <p class="text-sm text-gray-600">Väntar på ett köp på {{ data.total | kr }}…</p>
        <mat-progress-bar mode="indeterminate" />
      } @else {
        <p class="text-sm text-gray-700">Flera köp passar. Välj det som hör till kunden:</p>
        <div class="flex flex-col gap-1">
          @for (s of matches(); track s.id) {
            <button
              type="button"
              class="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50"
              [disabled]="booking()"
              (click)="pay(s)"
            >
              <span class="tabular-nums text-gray-500">{{ time(s.soldAt) }}</span>
              <span class="tabular-nums">nr {{ s.number ?? '–' }}</span>
              <span class="min-w-0 flex-1 truncate text-gray-600">{{ goods(s) }}</span>
              <span class="text-gray-500">{{ paid(s) }}</span>
            </button>
          }
        </div>
      }
      @if (error(); as e) {
        <p class="text-sm text-red-700">{{ e }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <span class="flex-1"></span>
      <button mat-button type="button" [disabled]="booking()" mat-dialog-close>Avbryt</button>
    </mat-dialog-actions>
  `,
})
export class TillPayDialog implements OnInit {
  readonly data = inject<TillPayData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<TillPayDialog, boolean>>(MatDialogRef);
  private readonly api = inject(ZettleApi);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly startedAt = Date.now();

  readonly matches = signal<PosSale[]>([]);
  readonly booking = signal(false);
  readonly error = signal('');

  ngOnInit() {
    // Läs in köp och leta matchning var fjärde sekund så länge dialogen är öppen.
    timer(0, 4000)
      .pipe(
        switchMap(() =>
          this.booking()
            ? of(null)
            : this.api.sync().pipe(
                catchError(() => of(null)),
                switchMap(() => this.api.openSales().pipe(catchError(() => of(null)))),
              ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => {
        if (!list || this.booking()) return;
        const cutoff = this.startedAt - LOOKBACK_MS;
        const found = list.filter(
          (s) => s.amount === this.data.total && new Date(s.soldAt).getTime() >= cutoff,
        );
        this.matches.set(found);
        if (found.length === 1) this.pay(found[0]);
      });
  }

  pay(sale: PosSale) {
    this.booking.set(true);
    this.error.set('');
    this.api.payCard(sale.id, this.data.cardId).subscribe({
      next: () => {
        this.snack.open(`${this.data.cardCode} är betalt i kassan och bokfört`, 'OK', {
          duration: 4000,
        });
        this.ref.close(true);
      },
      error: () => {
        this.booking.set(false);
        this.error.set('Kortet kunde inte bokföras. Kontrollera meddelandet och försök igen.');
      },
    });
  }

  goods(s: PosSale) {
    const names = s.rows.map((r) => (r.quantity === 1 ? r.name : `${r.quantity} × ${r.name}`));
    return names.length > 2
      ? `${names.slice(0, 2).join(', ')} +${names.length - 2}`
      : names.join(', ');
  }

  paid(s: PosSale) {
    return s.payments.map((p) => METHOD[p.method] ?? p.label ?? 'annat').join(', ');
  }

  time(iso: string) {
    return new Date(iso).toLocaleString(appLocale(), { hour: '2-digit', minute: '2-digit' });
  }
}
