import { Component, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ClosingApi } from '../../../core/api/closing-api';
import { VatReport, VatSource } from '../../../core/models';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Utgående moms för en period, uppdelad efter var den kommer ifrån. Underlag till
 * momsdeklarationen – inte själva deklarationen: ingående moms (på inköp) finns på
 * leverantörsfakturorna och räknas inte här.
 */
@Component({
  selector: 'app-vat-report',
  standalone: false,
  template: `
    <section class="mb-6 rounded-xl bg-white p-5 shadow-sm">
      <h2 class="text-base font-semibold">Momsrapport (utgående moms)</h2>
      <p class="mb-3 max-w-3xl text-sm text-gray-600">
        Moms ni tagit ut av kunderna under perioden, per momssats. Fakturor och kvitton räknas den
        dag de utfärdades, däckhotell den dag avgiften betalades och lagerförsäljning utanför
        arbetsorder den dag den bokades. Ingående moms (på inköp) ingår inte.
      </p>
      <form [formGroup]="form" (ngSubmit)="load()" class="flex flex-wrap items-center gap-3">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Från</mat-label>
          <input matInput type="date" formControlName="from" />
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Till och med</mat-label>
          <input matInput type="date" formControlName="to" />
        </mat-form-field>
        <button mat-stroked-button [disabled]="busy()">Visa</button>
      </form>

      @if (report(); as r) {
        @if (r.doneNotInvoiced > 0) {
          <p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {{ r.doneNotInvoiced }}
            {{ r.doneNotInvoiced === 1 ? 'klar arbetsorder är' : 'klara arbetsorder är' }} inte
            fakturerad än och ingår därför inte i rapporten.
          </p>
        }
        <table class="mt-4 w-full max-w-3xl text-sm">
          <thead>
            <tr class="border-b text-left text-xs tracking-wide text-gray-500 uppercase">
              <th class="py-1">Källa</th>
              <th class="py-1 text-right">Antal</th>
              <th class="py-1 text-right">Försäljning exkl. moms</th>
              <th class="py-1 text-right">Moms</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(r); track row[0]) {
              <tr class="border-b border-gray-100">
                <td class="py-1.5">{{ row[0] }}</td>
                <td class="py-1.5 text-right tabular-nums">{{ row[1].count }}</td>
                <td class="py-1.5 text-right tabular-nums">{{ row[1].net | kr }}</td>
                <td class="py-1.5 text-right tabular-nums">{{ row[1].vat | kr }}</td>
              </tr>
            }
            <tr class="font-semibold">
              <td class="py-1.5" colspan="2">Totalt</td>
              <td class="py-1.5 text-right tabular-nums">{{ r.total.net | kr }}</td>
              <td class="py-1.5 text-right tabular-nums">{{ r.total.vat | kr }}</td>
            </tr>
          </tbody>
        </table>
        <h3 class="mt-4 text-sm font-semibold">Per momssats</h3>
        <table class="w-full max-w-md text-sm">
          @for (b of r.total.byRate; track b.rate) {
            <tr>
              <td class="py-0.5">{{ b.rate }} %</td>
              <td class="py-0.5 text-right tabular-nums">underlag {{ b.base | kr }}</td>
              <td class="py-0.5 text-right tabular-nums">moms {{ b.vat | kr }}</td>
            </tr>
          }
        </table>
        <p class="mt-3 max-w-3xl text-xs text-gray-500">
          Lagerförsäljning och däckhotell räknas med 25 % moms. Är något av det momsfritt eller har
          en annan sats – fakturera det via en arbetsorder så att satsen anges på raden.
        </p>
      }
    </section>
  `,
})
export class VatReportPanel {
  private readonly api = inject(ClosingApi);
  readonly busy = signal(false);
  readonly report = signal<VatReport | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    from: ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    to: ymd(new Date()),
  });

  rows(r: VatReport): [string, VatSource][] {
    return [
      ['Fakturor och kvitton (arbetsorder)', r.invoices],
      ['Lagerförsäljning utanför arbetsorder', r.stockSales],
      ['Däckhotell (betalda avgifter)', r.hotel],
    ];
  }

  load() {
    const { from, to } = this.form.getRawValue();
    this.busy.set(true);
    this.api.vatReport({ from, to }).subscribe({
      next: (r) => {
        this.report.set(r);
        this.busy.set(false);
      },
      error: () => this.busy.set(false),
    });
  }
}
