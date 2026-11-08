import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { appLocale } from '../../core/i18n/locale';
import { PurchaseCardApi } from '../../core/api/purchase-card-api';
import { SupplierCatalogApi } from '../../core/api/supplier-catalog-api';
import { Auth } from '../../core/auth/auth';
import { CatalogOrder, PurchaseCard } from '../../core/models';
import { DtCol } from '../../shared/data-table/data-table';
import { KrPipe } from '../../shared/kr-pipe';
import { SharedModule } from '../../shared/shared-module';

const kr = new KrPipe();
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(appLocale()) : '–';

const statusOf = (c: PurchaseCard) => (c.status === 'draft' ? 'Utkast' : 'Bokfört');

const COLS: DtCol<PurchaseCard>[] = [
  { key: 'code', label: 'Nr', value: (c) => c.number },
  {
    key: 'date',
    label: 'Datum',
    value: (c) => c.purchasedAt ?? c.createdAt,
    fmt: (c) => day(c.purchasedAt ?? c.createdAt),
  },
  { key: 'supplier', label: 'Leverantör', value: (c) => c.supplier?.name ?? '' },
  { key: 'reference', label: 'Referens', value: (c) => c.reference ?? '' },
  { key: 'lines', label: 'Rader', right: true, value: (c) => c.lines.length },
  { key: 'units', label: 'Antal', right: true, value: (c) => c.units },
  {
    key: 'total',
    label: 'Summa exkl. moms',
    right: true,
    value: (c) => c.total,
    fmt: (c) => kr.transform(c.total),
  },
  { key: 'document', label: 'Dokument', value: (c) => c.documentCode ?? '' },
  { key: 'status', label: 'Status', value: statusOf },
];

type Filter = 'all' | 'draft' | 'posted';

