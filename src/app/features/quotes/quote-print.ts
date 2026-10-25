import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { InventoryApi } from '../../core/api/inventory-api';
import { QuoteApi } from '../../core/api/quote-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import { appLocale } from '../../core/i18n/locale';
import { Customer, SellerDetails, VehicleDetail, QuoteDetail, QuoteLine } from '../../core/models';
import { Pricing, quoteTermsText } from '../../core/pricing';

/**
 * Kostnadsförslaget till kunden som A4, uppställt som en verkstads förslag: kund och bil
 * överst, ett block per kundanmärkning med åtgärder och delar (kod, antal, à-pris, rabatt,
 * totalt) och delsumma, sedan förbrukningsmaterial, moms, öresutjämning och villkoren.
 * Kunden ser inga timmar: arbete står med ett pris per åtgärd.
 */
@Component({
  selector: 'app-quote-print',
  standalone: false,
  template: `
    <div class="mb-4 flex items-center gap-2 print:hidden">
      <a mat-button [routerLink]="['/quotes', id]"><mat-icon>arrow_back</mat-icon> Tillbaka</a>
      <span class="flex-1"></span>
      <button mat-flat-button color="primary" (click)="print()">
        <mat-icon>print</mat-icon> Skriv ut
      </button>
    </div>

    @if (order(); as o) {
      <article
        class="mx-auto flex min-h-[297mm] max-w-[210mm] flex-col bg-white p-10 text-[13px] leading-snug text-[#374151] shadow-sm print:min-h-[272mm] print:max-w-none print:p-0 print:shadow-none [print-color-adjust:exact]"
      >
        <header class="grid grid-cols-2 gap-8">
          <div>
            <div class="text-lg font-bold">{{ seller()?.name }}</div>
            @if (seller()?.city) {
              <div>Verkstad, {{ seller()!.city }}</div>
            }
          </div>
          <div>
            <h1 class="text-2xl font-bold">Kostnadsförslag</h1>
            <div class="flex gap-6">
              <span>Datum</span><span class="tabular-nums">{{ day(date(o)) }}</span>
            </div>
            @if (o.validUntil) {
              <div class="flex gap-6">
                <span>Giltigt till</span><span class="tabular-nums">{{ day(o.validUntil) }}</span>
              </div>
            }
          </div>
        </header>

        <section class="mt-6 grid grid-cols-2 gap-8">
          <dl class="grid grid-cols-[auto_1fr] content-start gap-x-6 gap-y-0.5">
            <dt>Förslagsnr</dt>
            <dd class="tabular-nums">{{ o.code }}</dd>
            <dt>Er referens</dt>
            <dd>{{ o.yourReference }}</dd>
            <dt>Vår referens</dt>
            <dd>{{ o.ourReference }}</dd>
            <dt>Märke/modell</dt>
            <dd>{{ o.vehicle }}</dd>
            @if (firstReg()) {
              <dt>1:a reg.datum</dt>
              <dd class="tabular-nums">{{ firstReg() }}</dd>
            }
            <dt>Reg.nr</dt>
            <dd class="font-bold">{{ o.regNo }}</dd>
            @if (pricing.value().showVin && vehicle()?.vin) {
              <dt>Chassinr</dt>
              <dd class="tabular-nums">{{ vehicle()!.vin }}</dd>
            }
            @if (pricing.value().showMileage && o.mileage != null) {
              <dt>Mätarställning</dt>
              <dd class="tabular-nums">{{ o.mileage }}</dd>
            }
          </dl>
          <div>
            <div class="flex gap-6">
              <span class="font-bold">Kund</span>
              <span class="tabular-nums">{{ customer()?.code }}</span>
            </div>
            <div class="font-bold uppercase">{{ o.customerName }}</div>
            @if (customer()?.address) {
              <div>{{ customer()!.address }}</div>
              <div>{{ customer()!.postalCode }} {{ customer()!.city }}</div>
            }
          </div>
        </section>

        <table class="mt-8 w-full border-collapse font-mono text-[12px]">
          <thead class="font-sans text-[13px]">
            <tr class="border-b border-[#374151] text-left">
              <th class="py-1">Beskrivning</th>
              <th class="w-16 py-1 text-right">Antal</th>
              <th class="w-24 py-1 text-right">À-pris</th>
              <th class="w-16 py-1 text-right">Rab%</th>
              <th class="w-28 py-1 text-right">Totalt</th>
            </tr>
          </thead>
          <tbody>
            @if (o.remarks) {
              <tr>
                <td colspan="5" class="pt-3 uppercase">Kund anm: {{ o.remarks }}</td>
              </tr>
            }
            @for (j of o.jobs; track j.id) {
              @for (l of rowsOf(o, j.id); track l.id) {
                <ng-container
                  *ngTemplateOutlet="rowTpl; context: { $implicit: l, fixed: j.fixedPrice != null }"
                />
              }
              <tr>
                <td colspan="4" class="text-right font-sans text-gray-600">
                  {{ j.fixedPrice != null ? 'Fast pris' : '' }}
                </td>
                <td class="border-t border-[#374151] text-right tabular-nums">
                  {{ num(o.jobTotals[j.id] ?? 0) }}
                </td>
              </tr>
            }
            @for (l of rowsOf(o, null); track l.id) {
              <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: l, fixed: false }" />
            }
          </tbody>
        </table>

        <section class="mt-8 font-mono text-[12px]">
          @for (b of o.totals.byRate; track b.rate) {
            <div class="grid grid-cols-[1fr_auto_auto_auto] gap-6">
              <span>Moms {{ b.rate }} %</span>
              <span class="text-right tabular-nums">{{ num(b.base) }} +Moms</span>
              <span class="text-right tabular-nums">{{ num(b.vat) }} =</span>
              <span class="w-28 text-right font-bold tabular-nums">{{ num(b.base + b.vat) }}</span>
            </div>
          }
          @if (o.totals.rounding) {
            <div class="mt-6 flex justify-between">
              <span class="pl-36">Öresutjämning</span>
              <span class="w-28 text-right tabular-nums">{{ num(o.totals.rounding) }}</span>
            </div>
          }
        </section>

        <p class="mt-10 ml-auto max-w-sm text-[12px] font-bold">{{ terms() }}</p>

        <div class="mt-8 ml-auto flex w-full max-w-sm justify-between text-base font-bold">
          <span>Totalt</span>
          <span class="tabular-nums">{{ num(o.totals.total) }} SEK</span>
        </div>
        <p class="mt-1 ml-auto max-w-sm text-xs text-gray-600">
          Priser angivna {{ o.pricesIncludeVat ? 'inklusive' : 'exklusive' }} moms. Totalt att
          betala inklusive moms.
        </p>

        @if (o.approval; as a) {
          <p class="mt-6 text-sm font-bold">
            {{ a.status === 'approved' ? 'Godkänt av kunden' : 'Nekat av kunden' }}
            {{ day(a.at) }}.
          </p>
        } @else {
          <section class="mt-8 text-xs">
            <div class="font-bold">Jag godkänner kostnadsförslaget</div>
            <div class="mt-6 grid grid-cols-2 gap-10">
              <div class="border-t border-[#374151] pt-1">Underskrift</div>
              <div class="border-t border-[#374151] pt-1">Datum</div>
            </div>
          </section>
        }

        <footer class="mt-auto border-t border-[#374151] pt-3 text-[11px]">
          @if (seller(); as s) {
            {{ s.name }} · {{ s.address }}, {{ s.postalCode }} {{ s.city }}
            @if (s.phone) {
              · Tel {{ s.phone }}
            }
            · Org.nr {{ s.orgNo }}
          }
        </footer>
      </article>

      <ng-template #rowTpl let-l let-fixed="fixed">
        <tr class="align-top">
          <td class="py-0.5 uppercase">{{ l.description }}</td>
          <td class="py-0.5 text-right tabular-nums">
            {{ l.type === 'labour' ? '' : qty(l.quantity) }}
          </td>
          @if (fixed) {
            <td colspan="3"></td>
          } @else {
            <td class="py-0.5 text-right tabular-nums">{{ num(l.unitPrice) }}</td>
            <td class="py-0.5 text-right tabular-nums">
              {{ l.discountPercent ? pct(l.discountPercent) : '' }}
            </td>
            <td class="py-0.5 text-right tabular-nums">{{ num(o.amounts[l.id] ?? 0) }}</td>
          }
        </tr>
      </ng-template>
    }
  `,
  styles: '@page { size: A4; margin: 12mm; }',
})
export class QuotePrint implements OnInit {
  private readonly api = inject(QuoteApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly inventory = inject(InventoryApi);
  readonly pricing = inject(Pricing);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;

  readonly order = signal<QuoteDetail | null>(null);
  readonly seller = signal<SellerDetails | null>(null);
  readonly customer = signal<Customer | null>(null);
  readonly vehicle = signal<VehicleDetail | null>(null);
  readonly terms = computed(() => quoteTermsText(this.pricing.value()));
  /** Första registreringsdatum ur fordonsuppslaget, om det finns. */
  readonly firstReg = computed(() => {
    const specs = this.vehicle()?.specs ?? {};
    const key = Object.keys(specs).find((k) => /(först|1:a).*reg|reg.*först/i.test(k));
    return key ? specs[key] : '';
  });

  ngOnInit() {
    this.inventory.seller().subscribe({ next: (s) => this.seller.set(s), error: () => {} });
    this.api.get(this.id).subscribe((o) => {
      this.order.set(o);
      this.workshop.customer(o.customerId).subscribe((c) => this.customer.set(c));
      this.workshop.vehicle(o.vehicleId).subscribe((v) => this.vehicle.set(v));
    });
  }

  rowsOf(o: QuoteDetail, jobId: string | null): QuoteLine[] {
    // Systemets rad (förbrukningsmaterial) kommer sist bland raderna utan jobb.
    return o.lines
      .filter((l) => (l.jobId ?? null) === jobId)
      .sort((a, b) => Number(!!a.system) - Number(!!b.system));
  }

  /** Datum: när förslaget lämnades, annars i dag. */
  date(o: QuoteDetail) {
    return o.givenAt ?? new Date().toISOString();
  }

  day(iso: string) {
    return new Date(iso).toLocaleDateString(appLocale());
  }

  /** Öre som "1 296,40". */
  num(o: number) {
    return (o / 100).toLocaleString(appLocale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  qty(n: number) {
    return n.toLocaleString(appLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  pct(n: number) {
    return n.toLocaleString(appLocale(), { minimumFractionDigits: 1 }) + '%';
  }

  print() {
    window.print();
  }
}
