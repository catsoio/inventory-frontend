import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ZettleApi } from '../../core/api/zettle-api';
import { appLocale } from '../../core/i18n/locale';
import { PosSale } from '../../core/models';
import { Confirm } from '../../shared/confirm';

const METHOD: Record<string, string> = { card: 'kort', swish: 'Swish', cash: 'kontant' };

/**
 * Betald i PayPal-kassan: en känd kunds jobb som betalas vid disken. Personalen slår in beloppet i
 * PayPals app (kassan är kassaregistret och ger kunden kvittot) och väljer köpet här; kortet bokförs
 * då som ett kvitto som hänvisar till kassans, momsen räknas en gång och lagret dras en gång. Syns
 * bara när PayPal-kassan är kopplad.
 */
@Component({
  selector: 'app-till-pay',
  standalone: false,
  template: `
    @if (connected()) {
      <div class="mt-4 rounded-lg border border-gray-200 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <mat-icon class="text-gray-500">point_of_sale</mat-icon>
          <span class="font-medium">Betald i PayPal-kassan</span>
          <span class="flex-1"></span>
          <button mat-button type="button" [disabled]="busy()" (click)="refresh()">
            <mat-icon>sync</mat-icon> Hämta köp
          </button>
        </div>
        <p class="mt-1 text-sm text-gray-600">
          Slå in {{ total | kr }} i PayPal-appen och ta betalt där. Tryck Hämta köp och välj köpet:
          kortet bokförs som kvitto och kunden har fått kvittot från kassan.
        </p>
        @if (disabled) {
          <p class="mt-1 text-sm text-gray-500">{{ disabledHint }}</p>
        }
        <div class="mt-2 flex flex-col gap-1">
          @for (s of sales(); track s.id) {
            <button
              type="button"
              class="flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm"
              [class.border-teal-600]="chosen() === s.id"
              [class.bg-teal-50]="chosen() === s.id"
              [class.border-gray-200]="chosen() !== s.id"
              [class.opacity-50]="s.amount !== total"
              [disabled]="disabled || busy() || s.amount !== total"
              (click)="chosen.set(s.id)"
            >
              <span class="tabular-nums text-gray-500">{{ time(s.soldAt) }}</span>
              <span class="tabular-nums">nr {{ s.number ?? '–' }}</span>
              <span class="min-w-0 flex-1 truncate text-gray-600">{{ goods(s) }}</span>
              <span class="text-gray-500">{{ paid(s) }}</span>
              <span class="font-medium tabular-nums">{{ s.amount | kr }}</span>
            </button>
          } @empty {
            <p class="text-sm text-gray-500">
              {{
                loading()
                  ? 'Läser in…'
                  : 'Inga köp i kassan de senaste två dagarna som inte redan betalar ett kort.'
              }}
            </p>
          }
        </div>
        @if (sales().length && !hasMatch()) {
          <p class="mt-2 text-sm text-amber-800">
            Inget köp går på {{ total | kr }}. Slå in exakt det beloppet, eller ändra kortet.
          </p>
        }
        <button
          mat-stroked-button
          type="button"
          class="mt-2"
          [disabled]="disabled || busy() || !chosen()"
          (click)="pay()"
        >
          <mat-icon>receipt_long</mat-icon> Bokför som betald i kassan
        </button>
      </div>
    }
  `,
})
export class TillPay implements OnInit {
  private readonly api = inject(ZettleApi);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);

  @Input({ required: true }) cardId!: string;
  @Input({ required: true }) cardCode!: string;
  /** Vad kortet går på, öre inkl. moms: köpet i kassan måste vara exakt det. */
  @Input({ required: true }) total!: number;
  /** Kortet har osparade ändringar eller kan inte bokföras än. */
  @Input() disabled = false;
  @Input() disabledHint = 'Spara ändringarna först.';
  /** Kortet är bokfört: sidan ska läsa om det. */
  @Output() booked = new EventEmitter<void>();

  readonly connected = signal(false);
  readonly sales = signal<PosSale[]>([]);
  readonly chosen = signal<string | null>(null);
  readonly busy = signal(false);
  readonly loading = signal(false);

  ngOnInit() {
    this.api.status().subscribe((s) => {
      this.connected.set(s.connected);
      if (s.connected) this.load();
    });
  }

  hasMatch() {
    return this.sales().some((s) => s.amount === this.total);
  }

  load() {
    this.loading.set(true);
    this.api.openSales().subscribe({
      next: (list) => {
        this.loading.set(false);
        this.sales.set(list);
        // Förvälj när precis ett köp går på kortets belopp.
        const match = list.filter((s) => s.amount === this.total);
        if (!this.chosen() && match.length === 1) this.chosen.set(match[0].id);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Läser in nya köp från kassan och visar listan igen. */
  refresh() {
    this.busy.set(true);
    this.api.sync().subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
      },
      error: () => {
        this.busy.set(false);
        this.load();
      },
    });
  }

  pay() {
    const sale = this.sales().find((s) => s.id === this.chosen());
    if (!sale) return;
    this.confirm
      .ask({
        title: `Bokför ${this.cardCode} som betald i kassan?`,
        message: `Kortet bokförs som ett kvitto, betalt ${this.paid(sale)} i PayPal-kassan (köp nr ${sale.number ?? '–'}, ${this.time(sale.soldAt)}). Lagret minskas för artiklarna på kortet. Därefter går kortet inte att ändra; ett fel rättas med kreditfaktura och retur i PayPal-appen.`,
        confirmText: 'Bokför',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.payCard(sale.id, this.cardId).subscribe({
          next: () => {
            this.busy.set(false);
            this.snack.open(`${this.cardCode} är betalt i kassan och bokfört`, 'OK', {
              duration: 4000,
            });
            this.booked.emit();
          },
          error: () => {
            this.busy.set(false);
            this.load();
          },
        });
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
    return new Date(iso).toLocaleString(appLocale(), {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
