import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { PublicDocument as PublicDoc } from '../../core/models';

/**
 * Kundens sida för en faktura eller ett kvitto (`/i/<nyckel>`): ingen inloggning, nyckeln i
 * länken är nyckeln. Visar samma dokument som verkstadens "Visa / skriv ut", och kunden kan
 * skriva ut eller spara det som PDF.
 */
@Component({
  selector: 'app-public-document',
  standalone: false,
  host: { class: 'block min-h-dvh bg-gray-50 text-gray-800 print:bg-white' },
  template: `
    @if (error()) {
      <main
        class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center"
      >
        <mat-icon class="!h-14 !w-14 !text-[56px] text-gray-400">link_off</mat-icon>
        <h1 class="mt-4 text-xl font-semibold">Länken gäller inte längre</h1>
        <p class="mt-2 text-gray-600">Hör av dig till verkstaden så får du en ny.</p>
      </main>
    } @else if (doc(); as d) {
      <main class="mx-auto max-w-4xl p-4">
        <div class="mb-4 flex justify-end print:hidden">
          <button mat-flat-button color="primary" (click)="print()">
            <mat-icon>print</mat-icon> Skriv ut / spara som PDF
          </button>
        </div>
        <app-invoice-document [doc]="d.document" [meta]="meta(d)" />
      </main>
    } @else {
      <p class="p-6 text-gray-600">Laddar…</p>
    }
  `,
  styles: '@page { size: A4; margin: 12mm; }',
})
export class PublicDocumentPage implements OnInit {
  private readonly api = inject(SalesCardApi);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  readonly doc = signal<PublicDoc | null>(null);
  readonly error = signal(false);

  ngOnInit() {
    this.api.publicDocument(this.token).subscribe({
      next: (d) => {
        this.doc.set(d);
        document.title = `${d.document.kind === 'invoice' ? 'Faktura' : 'Kvitto'} ${(d.document as { code?: string }).code ?? ''}`;
      },
      error: () => this.error.set(true),
    });
  }

  meta(d: PublicDoc): [string, string][] {
    return d.regNo ? [['Bil', `${d.regNo} ${d.vehicle ?? ''}`.trim()]] : [];
  }

  print() {
    window.print();
  }
}
