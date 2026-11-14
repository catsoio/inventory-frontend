import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { appLocale } from '../../core/i18n/locale';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { UnbilledCustomer, UnbilledOrder } from '../../core/models';
import { Confirm } from '../../shared/confirm';
import { SALES_TABS } from '../../shared/page-header/tabs';
import { SharedModule } from '../../shared/shared-module';
import {
  INVOICE_STATE_TEXT,
  INVOICE_STATE_TONE,
  invoiceStateOf,
  type InvoiceState,
} from '../../shared/to-invoice';

type Show = 'now' | 'all';

interface Row {
  o: UnbilledOrder;
  state: InvoiceState;
}

interface Group {
  g: UnbilledCustomer;
  rows: Row[];
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' });

/**
 * Att fakturera (Business Centrals "Levererat ej fakturerat"): klara arbetsorder som ingen faktura
 * gjorts för, per kund. En vanlig kund faktureras order för order; en kund med samlingsfaktura får
 * en faktura för förra månadens order (Samlingsfakturering, som "Combine Shipments" i BC). Ett
 * kort med flera order blir en samlingsfaktura där varje order står som ett eget block.
 */
@Component({
  selector: 'app-to-invoice',
  imports: [SharedModule],
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-page-header class="shrink-0" [tabs]="tabs" [desktopOnly]="true" label="Försäljning" />
    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-3">
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="show()"
        (change)="show.set($event.value)"
        aria-label="Visa"
      >
        <mat-button-toggle value="now">Att fakturera nu</mat-button-toggle>
        <mat-button-toggle value="all">Alla klara</mat-button-toggle>
      </mat-button-toggle-group>
      <span class="text-sm text-gray-600">{{ count() }} arbetsorder · {{ sum() | kr }}</span>
      <span class="flex-1"></span>
      @if (collectiveDue()) {
        <button mat-flat-button color="primary" [disabled]="busy()" (click)="runCollective()">
          <mat-icon>receipt_long</mat-icon> Skapa samlingsfakturor
        </button>
      }
    </div>

    <div class="min-h-0 flex-1 overflow-auto pb-4">
      @if (loading()) {
        <p class="text-sm text-gray-500">Hämtar…</p>
      } @else {
        @for (gr of groups(); track gr.g.customer.id) {
          <section class="mb-4 rounded-xl bg-white p-4 shadow-sm">
            <header class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <a
                class="text-brand text-base font-semibold"
                [routerLink]="['/customers', gr.g.customer.id]"
                >{{ gr.g.customer.name }}</a
              >
              <span class="text-sm text-gray-500">{{ gr.g.customer.code }}</span>
              @if (gr.g.customer.collectiveInvoice) {
                <app-pill tone="blue">Samlingsfaktura</app-pill>
              }
              @if (gr.g.customer.paymentTermsDays != null) {
                <span class="text-sm text-gray-500"
                  >{{ gr.g.customer.paymentTermsDays }} dagar netto</span
                >
              }
              <span class="flex-1"></span>
              <span class="font-semibold tabular-nums">{{ groupSum(gr) | kr }}</span>
              <button
                mat-stroked-button
                type="button"
                [disabled]="busy() || !picked(gr).length"
                (click)="invoice(gr)"
              >
                <mat-icon>receipt_long</mat-icon>
                {{
                  picked(gr).length > 1
                    ? 'Samlingsfaktura (' + picked(gr).length + ' order)'
                    : 'Skapa faktura'
                }}
              </button>
            </header>
            <div class="overflow-x-auto">
              <table class="w-full min-w-[560px] text-left text-sm">
                <tbody class="divide-y divide-gray-100">
                  @for (r of gr.rows; track r.o.id) {
                    <tr class="align-middle">
                      <td class="w-10 py-1.5">
                        @if (!r.o.card) {
                          <mat-checkbox
                            [checked]="isPicked(r)"
                            (change)="toggle(r)"
                            [aria-label]="'Välj ' + r.o.code"
                          />
                        }
                      </td>
                      <td class="py-1.5 pr-3 whitespace-nowrap">
                        <a class="text-brand" [routerLink]="['/workorders', r.o.id]">{{
                          r.o.code
                        }}</a>
                      </td>
                      <td class="py-1.5 pr-3"><app-reg-plate [value]="r.o.regNo" size="sm" /></td>
                      <td class="py-1.5 pr-3 max-md:hidden">{{ r.o.vehicle }}</td>
                      <td class="py-1.5 pr-3 whitespace-nowrap">Klar {{ day(r.o.doneAt) }}</td>
                      <td class="py-1.5 pr-3 max-lg:hidden">
                        @if (r.o.yourReference) {
                          Er ref: {{ r.o.yourReference }}
                        }
                      </td>
                      <td class="py-1.5 pr-3">
                        @if (r.o.card; as c) {
                          <a class="text-brand" [routerLink]="['/sales', c.id]"
                            >På {{ c.code }} (utkast)</a
                          >
                        } @else {
                          <app-pill [tone]="tone[r.state]">{{ text[r.state] }}</app-pill>
                        }
                      </td>
                      <td class="py-1.5 text-right font-medium whitespace-nowrap tabular-nums">
                        {{ r.o.total | kr }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        } @empty {
          <p class="rounded-xl bg-white p-6 text-sm text-gray-600 shadow-sm">
            @if (show() === 'now') {
              Inget att fakturera just nu. Klara arbetsorder hamnar här tills de är fakturerade.
            } @else {
              Inga klara arbetsorder väntar på faktura.
            }
          </p>
        }
      }
    </div>
  `,
})
export class ToInvoicePage {
  private readonly api = inject(SalesCardApi);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);

  readonly tabs = SALES_TABS;
  readonly text = INVOICE_STATE_TEXT;
  readonly tone = INVOICE_STATE_TONE;
  readonly day = day;
  readonly data = signal<UnbilledCustomer[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  /** `?show=all` visar även det som väntar på månadens samlingsfaktura och det som ligger på utkast. */
  readonly show = signal<Show>(
    inject(ActivatedRoute).snapshot.queryParamMap.get('show') === 'all' ? 'all' : 'now',
  );
  /** Rader man klickat bort eller till; förvalt är allt som ska faktureras nu. */
  private readonly flipped = signal<Set<string>>(new Set());

  readonly groups = computed<Group[]>(() => {
    const today = new Date();
    const now = this.show() === 'now';
    return this.data()
      .map((g) => ({
        g,
        rows: g.orders
          .map((o) => ({ o, state: invoiceStateOf(o, g.customer.collectiveInvoice, today) }))
          .filter((r) => !now || (!r.o.card && r.state !== 'waiting')),
      }))
      .filter((gr) => gr.rows.length);
  });
  readonly count = computed(() => this.groups().reduce((n, gr) => n + gr.rows.length, 0));
  readonly sum = computed(() =>
    this.groups().reduce((t, gr) => t + gr.rows.reduce((s, r) => s + r.o.total, 0), 0),
  );
  /** Någon kund med samlingsfaktura har order från en avslutad månad som ingen faktura är påbörjad för. */
  readonly collectiveDue = computed(() =>
    this.data().some(
      (g) =>
        g.customer.collectiveInvoice &&
        g.orders.some((o) => !o.card && invoiceStateOf(o, true) !== 'waiting'),
    ),
  );

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.toInvoice().subscribe({
      next: (x) => {
        this.data.set(x.customers);
        this.flipped.set(new Set());
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  isPicked(r: Row): boolean {
    return (r.state !== 'waiting') !== this.flipped().has(r.o.id);
  }

  toggle(r: Row) {
    this.flipped.update((s) => {
      const next = new Set(s);
      if (!next.delete(r.o.id)) next.add(r.o.id);
      return next;
    });
  }

  picked(gr: Group): Row[] {
    return gr.rows.filter((r) => !r.o.card && this.isPicked(r));
  }

  groupSum(gr: Group): number {
    return gr.rows.reduce((s, r) => s + r.o.total, 0);
  }

  /** De valda ordern på ett säljkort: en order som vanligt, flera som en samlingsfaktura. */
  async invoice(gr: Group) {
    const ids = this.picked(gr).map((r) => r.o.id);
    if (!ids.length) return;
    this.busy.set(true);
    try {
      const card = await firstValueFrom(
        this.api.create(ids.length === 1 ? { workOrderId: ids[0] } : { workOrderIds: ids }),
      );
      await this.router.navigate(['/sales', card.id]);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Samlingsfakturering: ett utkast per kund med samlingsfaktura, med alla klara order från tidigare
   * månader. Inget bokförs; varje faktura gås igenom och bokförs för sig.
   */
  runCollective() {
    const first = new Date();
    first.setDate(1);
    const before = first.toLocaleDateString(appLocale(), { day: 'numeric', month: 'long' });
    this.confirm
      .ask({
        title: 'Skapa samlingsfakturor?',
        message: `Varje kund med samlingsfaktura får ett utkast med de klara arbetsorder som gjordes före ${before} och inte redan ligger på ett säljkort. Inget bokförs: du går igenom och bokför varje faktura.`,
        confirmText: 'Skapa utkast',
      })
      .subscribe(async (ok) => {
        if (!ok) return;
        this.busy.set(true);
        try {
          const { cards } = await firstValueFrom(this.api.collective({}));
          this.snack.open(
            cards.length === 1
              ? `${cards[0].code} skapades för ${cards[0].customerName}`
              : `${cards.length} utkast skapades`,
            'OK',
            { duration: 5000 },
          );
          if (cards.length === 1) await this.router.navigate(['/sales', cards[0].id]);
          else await this.router.navigate(['/sales'], { queryParams: { show: 'draft' } });
        } finally {
          this.busy.set(false);
        }
      });
  }
}
