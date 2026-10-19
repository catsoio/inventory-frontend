import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { PAYMENT_METHOD_LABELS, WorkOrderDetail, WorkOrderInvoice } from '../../../core/models';

/**
 * Fakturan (till företag) eller kvittot (till privatpersoner) för en klar arbetsorder, som A4.
 * Allt på sidan är det som frystes när dokumentet utfärdades (säljare, köpare, summor),
 * så det ser likadant ut vid varje utskrift. Innehållet följer kraven på en faktura i
 * mervärdesskattelagen: löpnummer, datum, säljarens momsreg.nr, namn och adress på båda
 * parter, vad som sålts, pris exkl. moms, rabatt, momssats och momsbelopp.
 */
@Component({
  selector: 'app-work-order-invoice',
  standalone: false,
  template: `
    <div class="mb-4 flex items-center gap-2 print:hidden">
      <a
        mat-button
        [routerLink]="
          document() && !document()!.draft ? ['/finance/invoices', id] : ['/workorders', id]
        "
        ><mat-icon>arrow_back</mat-icon> Tillbaka</a
      >
      <span class="flex-1"></span>
      <button mat-flat-button color="primary" (click)="print()">
        <mat-icon>print</mat-icon> Skriv ut
      </button>
    </div>

    @if (order(); as o) {
      @if (document(); as inv) {
        <article
          class="mx-auto flex min-h-[297mm] max-w-[210mm] flex-col bg-white p-10 text-[13px] leading-snug text-black shadow-sm print:min-h-[272mm] print:max-w-none print:p-0 print:shadow-none"
        >
          <header class="flex items-start justify-between border-b-2 border-black pb-3">
            <div>
              <div class="text-lg font-bold">{{ inv.seller.name }}</div>
            </div>
            <div class="text-right">
              <h1 class="text-3xl font-bold">
                {{ inv.kind === 'invoice' ? 'Faktura' : 'Kvitto' }}
              </h1>
              @if (inv.draft) {
                <div class="mt-1 inline-block border-2 border-[#555] px-2 font-bold uppercase">
                  Utkast – ej bokfört
                </div>
              } @else {
                <div class="text-xl font-bold tabular-nums">{{ inv.code }}</div>
              }
              @if (inv.paidAt) {
                <div class="mt-1 inline-block border-2 border-black px-2 font-bold uppercase">
                  Betald
                </div>
              }
            </div>
          </header>

          <section class="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <div class="text-xs tracking-widest text-gray-600 uppercase">Kund</div>
              @if (inv.buyer.customerCode) {
                <div>Kundnr {{ inv.buyer.customerCode }}</div>
              }
              <div class="font-bold">{{ inv.buyer.name }}</div>
              @if (inv.buyer.address) {
                <div>{{ inv.buyer.address }}</div>
                <div>{{ inv.buyer.postalCode }} {{ inv.buyer.city }}</div>
              }
              @if (inv.buyer.orgNo) {
                <div>Org.nr {{ inv.buyer.orgNo }}</div>
              }
              @if (inv.buyer.vatNumber) {
                <div>Momsreg.nr {{ inv.buyer.vatNumber }}</div>
              }
            </div>
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
              <dt class="text-gray-600">{{ inv.kind === 'invoice' ? 'Fakturadatum' : 'Datum' }}</dt>
              <dd class="tabular-nums">{{ day(inv.issuedAt) }}</dd>
              @if (day(inv.supplyDate) !== day(inv.issuedAt)) {
                <dt class="text-gray-600">Utfört</dt>
                <dd class="tabular-nums">{{ day(inv.supplyDate) }}</dd>
              }
              @if (inv.dueAt) {
                <dt class="text-gray-600">Förfallodatum</dt>
                <dd class="font-bold tabular-nums">{{ day(inv.dueAt) }}</dd>
              }
              <dt class="text-gray-600">Arbetsorder</dt>
              <dd>{{ o.code }}</dd>
              <dt class="text-gray-600">Bil</dt>
              <dd>
                <b>{{ o.regNo }}</b> {{ o.vehicle ?? '' }}
              </dd>
            </dl>
          </section>

          <table class="mt-10 w-full border-collapse">
            <thead>
              <tr class="border-b-2 border-black text-left text-xs tracking-wide uppercase">
                <th class="py-1">Utfört</th>
                <th class="w-44 py-1 text-right whitespace-nowrap">Belopp exkl. moms</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-gray-300 align-top">
                <td class="py-3 whitespace-pre-line">
                  {{ inv.performed || 'Arbete enligt överenskommelse' }}
                </td>
                <td class="py-3 text-right tabular-nums">{{ inv.totals.net | kr }}</td>
              </tr>
            </tbody>
          </table>
          @if (inv.warranty) {
            <p class="mt-3"><b>Garanti:</b> {{ inv.warranty }}</p>
          }

          <section class="mt-4 ml-auto w-full max-w-sm">
            <div class="flex justify-between py-0.5">
              <span>Summa exkl. moms</span
              ><span class="tabular-nums">{{ inv.totals.net | kr }}</span>
            </div>
            @for (b of inv.totals.byRate; track b.rate) {
              <div class="flex justify-between py-0.5 text-gray-700">
                <span>Moms {{ b.rate }} % på {{ b.base | kr }}</span>
                <span class="tabular-nums">{{ b.vat | kr }}</span>
              </div>
            }
            <div class="mt-1 flex justify-between gap-6 border-t-2 border-black pt-1 text-lg font-bold">
              <span>{{ inv.draft ? 'Att betala (utkast)' : 'Att betala' }} inkl. moms</span>
              <span class="tabular-nums">{{ inv.totals.total | kr }}</span>
            </div>
          </section>

          <section class="mt-10 text-xs">
            @if (inv.paidAt) {
              <p>
                Betald {{ day(inv.paidAt)
                }}{{
                  inv.paymentMethod ? ' med ' + payLabels[inv.paymentMethod].toLowerCase() : ''
                }}.
              </p>
            } @else if (inv.seller.paymentDetails) {
              <p>
                Betalning till <b>{{ inv.seller.paymentDetails }}</b
                >. {{ inv.code ? 'Ange ' + inv.code + ' som referens.' : '' }}
              </p>
            }
            @if (inv.seller.footer) {
              <p class="mt-1 text-gray-600">{{ inv.seller.footer }}</p>
            }
          </section>

          <footer
            class="mt-auto grid grid-cols-4 gap-6 border-t-2 border-black pt-3 text-[11px] text-gray-700"
          >
            <div>
              <div class="font-bold text-black">{{ inv.seller.name }}</div>
              <div>{{ inv.seller.address }}</div>
              <div>{{ inv.seller.postalCode }} {{ inv.seller.city }}</div>
            </div>
            <div>
              @if (inv.seller.phone) {
                <div>Tel {{ inv.seller.phone }}</div>
              }
              @if (inv.seller.email) {
                <div>{{ inv.seller.email }}</div>
              }
            </div>
            <div>
              <div>Org.nr {{ inv.seller.orgNo }}</div>
              <div>Momsreg.nr {{ inv.seller.vatNumber }}</div>
              @if (inv.seller.fTax) {
                <div>Godkänd för F-skatt</div>
              }
            </div>
            <div>
              @if (inv.seller.paymentDetails) {
                <div>{{ inv.seller.paymentDetails }}</div>
              }
            </div>
          </footer>
        </article>
      } @else {
        <p class="text-gray-600">{{ error() ?? 'Laddar utkast…' }}</p>
      }
    }
  `,
  styles: '@page { size: A4; margin: 12mm; }',
})
export class WorkOrderInvoicePage implements OnInit {
  private readonly api = inject(WorkOrderApi);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  readonly payLabels = PAYMENT_METHOD_LABELS;
  readonly order = signal<WorkOrderDetail | null>(null);
  /** Det bokförda dokumentet, annars utkastet från förhandsvisningen. */
  readonly document = signal<WorkOrderInvoice | null>(null);
  readonly error = signal<string | null>(null);

  ngOnInit() {
    this.api.get(this.id).subscribe((o) => {
      this.order.set(o);
      if (o.invoice) return this.document.set(o.invoice);
      this.api.invoicePreview(this.id).subscribe({
        next: (d) => this.document.set(d),
        error: (e) => this.error.set(e?.error?.message ?? 'Kunde inte skapa utkastet.'),
      });
    });
  }

  day(iso: string | null) {
    return iso ? new Date(iso).toLocaleDateString('sv-SE') : '–';
  }

  print() {
    window.print();
  }
}
