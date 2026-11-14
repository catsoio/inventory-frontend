import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, switchMap, takeWhile, timer } from 'rxjs';
import { PaymentApi } from '../../core/api/payment-api';
import { PaymentReader, PaymentRow } from '../../core/models';

/**
 * Kort på kortläsare: skickar kortets belopp till läsaren, väntar på att kunden knackar eller
 * sätter i kortet och säger till när betalningen är bokförd. Ett utkast blir ett kvitto (via
 * kassaregistret) eller, med `document="invoice"` och alltid där allt faktureras, en
 * kontantfaktura. En obetald faktura markeras betald. Medan läsaren väntar går kortet inte att
 * ändra eller bokföra på annat sätt. Syns bara när Stripe är kopplat och en läsare är registrerad.
 */
@Component({
  selector: 'app-reader-payment',
  standalone: false,
  template: `
    @if (ready()) {
      <div class="mt-4 rounded-lg border border-gray-200 p-3">
        <div class="flex flex-wrap items-center gap-3">
          <mat-icon class="text-gray-500">contactless</mat-icon>
          <span class="font-medium">Kort på läsare</span>
          @if (waiting(); as p) {
            <span class="text-sm text-gray-600"
              >Väntar på kunden… be dem knacka eller sätta i kortet.</span
            >
            <button mat-stroked-button type="button" (click)="cancel(p)">Avbryt</button>
          } @else {
            @if (readers().length > 1) {
              <mat-form-field subscriptSizing="dynamic" class="w-48">
                <mat-label>Läsare</mat-label>
                <mat-select [value]="readerId()" (selectionChange)="readerId.set($event.value)">
                  @for (r of readers(); track r.id) {
                    <mat-option [value]="r.id"
                      >{{ r.label }}{{ r.status === 'online' ? '' : ' (offline)' }}</mat-option
                    >
                  }
                </mat-select>
              </mat-form-field>
            }
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="disabled || busy() || !readerId()"
              (click)="start()"
            >
              Ta betalt på läsaren
            </button>
            @if (disabled) {
              <span class="text-sm text-gray-500">{{ disabledHint }}</span>
            }
          }
        </div>
        @if (error(); as e) {
          <p class="mt-2 text-sm text-red-700">{{ e }}</p>
        }
        @if (unbooked(); as u) {
          <p class="mt-2 text-sm text-red-700">
            Betalningen på {{ u.amount | kr }} är mottagen men kunde inte bokföras:
            {{ u.receiptError }}
            <button mat-button type="button" (click)="retry(u)">Försök igen</button>
          </p>
        }
      </div>
    }
  `,
})
export class ReaderPayment implements OnInit {
  private readonly api = inject(PaymentApi);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) cardId!: string;
  /** Kortet har osparade ändringar (beloppet på läsaren skulle bli fel) eller kan inte bokföras än. */
  @Input() disabled = false;
  /** Varför knappen är avstängd. */
  @Input() disabledHint = 'Spara ändringarna först.';
  /** Vad ett utkast blir när kunden betalat: kvitto eller kontantfaktura. Utan värde avgör servern. */
  @Input() document?: 'invoice' | 'receipt';
  /** Kortet är bokfört: sidan ska läsa om det. */
  @Output() booked = new EventEmitter<void>();
  /** En betalning väntar på läsaren (sant) eller är klar (falskt): kortet ska inte ändras under tiden. */
  @Output() waitingChange = new EventEmitter<boolean>();

  readonly ready = signal(false);
  readonly readers = signal<PaymentReader[]>([]);
  readonly readerId = signal('');
  readonly payments = signal<PaymentRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');

  /** Betalningen som väntar på läsaren, om någon. */
  readonly waiting = () =>
    this.payments().find((p) => p.channel === 'reader' && p.status === 'pending') ?? null;
  /** Pengarna är inne men kvittot kunde inte utfärdas. */
  readonly unbooked = () =>
    this.payments().find((p) => p.status === 'succeeded' && p.receipt === 'failed') ?? null;

  ngOnInit() {
    forkJoin({ account: this.api.account(), readers: this.api.readers() }).subscribe({
      next: ({ account, readers }) => {
        this.readers.set(readers);
        this.readerId.set((readers.find((r) => r.status === 'online') ?? readers[0])?.id ?? '');
        this.ready.set(account.ready && readers.length > 0);
        if (this.ready()) this.watch();
      },
      error: () => this.ready.set(false),
    });
  }

  start() {
    this.busy.set(true);
    this.error.set('');
    this.api.startReader(this.cardId, this.readerId(), this.document).subscribe({
      next: () => {
        this.busy.set(false);
        this.watch();
      },
      error: () => this.busy.set(false),
    });
  }

  cancel(p: PaymentRow) {
    this.api.cancel(p.id).subscribe(() => this.watch());
  }

  retry(p: PaymentRow) {
    this.api.retry(p.id).subscribe((r) => {
      this.watch();
      if (r.receipt === 'done') this.booked.emit();
    });
  }

  /** Följer kortets betalningar tills inget längre väntar på läsaren. */
  private watch() {
    timer(0, 1500)
      .pipe(
        switchMap(() => this.api.forCard(this.cardId)),
        takeWhile((rows) => {
          this.payments.set(rows);
          const waiting = rows.some((p) => p.channel === 'reader' && p.status === 'pending');
          this.waitingChange.emit(waiting);
          return waiting;
        }, true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        complete: () => {
          const latest = this.payments()[0];
          if (latest?.status === 'succeeded' && latest.receipt === 'done') this.booked.emit();
          if (latest?.status === 'failed') {
            this.error.set(latest.failureReason ?? 'Betalningen gick inte igenom.');
          }
        },
      });
  }
}
