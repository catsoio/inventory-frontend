import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs';
import { StorageApi } from '../../../core/api/storage-api';
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
    label: 'Avgift',
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
    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      <h1 class="mr-2 text-2xl font-semibold">Däckhotell</h1>
      <div class="relative max-w-md min-w-56 flex-1">
        <mat-icon class="pointer-events-none absolute top-2 left-2 text-gray-400">search</mat-icon>
        <input
          type="search"
          [formControl]="search"
          (keydown.enter)="openIfSingle()"
          placeholder="Sök regnr, kund, telefon, plats, märke…"
          class="focus:ring-brand h-10 w-full rounded-xl border-0 bg-white shadow-sm ring-1 ring-gray-200 pr-3 pl-10 outline-none focus:ring-2"
        />
      </div>
      <span class="flex-1"></span>
      <a mat-flat-button color="primary" routerLink="new"><mat-icon>add</mat-icon> Ny inlämning</a>
    </div>

    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="status()"
        (change)="setStatus($event.value)"
        aria-label="Status"
      >
        <mat-button-toggle value="stored">Inlagrade</mat-button-toggle>
        <mat-button-toggle value="picked_up">Utlämnade</mat-button-toggle>
        <mat-button-toggle value="">Alla</mat-button-toggle>
      </mat-button-toggle-group>
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="payment()"
        (change)="setPayment($event.value)"
        aria-label="Betalning"
      >
        <mat-button-toggle value="">Alla</mat-button-toggle>
        <mat-button-toggle value="unpaid">Obetalda</mat-button-toggle>
        <mat-button-toggle value="paid">Betalda</mat-button-toggle>
      </mat-button-toggle-group>
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="contentsFilter()"
        (change)="setContents($event.value)"
        aria-label="Innehåll"
      >
        <mat-button-toggle value="">Allt</mat-button-toggle>
        @for (c of contentsOptions; track c[0]) {
          <mat-button-toggle [value]="c[0]">{{ c[1] }}</mat-button-toggle>
        }
      </mat-button-toggle-group>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" [checked]="overdue()" (change)="setOverdue(!overdue())" />
        Skulle hämtats
      </label>
    </div>

    @if (summary(); as s) {
      <div class="mb-3 flex shrink-0 flex-wrap gap-2 text-sm">
        <span class="rounded-xl bg-white shadow-sm px-3 py-1"
          ><b>{{ s.stored }}</b> set inlagrade ({{ s.units }} st)</span
        >
        @if (s.unpaid) {
          <span class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-amber-900"
            ><b>{{ s.unpaid }}</b> obetalda · {{ s.unpaidAmount | kr }}</span
          >
        }
        @if (s.overdue) {
          <span class="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-red-900"
            ><b>{{ s.overdue }}</b> har passerat hämtdatum</span
          >
        }
      </div>
    }

    <div class="hidden min-h-0 flex-1 flex-col md:flex">
      <app-data-table
        class="min-h-0 flex-1"
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
          class="rounded-lg border-l-8 bg-white p-3 shadow-sm"
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
  private readonly api = inject(StorageApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly load$ = new Subject<number>();
  private readonly PAGE = inject(Settings).value().pageSize;

  readonly cols = COLS;
  readonly contentsOptions = Object.entries(STORAGE_CONTENTS_LABELS);
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
  readonly items = signal<StorageDeposit[]>([]);
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
