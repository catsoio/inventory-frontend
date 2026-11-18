import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { Article, DocumentMatchVia, DocumentProposal } from '../../core/models';
import { SharedModule } from '../../shared/shared-module';

export interface DocumentReadData {
  proposal: DocumentProposal;
}

/** Det man godtog ur ett inläst papper: raderna som läggs på inköpet, och vad pappret sa i övrigt. */
export interface DocumentReadResult {
  rows: { article: Article; quantity: number; priceKr: number }[];
  supplierId: string | null;
  documentNo: string | null;
  date: string | null;
  /** Summan på pappret, öre inkl. moms. */
  totalInclVat: number | null;
  /** Artiklar man valde för hand som pappret har ett nummer för: numret kan läras in. */
  taught: { articleId: string; code: string }[];
}

interface Row {
  key: number;
  description: string;
  articleNo: string | null;
  article: Article | null;
  via: DocumentMatchVia | 'manual' | null;
  candidates: Article[];
  quantity: number;
  /** Kronor inkl. moms per styck. */
  price: number;
  include: boolean;
}

/** Så mycket får raderna avvika från pappret (öresavrundning per rad) innan det varnas. */
const TOLERANCE_ORE = 100;

/**
 * Det som lästes ur pappret, att kontrollera innan något läggs på inköpet. Varje rad har artikeln den
 * troligast är (kopplad på streckkod, leverantörens nummer eller texten) eller en knapp för att välja
 * en; en rad utan artikel läggs inte till. Antal och pris går att ändra, och summan på pappret ställs
 * mot raderna så att en felläst siffra syns. Inget sparas här.
 */
