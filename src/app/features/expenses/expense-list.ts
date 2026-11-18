import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormControl } from '@angular/forms';
import { format } from 'date-fns';
import {
  EXPENSE_PAID_WITH_LABELS,
  EXPENSE_STATUS_LABELS,
  Expense,
  ExpenseApi,
  ExpensePaidWith,
  ExpenseStatus,
  ExpenseSummary,
} from '../../core/api/expense-api';
import { saveFile } from '../../core/save-file';
import { Confirm } from '../../shared/confirm';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import { SharedModule } from '../../shared/shared-module';
import type { SummaryFlag } from '../../shared/toolbar/summary';
import { ExpenseOpener } from './open-expense';

const kr = new KrPipe();
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

const COLS: DtCol<Expense>[] = [
  { key: 'code', label: 'Nr', value: (e) => e.code },
  { key: 'date', label: 'Datum', value: (e) => e.date },
  { key: 'supplier', label: 'Köpt av', value: (e) => e.supplier },
  { key: 'receiptNo', label: 'Kvittonr', value: (e) => e.receiptNo ?? '' },
  {
    key: 'paidWith',
    label: 'Betalsätt',
    value: (e) => e.paidWith,
    fmt: (e) => EXPENSE_PAID_WITH_LABELS[e.paidWith],
  },
  {
    key: 'order',
    label: 'Arbetsorder',
    value: (e) => e.workOrder?.code ?? '',
    fmt: (e) => e.workOrder?.code ?? '–',
  },
  {
    key: 'vat',
    label: 'Moms',
    right: true,
    value: (e) => e.vat.reduce((n, v) => n + v.vat, 0),
    fmt: (e) => kr.transform(e.vat.reduce((n, v) => n + v.vat, 0)),
  },
  {
    key: 'total',
    label: 'Totalt',
    right: true,
    value: (e) => e.totalIncl,
    fmt: (e) => kr.transform(e.totalIncl),
  },
  {
    key: 'status',
    label: 'Status',
    value: (e) => e.status,
    fmt: (e) => EXPENSE_STATUS_LABELS[e.status],
  },
];

/**
 * Ekonomi → Utlägg: kvitton för saker som köpts vid sidan av, så som revisorn behöver dem. Ett valfritt
 * datumintervall med summa och moms per sats, och två handlingar mot revisorn: Exportera (en zip med
 * kvittobilderna och ett kalkylblad) och Markera som överlämnat (låser utlägget så att det inte ändras
 * i smyg). Heter Utlägg och inte Kvitton: Kvitton är försäljningskvitton. Bara ägaren; personal och
 * mekaniker lägger till utlägg på arbetsordern.
 */
