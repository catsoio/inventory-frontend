import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import {
  PAYMENT_METHOD_LABELS,
  WORK_ORDER_LINE_LABELS,
  WorkOrderDetail,
} from '../../../core/models';

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
      <a mat-button [routerLink]="['/workorders', id]"><mat-icon>arrow_back</mat-icon> Tillbaka</a>
      <span class="flex-1"></span>
      <button mat-flat-button color="primary" (click)="print()">
        <mat-icon>print</mat-icon> Skriv ut
      </button>
    </div>

    @if (order(); as o) {
      @if (o.invoice; as inv) {
        <article
          class="mx-auto max-w-[210mm] bg-white p-8 text-[13px] leading-snug text-black shadow-sm print:max-w-none print:p-0 print:shadow-none"
        >
          <header class="flex items-start justify-between border-b-2 border-black pb-3">
            <div>
              <div class="text-lg font-bold">{{ inv.seller.name }}</div>
              <div>{{ inv.seller.address }}</div>
              <div>{{ inv.seller.postalCode }} {{ inv.seller.city }}</div>
              @if (inv.seller.phone) {
                <div>Tel {{ inv.seller.phone }}</div>
              }
              @if (inv.seller.email) {
                <div>{{ inv.seller.email }}</div>
              }
            </div>
            <div class="text-right">
              <h1 class="text-3xl font-bold">{{ inv.kind === 'invoice' ? 'Faktura' : 'Kvitto' }}</h1>
              <div class="text-xl font-bold tabular-nums">{{ inv.code }}</div>
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
              <dt class="text-gray-600">Org.nr</dt>
              <dd>{{ inv.seller.orgNo }}</dd>
              <dt class="text-gray-600">Momsreg.nr</dt>
              <dd>{{ inv.seller.vatNumber }}</dd>
              @if (inv.seller.fTax) {
                <dt class="text-gray-600">Skatt</dt>
                <dd>Godkänd för F-skatt</dd>
              }
            </dl>
          </section>

          <table class="mt-6 w-full border-collapse">
            <thead>
              <tr class="border-b-2 border-black text-left text-xs tracking-wide uppercase">
                <th class="py-1">Beskrivning</th>
                <th class="w-16 py-1 text-right">Antal</th>
                <th class="w-24 py-1 text-right">À-pris exkl. moms</th>
                <th class="w-14 py-1 text-right">Rabatt</th>
                <th class="w-14 py-1 text-right">Moms</th>
                <th class="w-24 py-1 text-right">Summa exkl. moms</th>
              </tr>
            </thead>
            <tbody>
              @for (l of o.lines; track l.id) {
                <tr class="border-b border-gray-300 align-top">
                  <td class="py-1.5">
                    {{ l.description }}
                    <span class="text-xs text-gray-500">({{ lineLabels[l.type] }})</span>
                  </td>
                  <td class="py-1.5 text-right tabular-nums">{{ l.quantity }}</td>
                  <td class="py-1.5 text-right tabular-nums">{{ l.unitPrice | kr }}</td>
                  <td class="py-1.5 text-right tabular-nums">
                    {{ l.discountPercent ? l.discountPercent + ' %' : '' }}
                  </td>
                  <td class="py-1.5 text-right tabular-nums">{{ l.vatRate }} %</td>
                  <td class="py-1.5 text-right tabular-nums">{{ l.total | kr }}</td>
                </tr>
              }
            </tbody>
          </table>

          <section class="mt-4 ml-auto max-w-xs">
            <div class="flex justify-between py-0.5">
              <span>Summa exkl. moms</span><span class="tabular-nums">{{ inv.totals.net | kr }}</span>
            </div>
            @for (b of inv.totals.byRate; track b.rate) {
              <div class="flex justify-between py-0.5 text-gray-700">
                <span>Moms {{ b.rate }} % på {{ b.base | kr }}</span>
                <span class="tabular-nums">{{ b.vat | kr }}</span>
              </div>
            }
            <div class="mt-1 flex justify-between border-t-2 border-black pt-1 text-lg font-bold">
              <span>Att betala inkl. moms</span>
              <span class="tabular-nums">{{ inv.totals.total | kr }}</span>
            </div>
          </section>

          <section class="mt-8 text-xs">
            @if (inv.paidAt) {
              <p>
                Betald {{ day(inv.paidAt) }}{{ inv.paymentMethod ? ' med ' + payLabels[inv.paymentMethod].toLowerCase() : '' }}.
              </p>
            } @else if (inv.seller.paymentDetails) {
              <p>
                Betalning till <b>{{ inv.seller.paymentDetails }}</b
                >. Ange {{ inv.code }} som referens.
              </p>
            }
            @if (inv.seller.footer) {
              <p class="mt-1 text-gray-600">{{ inv.seller.footer }}</p>
            }
          </section>
        </article>
      } @else {
        <p class="text-gray-600">Ordern har ingen faktura än.</p>
      }
    }
  `,
})
export class WorkOrderInvoicePage implements OnInit {
  private readonly api = inject(WorkOrderApi);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  readonly lineLabels = WORK_ORDER_LINE_LABELS;
  readonly payLabels = PAYMENT_METHOD_LABELS;
  readonly order = signal<WorkOrderDetail | null>(null);

  ngOnInit() {
    this.api.get(this.id).subscribe((o) => this.order.set(o));
  }

  day(iso: string | null) {
    return iso ? new Date(iso).toLocaleDateString('sv-SE') : '–';
  }

  print() {
    window.print();
  }
}