@Component({
  selector: 'app-document-read-dialog',
  standalone: true,
  imports: [SharedModule],
  template: `
    <h2 mat-dialog-title>Det som lästes ur pappret</h2>
    <mat-dialog-content class="flex flex-col gap-3">
      @if (data.proposal.demo) {
        <p class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Läsningen är inte påslagen här: det här är ett exempel, inte vad pappret säger.
        </p>
      }
      <div class="rounded-xl bg-gray-50 p-3 text-sm">
        <div class="font-medium">{{ data.proposal.supplier.name || 'Okänd leverantör' }}</div>
        <div class="text-gray-600">
          @if (data.proposal.supplier.id) {
            Hittade leverantören i registret.
          } @else if (data.proposal.supplier.name) {
            Leverantören finns inte i registret än, välj den på inköpet.
          }
          @if (data.proposal.documentNo) {
            · Nr {{ data.proposal.documentNo }}
          }
          @if (data.proposal.date) {
            · {{ data.proposal.date }}
          }
        </div>
      </div>

      <ul class="divide-y divide-gray-100">
        @for (r of rows(); track r.key; let i = $index) {
          <li class="flex flex-col gap-2 py-3">
            <div class="flex items-start gap-3">
              <mat-checkbox
                [checked]="r.include"
                [disabled]="!r.article"
                (change)="edit(i, { include: $event.checked })"
                aria-label="Ta med raden"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate text-[15px] font-medium">{{ r.description }}</div>
                @if (r.articleNo) {
                  <div class="text-xs text-gray-500">Nr {{ r.articleNo }}</div>
                }
                @if (r.article; as a) {
                  <div class="mt-1 flex items-center gap-2 text-sm">
                    <mat-icon class="!h-5 !w-5 !text-xl text-green-700">check_circle</mat-icon>
                    <span class="min-w-0 flex-1 truncate">{{ a.label }}</span>
                    <button
                      type="button"
                      class="text-xs font-medium text-brand hover:underline"
                      (click)="choose(i)"
                    >
                      Byt
                    </button>
                  </div>
                } @else {
                  <button mat-stroked-button type="button" class="!mt-1" (click)="choose(i)">
                    <mat-icon>search</mat-icon> Välj artikel
                  </button>
                }
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3 pl-9">
              <label class="flex flex-col gap-0.5 text-xs text-gray-500">
                Antal
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  class="h-10 px-2 text-right text-gray-900 field"
                  [value]="r.quantity"
                  (focus)="$any($event.target).select()"
                  (input)="edit(i, { quantity: $any($event.target).valueAsNumber })"
                />
              </label>
              <label class="flex flex-col gap-0.5 text-xs text-gray-500">
                Pris/st (kr, inkl. moms)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputmode="decimal"
                  class="h-10 px-2 text-right text-gray-900 field"
                  [value]="r.price"
                  (focus)="$any($event.target).select()"
                  (input)="edit(i, { price: $any($event.target).valueAsNumber })"
                />
              </label>
            </div>
          </li>
        }
      </ul>

      <div class="rounded-xl bg-gray-50 p-3 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-600">Raderna som tas med</span>
          <b class="tabular-nums">{{ money(sumOre()) }}</b>
        </div>
        @if (data.proposal.totalInclVat != null) {
          <div class="flex justify-between">
            <span class="text-gray-600">Summa på pappret</span>
            <b class="tabular-nums">{{ money(data.proposal.totalInclVat) }}</b>
          </div>
          <p class="mt-2" [class]="check().cls">{{ check().text }}</p>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Avbryt</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!included().length"
        (click)="done()"
      >
        Lägg till {{ included().length }} {{ included().length === 1 ? 'rad' : 'rader' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class DocumentReadDialog {
  readonly ref = inject<MatDialogRef<DocumentReadDialog, DocumentReadResult>>(MatDialogRef);
  readonly data = inject<DocumentReadData>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialog);

  readonly rows = signal<Row[]>(
    this.data.proposal.lines.map((l, key) => ({
      key,
      description: l.description,
      articleNo: l.articleNo,
      article: l.match?.article ?? null,
      via: l.match?.via ?? null,
      candidates: l.candidates,
      quantity: l.quantity,
      price: l.unitCostIncl == null ? 0 : l.unitCostIncl / 100,
      // En rad utan artikel kan inte läggas till förrän man valt en.
      include: !!l.match,
    })),
  );

  readonly included = computed(() => this.rows().filter((r) => r.include && r.article));
  readonly sumOre = computed(() =>
    this.included().reduce((n, r) => n + Math.round(r.quantity * r.price * 100), 0),
  );
  readonly check = computed(() => {
    const total = this.data.proposal.totalInclVat;
    if (total == null) return { cls: '', text: '' };
    const diff = this.sumOre() - total;
    const tolerance = Math.max(TOLERANCE_ORE, this.included().length * 20);
    return Math.abs(diff) <= tolerance
      ? { cls: 'text-green-800', text: 'Raderna stämmer med summan på pappret.' }
      : {
          cls: 'text-amber-800',
          text: `Raderna avviker ${this.money(Math.abs(diff))} från pappret. En rad kan saknas, vara fel läst eller ha fel pris.`,
        };
  });

  money(ore: number) {
    return `${(ore / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr`;
  }

  edit(i: number, patch: Partial<Row>) {
    this.rows.update((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  /** Välj artikeln för en rad: de troliga överst och sökning under. */
  async choose(i: number) {
    const row = this.rows()[i];
    const { ArticleLinkDialog } = await import('../../core/scan/article-link-dialog');
    const article = await firstValueFrom(
      this.dialog
        .open(ArticleLinkDialog, {
          width: '460px',
          maxWidth: '96vw',
          autoFocus: false,
          data: {
            title: 'Vilken artikel är raden?',
            query: row.description,
            suggestions: row.candidates,
            suggestionsLabel: 'Troliga',
          },
        })
        .afterClosed(),
    );
    if (article) this.edit(i, { article, via: 'manual', include: true });
  }

  done() {
    const p = this.data.proposal;
    const rows = this.included();
    this.ref.close({
      rows: rows.map((r) => ({
        article: r.article!,
        quantity: Math.max(1, Math.round(r.quantity) || 1),
        priceKr: Number.isFinite(r.price) ? r.price : 0,
      })),
      supplierId: p.supplier.id,
      documentNo: p.documentNo,
      date: p.date,
      totalInclVat: p.totalInclVat,
      // Ett nummer på pappret kopplat till en artikel man valt själv lärs in, så nästa papper går av sig självt.
      taught: rows
        .filter((r) => r.via === 'manual' && r.articleNo)
        .map((r) => ({ articleId: r.article!.id, code: r.articleNo! })),
    });
  }
}
