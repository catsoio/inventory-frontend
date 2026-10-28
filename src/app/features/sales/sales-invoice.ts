import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { PageTitle } from '../../core/page-title';
import {
  DocumentChoice,
  PaymentMethod,
  SalesCardDetail,
  WorkOrderInvoice,
} from '../../core/models';

/** Fakturan eller kvittot för ett säljkort som A4: det bokförda dokumentet, annars ett utkast. */
@Component({
  selector: 'app-sales-invoice',
  standalone: false,
  template: `
    <div class="mb-4 flex items-center gap-2 print:hidden">
      <a mat-button [routerLink]="['/sales', id]"><mat-icon>arrow_back</mat-icon> Tillbaka</a>
      <span class="flex-1"></span>
      <button mat-flat-button color="primary" (click)="print()">
        <mat-icon>print</mat-icon> Skriv ut
      </button>
    </div>
    @if (document(); as inv) {
      <app-invoice-document [doc]="inv" [meta]="meta()" />
    } @else {
      <p class="text-gray-600">{{ error() ?? 'Laddar…' }}</p>
    }
  `,
  styles: '@page { size: A4; margin: 12mm; }',
})
export class SalesInvoicePage implements OnInit {
  private readonly api = inject(SalesCardApi);
  private readonly route = inject(ActivatedRoute);
  private readonly pageTitle = inject(PageTitle);
  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly card = signal<SalesCardDetail | null>(null);
  readonly document = signal<WorkOrderInvoice | null>(null);
  readonly error = signal<string | null>(null);

  ngOnInit() {
    this.api.get(this.id).subscribe((c) => {
      this.card.set(c);
      if (c.document) return this.show(c.document);
      this.api.preview(this.id, this.choice()).subscribe({
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

  /** Det man valt på kortet (faktura eller kvitto, villkor, betalsätt) står i adressen. */
  private choice(): DocumentChoice {
    const q = this.route.snapshot.queryParamMap;
    const kind = q.get('kind');
    const days = q.get('paymentTermsDays');
    const method = q.get('paymentMethod');
    return {
      ...(kind === 'invoice' || kind === 'receipt' ? { kind } : {}),
      ...(days !== null && days !== '' && !isNaN(+days) ? { paymentTermsDays: +days } : {}),
      ...(method ? { paymentMethod: method as PaymentMethod } : {}),
    };
  }

  meta(): [string, string][] {
    const c = this.card();
    if (!c) return [];
    const m: [string, string][] = [['Säljkort', c.code]];
    if (c.links.workOrder) m.push(['Arbetsorder', c.links.workOrder.code]);
    if (c.regNo) m.push(['Bil', `${c.regNo} ${c.vehicle ?? ''}`.trim()]);
    return m;
  }

  print() {
    window.print();
  }
}
