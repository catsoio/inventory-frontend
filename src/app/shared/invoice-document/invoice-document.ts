import { Component, Input } from '@angular/core';
import { PAYMENT_METHOD_LABELS, WorkOrderInvoice } from '../../core/models';

/**
 * Fakturan (till företag) eller kvittot (till privatpersoner) som A4. Allt på sidan är det
 * som frystes när dokumentet utfärdades (säljare, köpare, rader, summor), så det ser
 * likadant ut vid varje utskrift. Innehållet följer kraven på en faktura i mervärdesskattelagen:
 * löpnummer, datum, säljarens momsreg.nr, namn och adress på båda parter, vad som sålts,
 * pris, rabatt, momssats och momsbelopp. Samma dokument används för arbetsorder och säljkort.
 */
@Component({
  selector: 'app-invoice-document',
  standalone: false,
  template: `
    @if (doc; as inv) {
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
            @for (m of meta; track m[0]) {
              <dt class="text-gray-600">{{ m[0] }}</dt>
              <dd>{{ m[1] }}</dd>
            }
          </dl>
        </section>

        @if (inv.rows?.length) {
          <table class="mt-10 w-full border-collapse">
            <thead>
              <tr class="border-b-2 border-black text-left text-xs tracking-wide uppercase">
                <th class="py-1">Beskrivning</th>
                <th class="w-14 py-1 text-right">Antal</th>
                <th class="w-28 py-1 text-right whitespace-nowrap">À-pris</th>
                <th class="w-16 py-1 text-right">Rabatt</th>
                <th class="w-12 py-1 text-right">Moms</th>
                <th class="w-28 py-1 text-right whitespace-nowrap">Belopp</th>
              </tr>
            </thead>
            <tbody>
              @for (r of inv.rows; track $index) {
                <tr class="border-b border-gray-300 align-top">
                  <td class="py-2">{{ r.description }}</td>
                  <td class="py-2 text-right tabular-nums">{{ r.quantity }}</td>
                  <td class="py-2 text-right tabular-nums">{{ r.unitPrice | kr }}</td>
                  <td class="py-2 text-right tabular-nums">
                    {{ r.discountPercent ? r.discountPercent + ' %' : '' }}
                  </td>
                  <td class="py-2 text-right tabular-nums">{{ r.vatRate }} %</td>
                  <td class="py-2 text-right tabular-nums">{{ r.total | kr }}</td>
                </tr>
              }
              @if (cardDiscount(inv) > 0) {
                <tr class="border-b border-gray-300">
                  <td class="py-2 font-bold" colspan="5">Rabatt</td>
                  <td class="py-2 text-right tabular-nums">−{{ cardDiscount(inv) | kr }}</td>
                </tr>
              }
            </tbody>
          </table>
          <p class="mt-1 text-xs text-gray-600">Priser och belopp är angivna inklusive moms.</p>
          @if (inv.performed) {
            <p class="mt-3 whitespace-pre-line">{{ inv.performed }}</p>
          }
        } @else {
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
        }
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
          <div
            class="mt-1 flex justify-between gap-6 border-t-2 border-black pt-1 text-lg font-bold"
          >
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
    }
  `,
})
export class InvoiceDocument {
  @Input() doc: WorkOrderInvoice | null = null;
  /** Referensrader högst upp till höger, t.ex. ["Arbetsorder", "AO-00002"]. */
  @Input() meta: [string, string][] = [];
  readonly payLabels = PAYMENT_METHOD_LABELS;

  day(iso: string | null) {
    return iso ? new Date(iso).toLocaleDateString('sv-SE') : '–';
  }

  /** Rabatten på hela kortet: radernas summa minus det som ska betalas. */
  cardDiscount(inv: WorkOrderInvoice): number {
    const sum = (inv.rows ?? []).reduce((s, r) => s + r.total, 0);
    return Math.max(0, sum - inv.totals.total);
  }
}
