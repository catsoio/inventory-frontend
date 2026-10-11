import { Component, Input } from '@angular/core';
import { KrPipe } from '../../../shared/kr-pipe';
import { ClosingSummary, PAYMENT_METHOD_LABELS, PaymentMethod } from '../../../core/models';

interface Row {
  label: string;
  value: number;
  sign?: '+' | '−' | '±' | '=';
  hint?: string;
  strong?: boolean;
}

@Component({
  selector: 'app-closing-summary',
  standalone: false,
  host: { class: 'flex flex-col gap-4' },
  template: `
    @if (summary; as s) {
      <section>
        <h3 class="mb-2 text-sm font-semibold tracking-wide text-gray-500 uppercase">
          Försäljning och resultat
        </h3>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
          @for (t of tiles(); track t[0]) {
            <div class="rounded-xl bg-white p-4 shadow-sm">
              <div class="text-sm text-gray-500">{{ t[0] }}</div>
              <div class="text-lg font-semibold">{{ t[1] }}</div>
              <div class="text-xs text-gray-400">{{ t[2] }}</div>
            </div>
          }
        </div>
      </section>

      <section class="rounded-xl bg-white p-4 shadow-sm">
        <h3 class="mb-2 text-sm font-semibold tracking-wide text-gray-500 uppercase">
          Lagervärde (till inköpspris)
        </h3>
        <table class="w-full text-sm">
          <tbody>
            @for (r of roll(); track r.label) {
              <tr [class]="r.strong ? 'border-t font-semibold' : ''">
                <td class="w-8 py-1 text-gray-400">{{ r.sign }}</td>
                <td class="py-1">
                  {{ r.label }}
                  @if (r.hint) {
                    <span class="ml-1 text-xs text-gray-400">{{ r.hint }}</span>
                  }
                </td>
                <td class="py-1 text-right tabular-nums">{{ r.value | kr }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section>
        <h3 class="mb-2 text-sm font-semibold tracking-wide text-gray-500 uppercase">Däckhotell</h3>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          @for (t of hotel(); track t[0]) {
            <div class="rounded-xl bg-white p-4 shadow-sm">
              <div class="text-sm text-gray-500">{{ t[0] }}</div>
              <div class="text-lg font-semibold">{{ t[1] }}</div>
              <div class="text-xs text-gray-400">{{ t[2] }}</div>
            </div>
          }
        </div>
      </section>
    }
  `,
})
export class ClosingSummaryView {
  @Input({ required: true }) summary!: ClosingSummary;

  private readonly krFmt = (ore: number) => new KrPipe().transform(ore);

  tiles(): [string, string, string][] {
    const i = this.summary.inventory;
    return [
      ['Försäljning', this.krFmt(i.soldRevenue), `${i.soldUnits} st (netto efter returer)`],
      ['Kostnad såld vara', this.krFmt(i.soldCost), 'till snittinköpspris'],
      ['Bruttovinst', this.krFmt(i.grossProfit), ''],
      ['Inköp', this.krFmt(i.purchasedCost), `${i.purchasedUnits} st`],
      ['Kasserat', this.krFmt(i.writtenOffCost), `${i.writtenOffUnits} st`],
    ];
  }

  roll(): Row[] {
    const { stock, inventory: i } = this.summary;
    const rows: Row[] = [
      {
        label: 'Ingående lagervärde',
        value: stock.opening.value,
        hint: `${stock.opening.units} st`,
      },
      { label: 'Inköp', value: i.purchasedCost, sign: '+' },
      { label: 'Kostnad såld vara', value: -i.soldCost, sign: '−' },
      { label: 'Kassering', value: -i.writtenOffCost, sign: '−' },
      {
        label: 'Inventeringsdifferens',
        value: i.adjustmentValue,
        sign: '±',
        hint: `${i.adjustmentUnits} st`,
      },
    ];
    if (stock.revaluation !== 0) {
      rows.push({
        label: 'Omvärdering / avvikelse',
        value: stock.revaluation,
        sign: '±',
        hint: 'avrundning, ändrat inköpspris eller saldo utan lagerhändelse',
      });
    }
    rows.push({
      label: 'Utgående lagervärde',
      value: stock.closing.value,
      sign: '=',
      strong: true,
      hint: `${stock.closing.units} st i ${stock.closing.articles} artiklar`,
    });
    return rows;
  }

  hotel(): [string, string, string][] {
    const h = this.summary.hotel;
    const methods = (Object.keys(h.feesByMethod) as PaymentMethod[])
      .filter((m) => h.feesByMethod[m] > 0)
      .map((m) => `${PAYMENT_METHOD_LABELS[m]} ${this.krFmt(h.feesByMethod[m])}`)
      .join(' · ');
    return [
      [
        'Intäkt förvaring',
        this.krFmt(h.feesPaid),
        `${h.feesPaidCount} betalda${methods ? ' · ' + methods : ''}`,
      ],
      ['Inlämnade / utlämnade', `${h.received} / ${h.pickedUp}`, 'set under perioden'],
      ['Inlagrade vid slutet', `${h.storedAtEnd} set`, `${h.storedUnitsAtEnd} st`],
      ['Obetalda vid slutet', this.krFmt(h.unpaidAmountAtEnd), `${h.unpaidAtEnd} inlämningar`],
    ];
  }
}
