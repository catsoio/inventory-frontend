import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { QuoteApi } from '../../core/api/quote-api';
import { Quote, QUOTE_STATUS_LABELS, QuoteShownStatus } from '../../core/models';

const TONES: Record<QuoteShownStatus, 'gray' | 'amber' | 'green' | 'red'> = {
  draft: 'gray',
  given: 'amber',
  approved: 'green',
  declined: 'red',
  expired: 'gray',
};

/** Senaste kostnadsförslagen för en kund eller en bil; klick öppnar förslaget. */
@Component({
  selector: 'app-quote-history',
  standalone: false,
  template: `
    @for (q of quotes(); track q.id) {
      <a
        [routerLink]="['/quotes', q.id]"
        class="flex w-full flex-wrap items-center gap-x-4 border-t border-gray-100 py-2 text-sm hover:bg-gray-50"
      >
        <span class="text-xs text-gray-500">{{ q.code }}</span>
        <span class="tabular-nums">{{ q.givenAt ?? q.createdAt | date: 'yyyy-MM-dd' }}</span>
        <app-reg-plate [value]="q.regNo" size="sm" />
        <span class="flex-1 truncate text-gray-500">{{ q.remarks ?? '' }}</span>
        <app-pill [tone]="tones[q.shownStatus]">{{ labels[q.shownStatus] }}</app-pill>
        <span class="font-medium tabular-nums">{{ q.total | kr }}</span>
      </a>
    } @empty {
      <p class="text-sm text-gray-500">{{ empty }}</p>
    }
  `,
})
export class QuoteHistory implements OnChanges {
  private readonly api = inject(QuoteApi);

  @Input() customerId?: string;
  @Input() vehicleId?: string;
  @Input() empty = 'Inga offerter än.';
  readonly quotes = signal<Quote[]>([]);
  readonly tones = TONES;
  readonly labels = QUOTE_STATUS_LABELS;

  ngOnChanges() {
    if (!environment.workOrders || (!this.customerId && !this.vehicleId)) return;
    this.api
      .list({ customerId: this.customerId, vehicleId: this.vehicleId, limit: 10 })
      .subscribe({ next: (p) => this.quotes.set(p.items), error: () => {} });
  }
}
