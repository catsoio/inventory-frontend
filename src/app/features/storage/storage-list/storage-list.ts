import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { StorageApi } from '../../../core/api/storage-api';
import { StorageRecallDialog } from '../storage-recall-dialog/storage-recall-dialog';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PaymentStatus,
  STORAGE_CONTENTS_LABELS,
  STORAGE_STATUS_LABELS,
  StorageContents,
  StorageDeposit,
  StorageStatus,
  StorageSummary,
} from '../../../core/models';
import { Settings } from '../../../core/settings';
import { DtCol } from '../../../shared/data-table/data-table';
import type { ItemKind } from '../../../shared/item-icon/item-icon';
import { KrPipe } from '../../../shared/kr-pipe';
import {
  LabelFormat,
  labelFormat,
  printStorageLabels,
  setLabelFormat,
} from '../../../shared/storage-print';
import { HOTEL_TABS } from '../../../shared/page-header/tabs';
import type { SegmentOption } from '../../../shared/toolbar/segmented';
import type { SummaryFlag } from '../../../shared/toolbar/summary';
import { contentsText, dateText } from '../storage-format';

const kr = new KrPipe();

const COLS: DtCol<StorageDeposit>[] = [
  { key: 'code', label: 'Nr', value: (d) => d.number, fmt: (d) => d.code },
  { key: 'regNo', label: 'Regnr', value: (d) => d.vehicle.regNo },
  {
    key: 'vehicle',
    label: 'Bil',
    value: (d) => [d.vehicle.make, d.vehicle.model].filter(Boolean).join(' '),
    fmt: (d) => [d.vehicle.make, d.vehicle.model].filter(Boolean).join(' ') || '–',
  },
  { key: 'customer', label: 'Kund', value: (d) => d.customer.name },
  {
    key: 'phone',
    label: 'Telefon',
    value: (d) => d.customer.phone ?? '',
    fmt: (d) => d.customer.phone || '–',
  },
  { key: 'contents', label: 'Innehåll', value: (d) => contentsText(d) },
  {
    key: 'location',
    label: 'Plats',
    value: (d) => d.location ?? '',
    fmt: (d) => d.location || '–',
  },
  {
    key: 'depositedAt',
    label: 'Inlämnad',
    value: (d) => d.depositedAt,
    fmt: (d) => dateText(d.depositedAt),
  },
  {
    key: 'expected',
    label: 'Hämtas',
    value: (d) => d.expectedPickupAt ?? '',
    fmt: (d) => dateText(d.expectedPickupAt),
  },
  { key: 'days', label: 'Dagar', right: true, value: (d) => d.daysStored },
  {
    key: 'fee',
    label: 'Avgift exkl. moms',
    right: true,
    value: (d) => d.fee,
    fmt: (d) => kr.transform(d.fee),
  },
  {
    key: 'payment',
    label: 'Betalning',
    value: (d) => PAYMENT_STATUS_LABELS[d.paymentStatus],
    fmt: (d) =>
      PAYMENT_STATUS_LABELS[d.paymentStatus] +
      (d.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[d.paymentMethod]}` : ''),
  },
  {
    key: 'status',
    label: 'Status',
    value: (d) => STORAGE_STATUS_LABELS[d.status],
  },
];

type StatusFilter = StorageStatus | '';
type PaymentFilter = PaymentStatus | '';

@Component({
  selector: 'app-storage-list',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-page-header [tabs]="tabs" [desktopOnly]="true" label="Däckhotell">
      <div actions class="contents">
        <button mat-stroked-button type="button" (click)="openRecall()">
          <mat-icon>sms</mat-icon> Kalla in
        </button>
        <button
          mat-stroked-button
          type="button"
          [disabled]="!items().length"
          [matMenuTriggerFor]="printMenu"
        >
          <mat-icon>print</mat-icon> Skriv ut etiketter ({{ items().length }})
          <mat-icon iconPositionEnd>arrow_drop_down</mat-icon>
        </button>
        <mat-menu #printMenu="matMenu">
          <button mat-menu-item type="button" (click)="printLabels('a4')">
            <mat-icon>{{ format() === 'a4' ? 'check' : '' }}</mat-icon> A4, tre per ark
          </button>
          <button mat-menu-item type="button" (click)="printLabels('roll')">
            <mat-icon>{{ format() === 'roll' ? 'check' : '' }}</mat-icon> Rullskrivare, 100 × 50 mm
          </button>
        </mat-menu>
        <a mat-flat-button color="primary" routerLink="new"
          ><mat-icon>add</mat-icon> Ny inlämning</a
        >
      </div>
    </app-page-header>

    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      <app-search-field
        class="w-full md:w-80"
        [control]="search"
        placeholder="Sök regnr, kund, telefon, plats, märke…"
        (enter)="openIfSingle()"
      />
      <app-segmented
        label="Status"
        [options]="statusOptions"
        [value]="status()"
        (valueChange)="setStatus($any($event))"
      />
      <app-filter-button [count]="activeExtra()" (clear)="clearFilters()">
        <div>
          <div class="sec">Betalning</div>
          <app-segmented
            [fill]="true"
            label="Betalning"
            [options]="paymentOptions"
            [value]="payment()"
            (valueChange)="setPayment($any($event))"
          />
        </div>
        <div>
          <div class="sec">Innehåll</div>
          <app-segmented
            [fill]="true"
            label="Innehåll"
            [options]="contentsOptions"
            [value]="contentsFilter()"
            (valueChange)="setContents($any($event))"
          />
        </div>
        <mat-checkbox [checked]="overdue()" (change)="setOverdue($event.checked)">
          Skulle hämtats
        </mat-checkbox>
      </app-filter-button>
      <span class="flex-1 max-md:hidden"></span>
      <button
        mat-stroked-button
        type="button"
        class="btn-icon max-md:!hidden"
        title="Filtrera per kolumn"
        aria-label="Filtrera per kolumn"
        [class.is-on]="table.showFilters()"
        (click)="table.showFilters.set(!table.showFilters())"
      >
        <mat-icon>filter_alt</mat-icon>
      </button>
    </div>

    @if (summary(); as s) {
      <app-summary [flags]="flags()">
        <b>{{ s.stored }}</b> set inlagrade · {{ s.units }} st
      </app-summary>
    }

    <div class="hidden min-h-0 flex-1 flex-col md:flex">
      <app-data-table
        #table
        class="min-h-0 flex-1"
        [chrome]="false"
        [columns]="cols"
        [rows]="items()"
        [clickable]="true"
        [emptyText]="loading() ? 'Laddar…' : 'Inga inlämningar hittades.'"
        (rowClick)="open($event)"
      >
        <ng-template #cell let-d="row" let-c="col" let-text="text">
          @if (c.key === 'payment') {
            <app-pill [tone]="d.paymentStatus === 'paid' ? 'green' : 'amber'">{{ text }}</app-pill>
          } @else if (c.key === 'status') {
            <app-pill [tone]="d.status === 'stored' ? (d.overdue ? 'red' : 'blue') : 'gray'">{{
              d.overdue ? 'Passerat hämtdatum' : text
            }}</app-pill>
          } @else if (c.key === 'regNo') {
            <app-reg-plate [value]="text" size="sm" />
          } @else if (c.key === 'contents') {
            <span class="inline-flex items-center gap-3">
              <app-item-icon [kind]="kindOf(d)" />{{ text }}
            </span>
          } @else {
            {{ text }}
          }
        </ng-template>
      </app-data-table>
    </div>

    <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto md:hidden">
      @for (d of items(); track d.id) {
        <a
          [routerLink]="d.id"
          class="rounded-lg border-l-8 bg-white p-2.5 shadow-sm"
          [class]="
            d.status === 'picked_up'
              ? 'border-gray-300'
              : d.overdue
                ? 'border-red-500'
                : 'border-blue-500'
          "
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-3">
              <app-item-icon [kind]="kindOf(d)" />
              <app-reg-plate [value]="d.vehicle.regNo" />
            </div>
            <app-pill [tone]="d.paymentStatus === 'paid' ? 'green' : 'amber'">{{
              paymentLabels[d.paymentStatus]
            }}</app-pill>
          </div>
          <div class="text-gray-700">{{ d.customer.name }}</div>
          <div class="text-sm text-gray-500">{{ contents(d) }}</div>
          <div class="mt-1 flex justify-between text-sm">
            <span>{{ d.code }} · {{ d.location || 'Ingen plats' }}</span>
            <span>{{ statusLabels[d.status] }}</span>
          </div>
        </a>
      }
      @if (!loading() && !items().length) {
        <p class="mt-6 text-center text-gray-500">Inga inlämningar hittades.</p>
      }
    </div>

    <a
      mat-fab
      color="primary"
      routerLink="new"
      aria-label="Ny inlämning"
      class="!fixed right-4 bottom-20 z-10 md:!hidden"
      ><mat-icon>add</mat-icon></a
    >

    @if (loading()) {
      <mat-progress-bar class="mt-2 shrink-0" mode="indeterminate" />
    }
    @if (total() > items().length) {
      <div class="my-2 shrink-0 text-center">
        <button mat-stroked-button (click)="more()">
          Visa fler ({{ items().length }} av {{ total() }})
        </button>
      </div>
    }
  `,
})
export class StorageList implements OnInit {
  readonly tabs = HOTEL_TABS;
  openRecall() {
    this.dialog.open(StorageRecallDialog, { width: '720px', maxWidth: '95vw' });
  }