@Component({
  selector: 'app-expense-list',
  standalone: true,
  imports: [SharedModule],
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-finance-tabs>
      <button
        actions
        mat-stroked-button
        type="button"
        class="max-md:!hidden"
        [disabled]="!!orderId() || busy()"
        (click)="exportZip()"
      >
        <mat-icon>download</mat-icon> Exportera till revisorn
      </button>
      <button
        actions
        mat-stroked-button
        type="button"
        class="max-md:!hidden"
        [disabled]="busy() || !selectedOpen().length"
        [title]="selectedOpen().length ? '' : 'Kryssa först i de utlägg som ska markeras'"
        (click)="markExported()"
      >
        <mat-icon>task_alt</mat-icon> Markera som överlämnat{{
          selectedOpen().length ? ' (' + selectedOpen().length + ')' : ''
        }}
      </button>
      <button
        actions
        mat-flat-button
        color="primary"
        type="button"
        class="max-md:!hidden"
        (click)="add()"
      >
        <mat-icon>add</mat-icon> Nytt utlägg
      </button>
    </app-finance-tabs>
    <button
      mat-fab
      color="primary"
      type="button"
      aria-label="Nytt utlägg"
      class="!fixed right-4 bottom-20 z-10 md:!hidden"
      (click)="add()"
    >
      <mat-icon>add</mat-icon>
    </button>

    <div class="min-h-0 flex-1">
      <app-list-page
        [columns]="cols"
        [rows]="items()"
        [loading]="loading()"
        [newFab]="false"
        [defaultSort]="{ key: 'date', dir: -1 }"
        emptyText="Inga utlägg här. Fota ett kvitto med Nytt utlägg så hamnar det här."
        searchPlaceholder="Sök leverantör, kvittonr eller UTL-nummer…"
        (search)="searched($event)"
        (rowClick)="edit($event)"
      >
        @if (!orderId()) {
          <div filters class="inline-flex items-center gap-2">
            <span class="w-40">
              <app-date-field label="Från" subscript="dynamic" [formControl]="fromCtl" [max]="toCtl.value" />
            </span>
            <span class="w-40">
              <app-date-field label="Till" subscript="dynamic" [formControl]="toCtl" [min]="fromCtl.value" />
            </span>
            @if (fromCtl.value || toCtl.value) {
              <button
                mat-stroked-button
                type="button"
                class="btn-icon"
                title="Rensa datum"
                aria-label="Rensa datum"
                (click)="clearDates()"
              >
                <mat-icon>close</mat-icon>
              </button>
            }
          </div>
        }
        <app-segmented
          filters
          label="Status"
          [options]="[
            { value: 'all', label: 'Alla' },
            { value: 'open', label: 'Ej överlämnade' },
            { value: 'exported', label: 'Överlämnade' },
          ]"
          [value]="status()"
          (valueChange)="setStatus($any($event))"
        />
        <app-segmented
          filters
          label="Betalat med"
          [options]="[
            { value: 'all', label: 'Alla betalsätt' },
            { value: 'company_card', label: 'Företagskort' },
            { value: 'private', label: 'Privat' },
          ]"
          [value]="paidWith()"
          (valueChange)="setPaidWith($any($event))"
        />
        <button
          tools
          mat-stroked-button
          type="button"
          [disabled]="!items().length"
          (click)="toggleAll()"
        >
          {{ allSelected() ? 'Avmarkera alla' : 'Markera alla' }}
        </button>
        <button
          tools
          mat-stroked-button
          type="button"
          class="btn-icon md:!hidden"
          title="Fler åtgärder"
          aria-label="Fler åtgärder"
          [matMenuTriggerFor]="more"
        >
          <mat-icon>more_horiz</mat-icon>
        </button>

        <app-summary [flags]="flags()">{{ summaryText() }}</app-summary>
        @if (orderId()) {
          <app-callout
            class="mb-3"
            tone="info"
            [fixes]="[{ label: 'Visa alla', click: clearOrder }]"
          >
            Bara utlägg på <b>{{ orderCode() ?? 'arbetsordern' }}</b
            >.
          </app-callout>
        }

        <!-- Mobil: ett kompakt kort i stället för alla kolumner under varandra. -->
        <ng-template #card let-e="row">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate font-semibold">{{ e.supplier }}</div>
              <div class="text-xs text-gray-500">{{ e.date }} · {{ e.code }}</div>
              @if (e.workOrder?.code) {
                <div class="text-xs text-gray-500">{{ e.workOrder.code }}</div>
              }
            </div>
            <div class="shrink-0 text-right">
              <div class="font-semibold tabular-nums">{{ e.totalIncl | kr }}</div>
              <app-pill
                class="mt-1 inline-block"
                [tone]="e.paidWith === 'private' ? 'amber' : 'gray'"
                >{{ paidLabel(e.paidWith) }}</app-pill
              >
              @if (e.status === 'exported') {
                <app-pill class="mt-1 ml-1 inline-block" tone="green">Överlämnat</app-pill>
              }
            </div>
          </div>
        </ng-template>
        <ng-template #cell let-e="row" let-col="col" let-text="text">
          @switch (col.key) {
            @case ('code') {
              <span class="inline-flex items-center gap-2" (click)="$event.stopPropagation()">
                <mat-checkbox
                  [checked]="selected().has(e.id)"
                  [aria-label]="'Markera ' + e.code"
                  (change)="toggle(e.id)"
                />
                <span class="font-medium">{{ e.code }}</span>
              </span>
            }
            @case ('paidWith') {
              <app-pill [tone]="e.paidWith === 'private' ? 'amber' : 'gray'">{{ text }}</app-pill>
            }
            @case ('status') {
              <app-pill [tone]="e.status === 'exported' ? 'green' : 'gray'">{{ text }}</app-pill>
            }
            @default {
              {{ text }}
            }
          }
        </ng-template>
      </app-list-page>
    </div>
    <mat-menu #more="matMenu">
      <button mat-menu-item type="button" [disabled]="!!orderId() || busy()" (click)="exportZip()">
        <mat-icon>download</mat-icon> Exportera till revisorn
      </button>
      <button
        mat-menu-item
        type="button"
        [disabled]="busy() || !selectedOpen().length"
        (click)="markExported()"
      >
        <mat-icon>task_alt</mat-icon> Markera som överlämnat
      </button>
    </mat-menu>
  `,
})
export class ExpenseList {
  private readonly api = inject(ExpenseApi);
  private readonly opener = inject(ExpenseOpener);
  private readonly confirm = inject(Confirm);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly cols = COLS;
  readonly paidLabel = (w: ExpensePaidWith) => EXPENSE_PAID_WITH_LABELS[w];

  private readonly params = this.route.snapshot.queryParamMap;
  readonly fromCtl = new FormControl(this.params.get('from') ?? '', { nonNullable: true });
  readonly toCtl = new FormControl(this.params.get('to') ?? '', { nonNullable: true });
  readonly status = signal<ExpenseStatus | 'all'>(
    (this.params.get('status') as ExpenseStatus) || 'all',
  );
  readonly paidWith = signal<ExpensePaidWith | 'all'>(
    (this.params.get('paidWith') as ExpensePaidWith) || 'all',
  );
  /** Bara utlägget på en arbetsorder (länken från orderkortet); då gäller ingen månad. */
  readonly orderId = signal<string | null>(this.params.get('workOrderId'));
  readonly query = signal('');

  readonly items = signal<Expense[]>([]);
  readonly summary = signal<ExpenseSummary | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);

  /** De kryssade utläggen; töms när listan hämtas om. */
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly selectedOpen = computed(() =>
    this.items().filter((e) => this.selected().has(e.id) && e.status === 'open'),
  );
  readonly allSelected = computed(
    () => this.items().length > 0 && this.items().every((e) => this.selected().has(e.id)),
  );
  readonly orderCode = computed(
    () => this.items().find((e) => e.workOrder)?.workOrder?.code ?? null,
  );

  readonly summaryText = computed(() => {
    const s = this.summary();
    if (!s) return '';
    const rates = s.byRate
      .filter((r) => r.gross > 0)
      .map((r) => `moms ${r.rate} %: ${kr.transform(r.vat)}`)
      .join(' · ');
    return `${s.count} utlägg · ${kr.transform(s.total)}${rates ? ' · ' + rates : ''}`;
  });

  readonly flags = computed<SummaryFlag[]>(() => {
    const s = this.summary();
    if (!s) return [];
    const flags: SummaryFlag[] = [];
    const priv = s.byPaidWith.find((p) => p.paidWith === 'private');
    if (priv?.count) {
      flags.push({
        text: `${priv.count} privata · ${kr.transform(priv.total)} att ersätta`,
        tone: 'amber',
        click: () => this.setPaidWith('private'),
      });
    }
    if (s.byStatus.open) {
      flags.push({
        text: `${s.byStatus.open} ej överlämnade`,
        tone: 'amber',
        click: () => this.setStatus('open'),
      });
    }
    return flags;
  });

  constructor() {
    this.fromCtl.valueChanges.subscribe(() => this.dateChanged());
    this.toCtl.valueChanges.subscribe(() => this.dateChanged());
    this.load();
  }

  private dateChanged() {
    this.remember();
    this.load();
  }

  clearDates() {
    this.fromCtl.setValue('', { emitEvent: false });
    this.toCtl.setValue('', { emitEvent: false });
    this.dateChanged();
  }

  toggle(id: string) {
    const next = new Set(this.selected());
    if (!next.delete(id)) next.add(id);
    this.selected.set(next);
  }

  toggleAll() {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.items().map((e) => e.id)));
  }

  load() {
    this.loading.set(true);
    const filter = {
      from: this.orderId() ? undefined : this.fromCtl.value || undefined,
      to: this.orderId() ? undefined : this.toCtl.value || undefined,
      workOrderId: this.orderId() ?? undefined,
      q: this.query() || undefined,
      status: this.status() === 'all' ? undefined : (this.status() as ExpenseStatus),
      paidWith: this.paidWith() === 'all' ? undefined : (this.paidWith() as ExpensePaidWith),
    };
    this.api.list(filter).subscribe({
      next: (p) => {
        this.items.set(p.items);
        this.selected.set(new Set());
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.summary(filter).subscribe({ next: (s) => this.summary.set(s), error: () => {} });
  }

  private remember() {
    void this.router.navigate([], {
      queryParams: {
        from: this.orderId() ? null : this.fromCtl.value || null,
        to: this.orderId() ? null : this.toCtl.value || null,
        status: this.status() === 'all' ? null : this.status(),
        paidWith: this.paidWith() === 'all' ? null : this.paidWith(),
        workOrderId: this.orderId(),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  searched(q: string) {
    if (q === this.query()) return;
    this.query.set(q);
    this.load();
  }

  setStatus(s: ExpenseStatus | 'all') {
    this.status.set(s);
    this.remember();
    this.load();
  }

  setPaidWith(p: ExpensePaidWith | 'all') {
    this.paidWith.set(p);
    this.remember();
    this.load();
  }

  readonly clearOrder = () => {
    this.orderId.set(null);
    this.remember();
    this.load();
  };

  async add() {
    if (await this.opener.open()) this.load();
  }

  async edit(e: Expense) {
    if (await this.opener.open({ expense: e })) this.load();
  }

  // --- till revisorn ---

  /** Intervallet som exporteras: det som är valt, annars det listan täcker. */
  private exportRange(): { from: string; to: string } | null {
    const dates = this.items().map((e) => e.date).sort();
    const from = this.fromCtl.value || dates[0];
    const to = this.toCtl.value || dates[dates.length - 1];
    return from && to ? { from, to } : null;
  }

  exportZip() {
    const r = this.exportRange();
    if (!r) return;
    this.busy.set(true);
    this.api.exportPeriod(r.from, r.to, 'zip').subscribe({
      next: async (blob) => {
        this.busy.set(false);
        await saveFile(blob, `utlagg_${r.from}_${r.to}.zip`);
      },
      error: () => this.busy.set(false),
    });
  }

  markExported() {
    const picked = this.selectedOpen();
    if (!picked.length) return;
    this.confirm
      .ask({
        title: 'Markera som överlämnat?',
        message: `${picked.length} valda utlägg markeras som överlämnade till revisorn. De går inte att ändra efter det utan ditt uttryckliga val.`,
        confirmText: 'Markera',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.markExported({ ids: picked.map((e) => e.id) }).subscribe({
          next: (r) => {
            this.busy.set(false);
            this.snack.open(`${r.marked} utlägg markerades som överlämnade.`, undefined, {
              duration: 3000,
            });
            this.load();
          },
          error: () => this.busy.set(false),
        });
      });
  }
}
