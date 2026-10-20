import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { SalesCardDetail, WorkOrderInvoice } from '../../core/models';

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
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  readonly card = signal<SalesCardDetail | null>(null);
  readonly document = signal<WorkOrderInvoice | null>(null);
  readonly error = signal<string | null>(null);

  ngOnInit() {
    this.api.get(this.id).subscribe((c) => {
      this.card.set(c);
      if (c.invoice) return this.document.set(c.invoice);
      this.api.preview(this.id).subscribe({
        next: (d) => this.document.set(d),
        error: (e) => this.error.set(e?.error?.message ?? 'Kunde inte skapa utkastet.'),
      });
    });
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