  private readonly api = inject(StorageApi);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly load$ = new Subject<number>();
  private readonly PAGE = inject(Settings).value().pageSize;

  readonly cols = COLS;
  readonly statusOptions: SegmentOption[] = [
    { value: 'stored', label: 'Inlagrade' },
    { value: 'picked_up', label: 'Utlämnade' },
    { value: '', label: 'Alla' },
  ];
  readonly paymentOptions: SegmentOption[] = [
    { value: '', label: 'Alla' },
    { value: 'unpaid', label: 'Obetalda' },
    { value: 'paid', label: 'Betalda' },
  ];
  readonly contentsOptions: SegmentOption[] = [
    { value: '', label: 'Allt' },
    ...Object.entries(STORAGE_CONTENTS_LABELS).map(([value, label]) => ({ value, label })),
  ];
  readonly paymentLabels = PAYMENT_STATUS_LABELS;
  readonly statusLabels = STORAGE_STATUS_LABELS;
  readonly contents = contentsText;
  readonly kindOf = (d: StorageDeposit): ItemKind =>
    d.contents === 'tyres' ? 'tyre' : d.contents === 'rims' ? 'rim' : 'wheel';
  readonly search = new FormControl('', { nonNullable: true });

  readonly status = signal<StatusFilter>('stored');
  readonly payment = signal<PaymentFilter>('');
  readonly contentsFilter = signal<StorageContents | ''>('');
  readonly overdue = signal(false);
  /** Antal filter bakom Filter-knappen (status ligger synlig i verktygsraden). */
  readonly activeExtra = () =>
    (this.payment() ? 1 : 0) + (this.contentsFilter() ? 1 : 0) + (this.overdue() ? 1 : 0);
  readonly items = signal<StorageDeposit[]>([]);

