import { Component, effect, inject, input, signal } from '@angular/core';
import { Auth } from '../../core/auth/auth';
import { Billing } from '../../core/billing/billing';
import { EXPENSE_PAID_WITH_LABELS, Expense, ExpenseApi } from '../../core/api/expense-api';
import { SharedModule } from '../../shared/shared-module';
import { ExpenseOpener } from './open-expense';

/**
 * Utlägg på en arbetsorder: kvitton för saker som köpts vid sidan av till just det här jobbet, för
 * efterkalkylen och bokföringen. Bara internt: det här avsnittet ligger aldrig i utskriften, och
 * inget av det når kunden eller fakturan. Ägare och personal ser alla utlägg på ordern; en mekaniker
 * ser bara sina egna, utan summor.
 */
@Component({
  selector: 'app-order-expenses',
  standalone: true,
  imports: [SharedModule],
  host: { class: 'block' },
  template: `
    @if (shown()) {
      <section
        [class]="flat() ? 'border-t border-gray-100 pt-3' : 'rounded-xl bg-white p-5 shadow-sm'"
      >
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <div class="min-w-0 flex-1">
            <h2 class="text-base font-semibold">Utlägg</h2>
            <p class="text-xs text-gray-500">
              Kvitton för det som köpts in till jobbet. Internt: syns aldrig för kunden eller på
              utskriften.
            </p>
          </div>
          <button
            mat-stroked-button
            type="button"
            class="max-sm:!min-h-12 max-sm:w-full"
            (click)="add()"
          >
            <mat-icon>receipt_long</mat-icon> Lägg till utlägg
          </button>
        </div>
        @if (loading()) {
          <p class="text-sm text-gray-500">Hämtar…</p>
        } @else {
          <ul class="divide-y divide-gray-100">
            @for (e of items(); track e.id) {
              <li>
                <button
                  type="button"
                  class="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                  (click)="edit(e)"
                >
                  <mat-icon class="shrink-0 text-gray-400">{{
                    e.attachments.length ? 'receipt_long' : 'receipt'
                  }}</mat-icon>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium">{{ e.supplier }}</span>
                    <span class="block text-xs text-gray-500">
                      {{ e.date }} · {{ e.code }} · {{ paidLabels[e.paidWith] }}
                      @if (e.status === 'exported') {
                        · Överlämnat
                      }
                    </span>
                  </span>
                  <span class="shrink-0 font-semibold tabular-nums">{{ e.totalIncl | kr }}</span>
                </button>
              </li>
            } @empty {
              <li class="py-2 text-sm text-gray-500">Inga utlägg på ordern än.</li>
            }
          </ul>
          @if (items().length && !auth.isMechanic()) {
            <div class="mt-2 flex items-center justify-between border-t pt-2 text-sm">
              @if (auth.isAdmin()) {
                <a
                  routerLink="/finance/expenses"
                  [queryParams]="{ workOrderId: workOrderId() }"
                  class="text-brand"
                >
                  Visa i Ekonomi
                </a>
              } @else {
                <span></span>
              }
              <span class="font-semibold tabular-nums">Totalt {{ total() | kr }}</span>
            </div>
          }
        }
      </section>
    }
  `,
})
export class OrderExpenses {
  private readonly api = inject(ExpenseApi);
  private readonly opener = inject(ExpenseOpener);
  private readonly billing = inject(Billing);
  readonly auth = inject(Auth);
  readonly paidLabels = EXPENSE_PAID_WITH_LABELS;

  readonly workOrderId = input.required<string>();
  readonly workOrderCode = input<string | null>(null);
  readonly vehicleId = input<string | null>(null);
  /** Utan eget kort, för när avsnittet ligger inuti ett kort (mekanikerns order). */
  readonly flat = input(false);

  readonly items = signal<Expense[]>([]);
  readonly loading = signal(true);
  readonly total = () => this.items().reduce((n, e) => n + e.totalIncl, 0);
  /** Utlägg hör till bokföringen: utan den delen visas inget. */
  readonly shown = () => this.billing.allows('bokforing');

  constructor() {
    effect(() => {
      this.workOrderId();
      this.load();
    });
  }

  private load() {
    this.loading.set(true);
    this.api.list({ workOrderId: this.workOrderId() }).subscribe({
      next: (p) => {
        this.items.set(p.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  async add() {
    const r = await this.opener.open({
      workOrderId: this.workOrderId(),
      workOrderCode: this.workOrderCode(),
      vehicleId: this.vehicleId(),
    });
    if (r) this.load();
  }

  async edit(e: Expense) {
    const r = await this.opener.open({ expense: e });
    if (r) this.load();
  }
}
