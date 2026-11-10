import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AxleApi } from '../../../core/api/axle-api';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { appLocale } from '../../../core/i18n/locale';
import {
  CustomerDetail,
  SellerDetails,
  WorkOrderDetail,
  WorkOrderLine,
} from '../../../core/models';
import { Pricing } from '../../../core/pricing';

/**
 * Följesedeln (Business Centrals bokförda serviceutleverans): det som lämnas med bilen när den
 * hämtas och arbetet betalas senare mot faktura, t.ex. ett företags chaufför. Den säger vad som
 * gjorts på bilen och vem som tog emot den, men är ingen faktura: inga priser som standard, ingen
 * moms och inga betalningsuppgifter. Den som hämtar skriver under; verkstaden behåller ett ex.
 */
@Component({
  selector: 'app-work-order-delivery-note',
  standalone: false,
  template: `
    <div class="mb-4 flex flex-wrap items-center gap-3 print:hidden">
      <a mat-button [routerLink]="['/workorders', id]"><mat-icon>arrow_back</mat-icon> Tillbaka</a>
      <span class="flex-1"></span>
      <mat-slide-toggle [checked]="showAmounts()" (change)="showAmounts.set($event.checked)">
        Visa belopp
      </mat-slide-toggle>
      <button mat-flat-button color="primary" (click)="print()">
        <mat-icon>print</mat-icon> Skriv ut
      </button>
    </div>

    @if (order(); as o) {
      <article
        class="mx-auto max-w-[210mm] bg-white p-8 text-[13px] leading-snug text-[#4b5563] shadow-sm print:max-w-none print:p-0 print:shadow-none [print-color-adjust:exact]"
      >
        <header class="flex items-start justify-between border-b-2 border-[#4b5563] pb-3">
          <div>
            <div class="text-lg font-bold">{{ seller()?.name || '' }}</div>
            @if (seller(); as s) {
              <div>{{ s.address }}, {{ s.postalCode }} {{ s.city }}</div>
              @if (s.phone) {
                <div>Tel {{ s.phone }}</div>
              }
            }
          </div>
          <div class="text-right">
            <h1 class="text-3xl font-bold">Följesedel</h1>
            <div class="text-xl font-bold tabular-nums">{{ o.code }}</div>
            <div>{{ day(o.doneAt ?? o.pickupAt ?? o.receivedAt) }}</div>
          </div>
        </header>

        <section class="mt-4 grid grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <div class="text-xs tracking-widest text-gray-600 uppercase">Kund</div>
            <div class="font-bold">{{ o.customerName }}</div>
            @if (customer(); as c) {
              @if (c.address) {
                <div>{{ c.address }}</div>
                <div>{{ c.postalCode }} {{ c.city }}</div>
              }
              @if (c.type === 'company' && c.orgNo) {
                <div>Org.nr {{ c.orgNo }}</div>
              }
            }
          </div>
          <dl class="grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-0.5">
            <dt class="text-gray-600">Bil</dt>
            <dd>
              <b>{{ o.regNo }}</b> {{ o.vehicle }}
            </dd>
            @if (pricing.value().showMileage && o.mileage != null) {
              <dt class="text-gray-600">Mätarställning</dt>
              <dd class="tabular-nums">{{ o.mileage }} km</dd>
            }
            @if (o.yourReference) {
              <dt class="text-gray-600">Er referens</dt>
              <dd>{{ o.yourReference }}</dd>
            }
            @if (o.ourReference) {
              <dt class="text-gray-600">Vår referens</dt>
              <dd>{{ o.ourReference }}</dd>
            }
          </dl>
        </section>

        <table class="mt-8 w-full border-collapse">
          <thead>
            <tr class="border-b-2 border-[#4b5563] text-left text-xs tracking-wide uppercase">
              <th class="py-1">Utfört arbete och delar</th>
              <th class="w-20 py-1 text-right">Antal</th>
              @if (showAmounts()) {
                <th class="w-32 py-1 text-right whitespace-nowrap">Belopp</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (g of groups(o); track $index) {
              @if (g.title) {
                <tr>
                  <td class="pt-3 pb-1 font-bold" [attr.colspan]="showAmounts() ? 3 : 2">
                    {{ g.title }}
                  </td>
                </tr>
              }
              @for (l of g.lines; track l.id) {
                <tr class="border-b border-gray-300 align-top">
                  <td class="py-1.5" [class.pl-4]="!!g.title">
                    {{ l.description }}
                    @if (l.noCharge) {
                      <span class="text-gray-600">(ingen debitering)</span>
                    }
                  </td>
                  <td class="py-1.5 text-right tabular-nums">{{ l.quantity }}</td>
                  @if (showAmounts()) {
                    <td class="py-1.5 text-right tabular-nums">
                      {{ o.amounts?.[l.id] ?? 0 | kr }}
                    </td>
                  }
                </tr>
              }
            } @empty {
              <tr>
                <td colspan="3" class="py-4 text-gray-500">Inga rader.</td>
              </tr>
            }
          </tbody>
        </table>

        @if (showAmounts()) {
          <div class="mt-3 ml-auto flex max-w-sm justify-between border-t-2 border-[#4b5563] pt-1">
            <span class="font-bold">Att faktureras inkl. moms</span>
            <span class="font-bold tabular-nums">{{ o.total | kr }}</span>
          </div>
        }

        @if (o.performed) {
          <p class="mt-4 whitespace-pre-line">{{ o.performed }}</p>
        }
        @if (o.warranty) {
          <p class="mt-2"><b>Garanti:</b> {{ o.warranty }}</p>
        }

        <p class="mt-6">
          @if (customer()?.collectiveInvoice) {
            Arbetet faktureras {{ o.customerName }} på samlingsfaktura för månaden. Ingen betalning
            vid hämtning.
          } @else {
            Arbetet faktureras {{ o.customerName }}. Ingen betalning vid hämtning.
          }
        </p>

        <section class="mt-10">
          <div class="text-xs font-bold tracking-widest text-gray-600 uppercase">
            Fordonet och arbetet ovan mottaget
          </div>
          <div class="mt-10 grid grid-cols-3 gap-8 text-xs text-gray-600">
            <div class="border-t border-[#4b5563] pt-1">Underskrift</div>
            <div class="border-t border-[#4b5563] pt-1">Namnförtydligande</div>
            <div class="border-t border-[#4b5563] pt-1">Datum</div>
          </div>
        </section>

        @if (seller(); as s) {
          <footer class="mt-12 border-t border-[#9ca3af] pt-2 text-[11px] text-[#4b5563]">
            {{ s.name }} · Org.nr {{ s.orgNo }}
            @if (s.email) {
              · {{ s.email }}
            }
            · Följesedeln är ingen faktura.
          </footer>
        }
      </article>
    }
  `,
})
export class WorkOrderDeliveryNote implements OnInit {
  private readonly api = inject(WorkOrderApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly axle = inject(AxleApi);
  readonly pricing = inject(Pricing);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;

  readonly order = signal<WorkOrderDetail | null>(null);
  readonly customer = signal<CustomerDetail | null>(null);
  readonly seller = signal<SellerDetails | null>(null);
  /** Priser hör till fakturan; följesedeln visar dem bara när verkstaden vill. */
  readonly showAmounts = signal(false);

  ngOnInit() {
    this.api.get(this.id).subscribe((o) => {
      this.order.set(o);
      this.workshop
        .customer(o.customerId)
        .pipe(catchError(() => of(null)))
        .subscribe((c) => this.customer.set(c));
    });
    this.axle
      .seller()
      .pipe(catchError(() => of(null)))
      .subscribe((s) => this.seller.set(s));
  }

  /**
   * Raderna under sina jobb (jobbets text som rubrik), sedan raderna utan jobb. Systemets rad
   * (förbrukningsmaterial) är en avgift, inte utfört arbete, och skrivs inte ut.
   */
  groups(o: WorkOrderDetail): { title: string; lines: WorkOrderLine[] }[] {
    const lines = o.lines.filter((l) => !l.system);
    const jobs = o.jobs ?? [];
    const ids = new Set(jobs.map((j) => j.id));
    return [
      ...jobs.map((j) => {
        const mine = lines.filter((l) => l.jobId === j.id);
        // Ett jobb vars enda rad heter som jobbet behöver ingen rubrik.
        const plain = mine.length === 1 && mine[0].description.trim() === j.title.trim();
        return { title: plain ? '' : j.title, lines: mine };
      }),
      { title: '', lines: lines.filter((l) => !l.jobId || !ids.has(l.jobId)) },
    ].filter((g) => g.lines.length);
  }

  day(iso: string | null | undefined) {
    return iso ? new Date(iso).toLocaleDateString(appLocale()) : '–';
  }

  print() {
    window.print();
  }
}