/** Tidigare beställningar hos Gummigrossen: välj en, så blir den ett inköpsutkast med raderna. */
@Component({
  selector: 'app-gummigrossen-orders-dialog',
  imports: [SharedModule],
  template: `
    <h2 mat-dialog-title>Beställningar hos Gummigrossen</h2>
    <mat-dialog-content>
      <p class="mb-3 text-sm text-gray-600">
        Välj en beställning som ni redan har fått. Den blir ett inköpsutkast med artiklarna och
        priserna ni betalade, och artiklar som saknas läggs in med uppgifter från katalogen. Inget
        bokförs förrän ni gör det på inköpskortet.
      </p>
      @if (loading() && !orders().length) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="flex flex-col divide-y divide-gray-100">
        @for (o of orders(); track o.id) {
          <div class="flex items-center justify-between gap-3 py-2.5">
            <div class="min-w-0">
              <div class="font-medium">Order {{ o.id }}</div>
              <div class="text-sm text-gray-500">
                {{ o.date }} · {{ kr(o.totalExVat) }} exkl. moms
              </div>
            </div>
            @if (o.imported; as i) {
              <button mat-stroked-button type="button" (click)="open(o)">
                Öppna IK-{{ ('0000' + i.number).slice(-5) }}
              </button>
            } @else {
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="busyId() !== null"
                (click)="open(o)"
              >
                {{ busyId() === o.id ? 'Hämtar…' : 'Hämta' }}
              </button>
            }
          </div>
        } @empty {
          @if (!loading()) {
            <p class="py-4 text-sm text-gray-500">Inga beställningar hittades.</p>
          }
        }
      </div>
      @if (orders().length < total()) {
        <button mat-button type="button" class="mt-2" [disabled]="loading()" (click)="more()">
          Visa fler
        </button>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Stäng</button>
    </mat-dialog-actions>
  `,
})
export class GummigrossenOrdersDialog {
  private readonly api = inject(SupplierCatalogApi);
  private readonly ref = inject<MatDialogRef<GummigrossenOrdersDialog, PurchaseCard>>(MatDialogRef);
  readonly kr = (ore: number) => kr.transform(ore);
  readonly orders = signal<CatalogOrder[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly busyId = signal<string | null>(null);

  constructor() {
    this.more();
  }

  more() {
    this.loading.set(true);
    this.api.orders(this.orders().length, 10).subscribe({
      next: (r) => {
        this.orders.update((l) => [...l, ...r.items]);
        this.total.set(r.count);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(o: CatalogOrder) {
    this.busyId.set(o.id);
    this.api.importOrder(o.id).subscribe({
      next: (c) => this.ref.close(c),
      error: () => this.busyId.set(null),
    });
  }
}

/** Inköpskorten: utkast och bokförda inköp, en rad per kort, som försäljningslistan. */
@Component({
  selector: 'app-purchase-list',
  imports: [SharedModule],
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-list-page
      title="Inköp"
      [columns]="cols"
      [rows]="items()"
      [loading]="loading()"
      newLink="/purchases/new"
      newLabel="Nytt inköp"
      emptyText="Inga inköp än. Skapa ett med knappen."
      searchPlaceholder="Sök nummer, leverantör eller referens…"
      (search)="q.set($event); load()"
      (rowClick)="router.navigate(['/purchases', $event.id])"
    >
      <div actions class="flex items-center gap-2">
        @if (fromSupplier()) {
          <button mat-stroked-button type="button" (click)="openOrders()">
            <mat-icon>cloud_download</mat-icon> Hämta från Gummigrossen
          </button>
        }
        <a mat-stroked-button routerLink="/purchases/documents">Äldre inköp</a>
      </div>
      <div class="mb-3 flex shrink-0 flex-wrap items-center gap-3">
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [value]="filter()"
          (change)="filter.set($event.value); load()"
          aria-label="Visa"
        >
          <mat-button-toggle value="all">Alla</mat-button-toggle>
          <mat-button-toggle value="draft">Utkast</mat-button-toggle>
          <mat-button-toggle value="posted">Bokförda</mat-button-toggle>
        </mat-button-toggle-group>
        <span class="text-sm text-gray-600">{{ items().length }} st · {{ sum() }}</span>
      </div>
      <ng-template #card let-c="row">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="font-semibold">{{ c.code }}</span>
              <span class="text-xs text-gray-500">{{ dateOf(c) }}</span>
            </div>
            <div class="truncate text-sm text-gray-700">
              {{ c.supplier?.name ?? 'Okänd leverantör' }}
            </div>
            <div class="text-xs text-gray-500">{{ c.lines.length }} rader, {{ c.units }} st</div>
          </div>
          <div class="shrink-0 text-right">
            <div class="font-semibold tabular-nums">{{ kr(c.total) }}</div>
            <app-pill class="mt-1 inline-block" [tone]="c.status === 'draft' ? 'amber' : 'green'">{{
              statusOf(c)
            }}</app-pill>
          </div>
        </div>
      </ng-template>
      <ng-template #cell let-c="row" let-col="col" let-text="text">
        @if (col.key === 'status') {
          <app-pill [tone]="c.status === 'draft' ? 'amber' : 'green'">{{ text }}</app-pill>
        } @else if (col.key === 'code') {
          {{ c.code }}
        } @else if (col.key === 'supplier' || col.key === 'reference') {
          {{ text || '–' }}
        } @else {
          {{ text }}
        }
      </ng-template>
    </app-list-page>
  `,
})
export class PurchaseList {
  private readonly api = inject(PurchaseCardApi);
  readonly router = inject(Router);
  readonly cols = COLS;
  readonly statusOf = statusOf;
  readonly kr = (ore: number) => kr.transform(ore);
  readonly dateOf = (c: PurchaseCard) => day(c.purchasedAt ?? c.createdAt);
  private readonly dialog = inject(MatDialog);
  private readonly catalog = inject(SupplierCatalogApi);
  /** Tidigare beställningar hos grossisten kan hämtas av ägaren när grossisten är ansluten. */
  readonly fromSupplier = signal(false);
  readonly items = signal<PurchaseCard[]>([]);
  readonly loading = signal(true);
  readonly q = signal('');
  readonly filter = signal<Filter>(this.initialFilter());
  readonly sum = computed(() => kr.transform(this.items().reduce((s, c) => s + c.total, 0)));

  constructor() {
    this.load();
    if (inject(Auth).isAdmin()) {
      this.catalog
        .status()
        .subscribe({ next: (s) => this.fromSupplier.set(s.connected), error: () => {} });
    }
  }

  openOrders() {
    this.dialog
      .open(GummigrossenOrdersDialog, { width: '640px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((c: PurchaseCard | undefined) => {
        if (c) void this.router.navigate(['/purchases', c.id]);
      });
  }

  private initialFilter(): Filter {
    const v = inject(ActivatedRoute).snapshot.queryParamMap.get('show');
    return v === 'draft' || v === 'posted' ? v : 'all';
  }

  load() {
    const f = this.filter();
    this.loading.set(true);
    this.api
      .list({
        q: this.q() || undefined,
        status: f === 'all' ? undefined : f,
        limit: 100,
      })
      .subscribe({
        next: (p) => {
          this.items.set(p.items);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
