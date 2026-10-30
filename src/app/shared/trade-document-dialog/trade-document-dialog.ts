import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { AxleApi } from '../../core/api/axle-api';
import { TradeDocument, TradeKind } from '../../core/models';
import { hostOf, safeUrl } from '../web-link';

@Component({
  selector: 'app-trade-document-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Inköp {{ doc()?.code }}</h2>
    <mat-dialog-content>
      @if (doc(); as d) {
        <div class="mb-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div>
            <span class="text-gray-500">Datum:</span> {{ d.createdAt | date: 'yyyy-MM-dd HH:mm' }}
          </div>
          <div><span class="text-gray-500">Referens:</span> {{ d.reference || '–' }}</div>
          @if (safe(d.url); as u) {
            <div>
              <span class="text-gray-500">Köpt via:</span>
              <a
                [href]="u"
                target="_blank"
                rel="noopener noreferrer"
                class="text-brand hover:underline"
                >{{ host(d.url) }}</a
              >
            </div>
          }
          <div>
            <span class="text-gray-500">Leverantör:</span>
            @if (d.supplier; as s) {
              <a
                mat-dialog-close
                [routerLink]="['/suppliers', s.id]"
                class="text-brand hover:underline"
              >
                {{ s.name }}
              </a>
              <span class="text-xs text-gray-500">{{ s.code }}</span>
            } @else {
              {{ d.supplierName || '–' }}
            }
          </div>
          <div class="sm:col-span-2">
            <span class="text-gray-500">Anteckning:</span> {{ d.note || '–' }}
          </div>
        </div>
        <table class="w-full text-left text-sm">
          <thead
            class="border-b border-gray-100 text-xs font-medium tracking-wide text-gray-500 uppercase"
          >
            <tr>
              <th class="py-2">Artikel</th>
              <th class="py-2 text-right">Antal</th>
              <th class="py-2 text-right">À-pris exkl. moms</th>
              <th class="py-2 text-right">Summa exkl. moms</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            @for (l of d.lines; track $index) {
              <tr>
                <td class="py-2">{{ l.articleLabel }}</td>
                <td class="py-2 text-right tabular-nums">{{ l.quantity }}</td>
                <td class="py-2 text-right tabular-nums">{{ l.unitPrice | kr }}</td>
                <td class="py-2 text-right tabular-nums">{{ l.total | kr }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr class="border-t border-gray-200 font-semibold">
              <td class="py-2">Totalt</td>
              <td class="py-2 text-right tabular-nums">{{ d.units }}</td>
              <td></td>
              <td class="py-2 text-right tabular-nums">{{ d.total | kr }}</td>
            </tr>
          </tfoot>
        </table>
      } @else {
        <p class="py-6 text-center text-gray-500">Laddar…</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Stäng</button>
    </mat-dialog-actions>
  `,
})
export class TradeDocumentDialog {
  readonly safe = safeUrl;
  readonly host = hostOf;
  protected readonly data = inject<{ kind: TradeKind; number: number }>(MAT_DIALOG_DATA);
  readonly doc = signal<TradeDocument | null>(null);

  constructor() {
    inject(AxleApi)
      .trade(this.data.kind, this.data.number)
      .subscribe((d) => this.doc.set(d));
  }
}
