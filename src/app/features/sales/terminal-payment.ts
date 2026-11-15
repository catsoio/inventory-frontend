import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  isDevMode,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, takeWhile, timer } from 'rxjs';
import { PaymentApi } from '../../core/api/payment-api';
import { ZettleApi } from '../../core/api/zettle-api';
import { PaymentRow, ZettleTerminalLink } from '../../core/models';

/** Vad terminalen säger att den gör (Zettles ord), som personalen vill läsa det. */
export function terminalProgressText(progress: string | null | undefined): string {
  switch (progress) {
    case 'PRESENT_CARD':
      return 'Be kunden blippa eller sätta i kortet på terminalen.';
    case 'CARD_PRESENTED':
    case 'AUTHORIZING':
      return 'Godkänner betalningen…';
    case 'PAYMENT_APP_LIST':
    case 'SELECTING_PAYMENT_APP':
      return 'Kunden väljer kort på terminalen.';
    case 'READER_UPDATING':
    case 'READER_REBOOTING':
    case 'UPDATE_FAILED':
      return 'Terminalen uppdaterar sig. Det kan ta en stund.';
    default:
      return 'Väntar på terminalen…';
  }
}

/**
 * Kort på PayPal-terminalen, startat från Axle: skickar kortets belopp till terminalen, väntar på
 * att kunden blippar och säger till när betalningen är bokförd. Ett utkast blir ett kvitto, en
 * obetald faktura markeras betald. Medan terminalen väntar går kortet inte att ändra eller bokföra
 * på annat sätt. Syns bara när kassan är ansluten och en terminal är kopplad (Inställningar →
 * Anslutningar → PayPal-kassan).
 */
@Component({
  selector: 'app-terminal-payment',
  standalone: false,
  template: `
    @if (ready() && (showStart || waiting() || error() || unbooked())) {
      <div class="mt-4 rounded-lg border border-gray-200 p-3">
        <div class="flex flex-wrap items-center gap-3">
          <mat-icon class="text-gray-500">credit_card</mat-icon>
          <span class="font-medium">Kort på terminalen</span>
          @if (waiting(); as p) {
            <span class="text-sm text-gray-600">{{ progressText(p) }}</span>
            <button mat-stroked-button type="button" [disabled]="canceling()" (click)="cancel(p)">
              Avbryt
            </button>
          } @else {
            @if (links().length > 1) {
              <mat-form-field subscriptSizing="dynamic" class="w-48">
                <mat-label>Terminal</mat-label>
                <mat-select [value]="linkId()" (selectionChange)="linkId.set($event.value)">
                  @for (l of links(); track l.id) {
                    <mat-option [value]="l.id">{{
                      l.name || l.serialNumber || 'Terminal'
                    }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
            @if (showStart) {
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="disabled || busy() || !linkId()"
                (click)="start()"
              >
                Ta betalt på terminalen
              </button>
            }
            @if (showStart && disabled) {
              <span class="text-sm text-gray-500">{{ disabledHint }}</span>
            }
          }
        </div>
        @if (waiting(); as p) {
          <mat-progress-bar class="mt-3" mode="indeterminate" />
          @if (dev) {
            <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>Test (låtsasterminal):</span>
              <button mat-button type="button" (click)="devTap(p, 'tap')">Kunden blippar</button>
              <button mat-button type="button" (click)="devTap(p, 'decline')">Banken nekar</button>
              <button mat-button type="button" (click)="devTap(p, 'lose')">Kontakten bryts</button>
            </div>
          }
        }
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
export class TerminalPayment implements OnInit {
  private readonly zettle = inject(ZettleApi);
  private readonly api = inject(PaymentApi);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) cardId!: string;
  /** Kortet har osparade ändringar (beloppet på terminalen skulle bli fel) eller kan inte bokföras än. */
  @Input() disabled = false;
  /** Falskt när knappen ligger någon annanstans (kortets huvud) och komponenten bara visar läget. */
  @Input() showStart = true;
  /** Varför knappen är avstängd. */
  @Input() disabledHint = 'Spara ändringarna först.';
  /** Vad ett utkast blir när kunden betalat. Utan värde avgör servern. */
  @Input() document?: 'invoice' | 'receipt';
  /** Kortet är bokfört: sidan ska läsa om det. */
  @Output() booked = new EventEmitter<void>();
  /** En betalning väntar på terminalen (sant) eller är klar (falskt): kortet ska inte ändras under tiden. */
  @Output() waitingChange = new EventEmitter<boolean>();

  readonly dev = isDevMode();
  readonly ready = signal(false);
  readonly links = signal<ZettleTerminalLink[]>([]);
  readonly linkId = signal('');
  readonly payments = signal<PaymentRow[]>([]);
  readonly busy = signal(false);
  readonly canceling = signal(false);
  readonly error = signal('');

  /** Betalningen som väntar på terminalen, om någon. */
  readonly waiting = () =>
    this.payments().find((p) => p.channel === 'terminal' && p.status === 'pending') ?? null;
  /** Pengarna är inne men kortet kunde inte bokföras. */
  readonly unbooked = () =>
    this.payments().find(
      (p) => p.channel === 'terminal' && p.status === 'succeeded' && p.receipt === 'failed',
    ) ?? null;

  progressText(p: PaymentRow) {
    return terminalProgressText(p.progress);
  }

  ngOnInit() {
    this.zettle.terminals().subscribe({
      next: (s) => {
        this.links.set(s.links);
        this.linkId.set(s.links[0]?.id ?? '');
        this.ready.set(s.connected && s.links.length > 0);
        if (this.ready()) this.watch();
      },
      error: () => this.ready.set(false),
    });
  }

  /** Skickar kortets belopp till terminalen (anropas också från kortets huvud). */
  start() {
    this.busy.set(true);
    this.error.set('');
    this.zettle.payOnTerminal(this.cardId, this.linkId(), this.document).subscribe({
      next: () => {
        this.busy.set(false);
        this.watch();
      },
      error: () => this.busy.set(false),
    });
  }

  cancel(p: PaymentRow) {
    this.canceling.set(true);
    this.zettle.cancelTerminalPayment(p.id).subscribe({
      next: () => this.canceling.set(false),
      error: () => this.canceling.set(false),
    });
  }

  retry(p: PaymentRow) {
    this.api.retry(p.id).subscribe((r) => {
      this.watch();
      if (r.receipt === 'done') this.booked.emit();
    });
  }

  devTap(p: PaymentRow, outcome: 'tap' | 'decline' | 'lose') {
    this.zettle.devTerminal(p.id, outcome).subscribe();
  }

  /** Följer kortets betalningar tills inget längre väntar på terminalen. */
  private watch() {
    timer(0, 1500)
      .pipe(
        switchMap(() => this.api.forCard(this.cardId)),
        takeWhile((rows) => {
          this.payments.set(rows);
          const waiting = rows.some((p) => p.channel === 'terminal' && p.status === 'pending');
          this.waitingChange.emit(waiting);
          return waiting;
        }, true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        complete: () => {
          const latest = this.payments()[0];
          if (latest?.channel !== 'terminal') return;
          if (latest.status === 'succeeded' && latest.receipt === 'done') this.booked.emit();
          if (latest.status === 'failed') {
            this.error.set(latest.failureReason ?? 'Betalningen gick inte igenom.');
          }
          if (latest.status === 'canceled') this.error.set('Betalningen avbröts.');
        },
      });
  }
}
