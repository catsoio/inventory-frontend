import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { PageTitle } from '../../../core/page-title';
import { WorkOrderDetail, WorkOrderInvoice } from '../../../core/models';

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
        <app-invoice-document [doc]="inv" [meta]="meta(o)" />
      } @else {
        <p class="text-gray-600">{{ error() ?? 'Laddar utkast…' }}</p>
      }
    }
  `,
  styles: '@page { size: A4; margin: 12mm; }',
})
export class WorkOrderInvoicePage implements OnInit {
  private readonly api = inject(WorkOrderApi);
  private readonly pageTitle = inject(PageTitle);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  readonly order = signal<WorkOrderDetail | null>(null);
  /** Det bokförda dokumentet, annars utkastet från förhandsvisningen. */
  readonly document = signal<WorkOrderInvoice | null>(null);
  readonly error = signal<string | null>(null);

  ngOnInit() {
    this.api.get(this.id).subscribe((o) => {
      this.order.set(o);
      if (o.invoice) return this.show(o.invoice);
      this.api.invoicePreview(this.id).subscribe({
        next: (d) => this.show(d),
        error: (e) => this.error.set(e?.error?.message ?? 'Kunde inte skapa utkastet.'),
      });
    });
  }

  private show(d: WorkOrderInvoice) {
    this.document.set(d);
    this.pageTitle.page.set(
      `${d.kind === 'invoice' ? 'Faktura' : 'Kvitto'} ${d.code ?? '(utkast)'}`,
    );
  }

  meta(o: WorkOrderDetail): [string, string][] {
    return [
      ['Arbetsorder', o.code],
      ['Bil', `${o.regNo} ${o.vehicle ?? ''}`.trim()],
    ];
  }

  print() {
    window.print();
  }
}
