import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { switchMap, takeWhile, timer } from 'rxjs';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { PublicDocument as PublicDoc } from '../../core/models';

/**
 * Kundens sida för en faktura eller ett kvitto (`/i/<nyckel>`): ingen inloggning, nyckeln i
 * länken är nyckeln. Visar samma dokument som verkstadens "Visa / skriv ut", och kunden kan
 * skriva ut eller spara det som PDF.
 */
@Component({
  selector: 'app-public-document',
  standalone: false,
  host: { class: 'block min-h-dvh bg-gray-50 text-gray-800 print:bg-white' },
  template: `
    @if (error()) {
      <main
        class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center"
      >
        <mat-icon class="!h-14 !w-14 !text-[56px] text-gray-400">link_off</mat-icon>
        <h1 class="mt-4 text-xl font-semibold">Länken gäller inte längre</h1>
        <p class="mt-2 text-gray-600">Hör av dig till verkstaden så får du en ny.</p>
      </main>
    } @else if (doc(); as d) {
      <main class="mx-auto max-w-4xl p-4">
        @if (justPaid() && !d.payment?.paid) {
          <p class="mb-4 rounded-lg bg-teal-50 p-3 text-teal-900 print:hidden">
            Tack! Din betalning har gått igenom och bokförs hos verkstaden nu.
          </p>
        } @else if (d.payment?.paid) {
          <p class="mb-4 rounded-lg bg-teal-50 p-3 text-teal-900 print:hidden">
            <mat-icon class="align-middle">check_circle</mat-icon> Fakturan är betald. Tack!
          </p>
        } @else if (canceled()) {
          <p class="mb-4 rounded-lg bg-amber-50 p-3 text-amber-900 print:hidden">
            Betalningen avbröts. Inget har dragits.
          </p>
        }
        <div class="mb-4 flex flex-wrap items-center justify-end gap-2 print:hidden">
          @if (d.payment?.available) {
            <button mat-flat-button color="primary" [disabled]="paying()" (click)="pay()">
              <mat-icon>credit_card</mat-icon>
              Betala {{ d.document.totals.total | kr }}
              <span class="ml-1 opacity-80"
                >· {{ d.payment!.methods.includes('swish') ? 'kort eller Swish' : 'kort' }}</span
              >
            </button>
          }
          <button mat-stroked-button (click)="print()">
            <mat-icon>print</mat-icon> Skriv ut / spara som PDF
          </button>
        </div>
        @if (payError()) {
          <p class="mb-4 text-right text-sm text-red-700 print:hidden">{{ payError() }}</p>
        }
        <app-invoice-document [doc]="d.document" [meta]="meta(d)" />
      </main>
    } @else {
      <p class="p-6 text-gray-600">Laddar…</p>
    }
  `,
  styles: '@page { size: A4; margin: 12mm; }',
})
export class PublicDocumentPage implements OnInit {
  private readonly api = inject(SalesCardApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';
  readonly doc = signal<PublicDoc | null>(null);
  readonly error = signal(false);
  readonly paying = signal(false);
  readonly payError = signal('');
  /** Kunden kom tillbaka från Stripe efter en genomförd betalning (`?paid=1`). */
  readonly justPaid = signal(this.route.snapshot.queryParamMap.get('paid') === '1');
  readonly canceled = signal(this.route.snapshot.queryParamMap.get('canceled') === '1');

  ngOnInit() {
    this.api.publicDocument(this.token).subscribe({
      next: (d) => {
        this.doc.set(d);
        document.title = `${d.document.kind === 'invoice' ? 'Faktura' : 'Kvitto'} ${(d.document as { code?: string }).code ?? ''}`;
        if (this.justPaid() && !d.payment?.paid) this.waitForBooking();
      },
      error: () => this.error.set(true),
    });
  }

  /** Kunden skickas till Stripes sida; betalningen bokförs när Stripe säger till, inte när kunden kommer tillbaka. */
  pay() {
    this.paying.set(true);
    this.payError.set('');
    this.api.payPublic(this.token).subscribe({
      next: (r) => (window.location.href = r.url),
      error: () => {
        this.paying.set(false);
        this.payError.set('Det gick inte att starta betalningen. Försök igen, eller hör av dig till verkstaden.');
      },
    });
  }

  /** Stripes besked kan komma strax efter att kunden är tillbaka: läs om tills fakturan står som betald. */
  private waitForBooking() {
    timer(2000, 2000)
      .pipe(
        switchMap(() => this.api.publicDocument(this.token)),
        takeWhile((d) => {
          this.doc.set(d);
          return !d.payment?.paid;
        }, true),
        takeWhile((_d, i) => i < 20, true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  meta(d: PublicDoc): [string, string][] {
    return d.regNo ? [['Bil', `${d.regNo} ${d.vehicle ?? ''}`.trim()]] : [];
  }

  print() {
    window.print();
  }
}
