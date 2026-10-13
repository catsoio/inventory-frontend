import { Component, Input, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TradeKind, TradeRow } from '../../core/models';
import { TradeDocumentDialog } from '../trade-document-dialog/trade-document-dialog';

/** Senaste försäljningar eller inköp för en kund, bil eller leverantör; klick öppnar dokumentet. */
@Component({
  selector: 'app-trade-history',
  standalone: false,
  template: `
    @for (r of rows; track r.number) {
      <button
        type="button"
        class="flex w-full flex-wrap items-center gap-x-4 border-t border-gray-100 py-2 text-left text-sm hover:bg-gray-50"
        (click)="open(r)"
      >
        <span class="text-xs text-gray-500">{{ r.code }}</span>
        <span class="tabular-nums">{{ r.createdAt | date: 'yyyy-MM-dd' }}</span>
        @if (r.vehicle) {
          <app-reg-plate [value]="r.vehicle.regNo" size="sm" />
        }
        <span class="flex-1 truncate text-gray-500">{{ r.reference || r.note || '' }}</span>
        <span class="tabular-nums">{{ r.units }} st</span>
        <span class="font-medium tabular-nums">{{ r.total | kr }}</span>
      </button>
    } @empty {
      <p class="text-sm text-gray-500">{{ empty }}</p>
    }
  `,
})
export class TradeHistory {
  private readonly dialog = inject(MatDialog);

  @Input({ required: true }) rows: TradeRow[] = [];
  @Input({ required: true }) kind: TradeKind = 'sales';
  @Input() empty = 'Inget än.';

  open(r: TradeRow) {
    this.dialog.open(TradeDocumentDialog, {
      data: { kind: this.kind, number: r.number },
      width: '720px',
      maxWidth: '95vw',
    });
  }
}
