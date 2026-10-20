import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { SalesCardItem } from '../../core/models';

/** Senaste säljkorten för en kund eller en bil; klick öppnar kortet. */
@Component({
  selector: 'app-sales-card-history',
  standalone: false,
  template: `
    @for (c of cards(); track c.id) {
      <a
        [routerLink]="['/sales', c.id]"
        class="flex w-full flex-wrap items-center gap-x-4 border-t border-gray-100 py-2 text-sm hover:bg-gray-50"
      >
        <span class="text-xs text-gray-500">{{ c.code }}</span>
        <span class="tabular-nums">{{ (c.invoicedAt ?? c.createdAt) | date: 'yyyy-MM-dd' }}</span>
        @if (c.regNo) {
          <app-reg-plate [value]="c.regNo" size="sm" />
        }
        <span class="flex-1 truncate text-gray-500">{{ c.invoiceCode ?? '' }}</span>
        <app-pill [tone]="c.status === 'draft' ? 'gray' : c.paidAt ? 'green' : 'amber'">
          {{ c.status === 'draft' ? 'Utkast' : c.paidAt ? 'Betald' : 'Obetald' }}
        </app-pill>
        <span class="font-medium tabular-nums">{{ c.total | kr }}</span>
      </a>
    } @empty {
      <p class="text-sm text-gray-500">{{ empty }}</p>
    }
  `,
})
export class SalesCardHistory implements OnChanges {
  private readonly api = inject(SalesCardApi);

  @Input() customerId?: string;
  @Input() vehicleId?: string;
  @Input() empty = 'Inga säljkort än.';
  readonly cards = signal<SalesCardItem[]>([]);

  ngOnChanges() {
    if (!this.customerId && !this.vehicleId) return;
    this.api
      .list({ customerId: this.customerId, vehicleId: this.vehicleId, limit: 10 })
      .subscribe((p) => this.cards.set(p.items));
  }
}