  /** Etikettformatet som valts i den här webbläsaren. */
  readonly format = signal<LabelFormat>(labelFormat());

  /** Etiketter för det listan visar just nu. Formatet som väljs här minns webbläsaren till nästa gång. */
  printLabels(f: LabelFormat) {
    setLabelFormat(f);
    this.format.set(f);
    void printStorageLabels(this.items(), f);
  }

  readonly total = signal(0);
  readonly loading = signal(false);
  readonly summary = signal<StorageSummary | null>(null);

  ngOnInit() {
    this.search.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load$.next(0));

    this.load$
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((offset) =>
          this.api.deposits({
            q: this.search.value.trim() || undefined,
            status: this.status() || undefined,
            paymentStatus: this.payment() || undefined,
            contents: this.contentsFilter() || undefined,
            overdue: this.overdue() || undefined,
            limit: this.PAGE,
            offset,
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (p) => {
          this.items.update((cur) => (p.pagination.offset === 0 ? p.items : [...cur, ...p.items]));
          this.total.set(p.pagination.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });

    // Måste prenumereras efter load$ så att första emissionen inte tappas.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
      this.search.setValue(q.get('q') ?? '', { emitEvent: false });
      this.status.set((q.get('status') as StatusFilter | null) ?? 'stored');
      this.payment.set((q.get('paymentStatus') as PaymentFilter | null) ?? '');
      this.overdue.set(q.get('overdue') === 'true');
      this.load$.next(0);
    });
    this.api.summary().subscribe((s) => this.summary.set(s));
  }

  /** Det som väntar på någon (obetalt, försenat) som genvägar till filtret som visar just de. */
  readonly flags = computed<SummaryFlag[]>(() => {
    const s = this.summary();
    if (!s) return [];
    const out: SummaryFlag[] = [];
    if (s.unpaid) {
      out.push({
        text: `${s.unpaid} obetalda · ${kr.transform(s.unpaidAmount)}`,
        tone: 'amber',
        click: () => {
          this.status.set('');
          this.setPayment('unpaid');
        },
      });
    }
    if (s.overdue) {
      out.push({ text: `${s.overdue} försenade`, tone: 'red', click: () => this.setOverdue(true) });
    }
    return out;
  });

  clearFilters() {
    this.payment.set('');
    this.contentsFilter.set('');
    this.overdue.set(false);
    this.load$.next(0);
  }

  setStatus(v: StatusFilter) {
    this.status.set(v);
    this.load$.next(0);
  }

  setPayment(v: PaymentFilter) {
    this.payment.set(v);
    this.load$.next(0);
  }

  setContents(v: StorageContents | '') {
    this.contentsFilter.set(v);
    this.load$.next(0);
  }

  setOverdue(v: boolean) {
    this.overdue.set(v);
    this.load$.next(0);
  }

  more() {
    this.load$.next(this.items().length);
  }

  open(d: StorageDeposit) {
    this.router.navigate(['/storage', d.id]);
  }

  openIfSingle() {
    const [only, ...rest] = this.items();
    if (only && !rest.length) this.open(only);
  }
}
