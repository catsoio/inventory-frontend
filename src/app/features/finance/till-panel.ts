import { Component, OnInit, computed, inject, isDevMode, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EMPTY, debounceTime, distinctUntilChanged, expand, reduce, switchMap } from 'rxjs';
import { AxleApi } from '../../core/api/axle-api';
import { ZettleApi } from '../../core/api/zettle-api';
import { appLocale } from '../../core/i18n/locale';
import { Article, PosProduct, PosSale, ZettleStatus, ZettleSyncResult } from '../../core/models';
import { Confirm } from '../../shared/confirm';

type Period = 'today' | '7' | '30';

const METHOD: Record<string, string> = { card: 'Kort', swish: 'Swish', cash: 'Kontant' };

/** Början av en dag i webbläsarens tid som ÅÅÅÅ-MM-DD (servern läser den som svensk kalenderdag). */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * PayPal-kassan bredvid Axle (PayPal Point of Sale, tidigare Zettle): köpen som slagits in i PayPals
 * app och lästs in hit, med summor per betalsätt att stämma av mot dagen, vad som drogs ur lagret,
 * och artiklarna som ligger i kassans produktlista. Kassan är kassaregistret; Axle registrerar inget.
 */
@Component({
  selector: 'app-till-panel',
  standalone: false,
  template: `
    @if (status(); as st) {
      @if (!st.connected) {
        <div class="rounded-xl bg-white p-6 shadow-sm">
          <h2 class="text-base font-semibold">Ingen kassa är kopplad</h2>
          <p class="mt-1 max-w-2xl text-sm text-gray-600">
            Kunder som köper vid disken utan faktura (anonyma köp) ska registreras i ett godkänt
            kassaregister. Koppla PayPal-kassan (Zettle): köpen slås in i PayPals app och läses in
            hit, så lagret dras och köpen syns här och i momsrapporten.
          </p>
          <button
            mat-flat-button
            color="primary"
            type="button"
            class="mt-3"
            (click)="openConnections()"
          >
            <mat-icon>point_of_sale</mat-icon> Koppla PayPal-kassan
          </button>
        </div>
      } @else {
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <mat-button-toggle-group
            [value]="period()"
            (change)="setPeriod($event.value)"
            aria-label="Period"
            hideSingleSelectionIndicator
          >
            <mat-button-toggle value="today">Idag</mat-button-toggle>
            <mat-button-toggle value="7">7 dagar</mat-button-toggle>
            <mat-button-toggle value="30">30 dagar</mat-button-toggle>
          </mat-button-toggle-group>
          <span class="text-sm text-gray-500">
            PayPal-kassan ·
            {{ st.lastSyncAt ? 'senast inläst ' + time(st.lastSyncAt) : 'inget inläst än' }}
          </span>
          <span class="flex-1"></span>
          <button mat-stroked-button type="button" [disabled]="busy()" (click)="sync()">
            <mat-icon>sync</mat-icon> Hämta köp nu
          </button>
        </div>
        @if (st.lastSyncError) {
          <app-callout
            tone="error"
            class="mb-4"
            [fixes]="[{ label: 'Öppna Anslutningar', icon: 'settings', click: openConnections }]"
          >
            Senaste inläsningen misslyckades: {{ st.lastSyncError }}
          </app-callout>
        }

        <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-xl bg-white p-4 shadow-sm">
            <div class="text-sm text-gray-500">Sålt (inkl. moms)</div>
            <div class="text-2xl font-semibold tabular-nums">{{ totals().net | kr }}</div>
            <div class="text-xs text-gray-500">
              {{ totals().count }} köp{{
                totals().refunds ? ' · ' + totals().refunds + ' returer' : ''
              }}
            </div>
          </div>
          @for (m of totals().methods; track m.label) {
            <div class="rounded-xl bg-white p-4 shadow-sm">
              <div class="text-sm text-gray-500">{{ m.label }}</div>
              <div class="text-2xl font-semibold tabular-nums">{{ m.amount | kr }}</div>
            </div>
          }
          <div class="rounded-xl bg-white p-4 shadow-sm">
            <div class="text-sm text-gray-500">Varav moms</div>
            <div class="text-2xl font-semibold tabular-nums">{{ totals().vat | kr }}</div>
          </div>
        </div>

        <section class="mb-4 rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Köp i kassan</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th class="sticky left-0 bg-white py-2 pr-3">Nr</th>
                  <th class="pr-3">Tid</th>
                  <th class="pr-3">Varor</th>
                  <th class="pr-3">Betalning</th>
                  <th class="pr-3 text-right">Belopp</th>
                  <th class="pr-3">Lager</th>
                </tr>
              </thead>
              <tbody>
                @for (s of sales(); track s.id) {
                  <tr
                    class="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    (click)="toggle(s.id)"
                  >
                    <td class="sticky left-0 bg-white py-2 pr-3 tabular-nums whitespace-nowrap">
                      {{ s.stockReference ?? 'KASSA-' + (s.number ?? '') }}
                    </td>
                    <td class="pr-3 whitespace-nowrap">{{ time(s.soldAt) }}</td>
                    <td class="pr-3">
                      @if (s.refund) {
                        <app-pill tone="amber">Retur</app-pill>
                      }
                      {{ goods(s) }}
                    </td>
                    <td class="pr-3 whitespace-nowrap">{{ paid(s) }}</td>
                    <td class="pr-3 text-right tabular-nums whitespace-nowrap">
                      {{ (s.refund ? -s.amount : s.amount) | kr }}
                    </td>
                    <td class="pr-3">
                      @if (stockProblems(s); as n) {
                        <app-pill tone="amber">{{
                          n === 1 ? '1 rad drogs inte' : n + ' rader drogs inte'
                        }}</app-pill>
                      } @else if (s.stockReference) {
                        <app-pill tone="green">Draget</app-pill>
                      } @else {
                        <span class="text-gray-400">–</span>
                      }
                    </td>
                  </tr>
                  @if (open() === s.id) {
                    <tr class="border-b border-gray-100 bg-gray-50">
                      <td colspan="6" class="px-3 py-2">
                        <table class="w-full text-sm">
                          @for (r of s.rows; track $index) {
                            <tr>
                              <td class="py-0.5 pr-3">{{ r.quantity }} ×</td>
                              <td class="w-full py-0.5 pr-3">
                                {{ r.name }}{{ r.variant ? ' · ' + r.variant : '' }}
                                @if (r.articleId) {
                                  <a
                                    class="ml-1 text-teal-700 underline"
                                    [routerLink]="['/inventory', r.articleId]"
                                    (click)="$event.stopPropagation()"
                                    >artikel</a
                                  >
                                }
                              </td>
                              <td class="py-0.5 pr-3 text-right tabular-nums whitespace-nowrap">
                                {{ r.amount | kr }}
                              </td>
                              <td class="py-0.5 whitespace-nowrap text-gray-600">
                                {{ stockText(r.stock, r.stockNote) }}
                              </td>
                            </tr>
                          }
                        </table>
                        <p class="mt-1 text-xs text-gray-500">
                          Moms {{ s.vat | kr }}{{ s.seller ? ' · tog betalt: ' + s.seller : '' }}
                          @if (s.stockError) {
                            · lagret drogs inte: {{ s.stockError }}
                          }
                        </p>
                      </td>
                    </tr>
                  }
                } @empty {
                  <tr>
                    <td colspan="6" class="py-6 text-center text-gray-500">
                      {{ loading() ? 'Läser in…' : 'Inga köp i kassan under perioden.' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="mt-2 text-xs text-gray-500">
            Köpen slås in i PayPals app och läses in hit av sig själva med några minuters mellanrum.
            En retur görs i PayPals app; varorna läggs tillbaka i lagret om köpet drog dem.
          </p>
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="mb-2 flex flex-wrap items-center gap-3">
            <h2 class="mr-auto text-base font-semibold">Varor i kassan</h2>
            <button
              mat-button
              type="button"
              [disabled]="busy() || !products().length"
              (click)="pushAll()"
            >
              Skicka alla igen
            </button>
          </div>
          <p class="mb-3 max-w-3xl text-sm text-gray-600">
            Artiklarna här ligger i PayPal-kassans produktlista med namn och pris från Axle. Ändras
            namnet eller priset här i Axle skickas det dit, och ett köp av varan drar lagret.
          </p>
          <mat-form-field class="w-full max-w-md" subscriptSizing="dynamic">
            <mat-label>Lägg till artikel i kassan</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [formControl]="search" [matAutocomplete]="auto" />
            <mat-autocomplete
              #auto="matAutocomplete"
              (optionSelected)="add($event.option.value); search.setValue('')"
            >
              @for (a of hits(); track a.id) {
                <mat-option [value]="a">
                  <span>{{ a.label }}</span>
                  <span class="ml-2 text-xs text-gray-500"
                    >{{ a.code }} · {{ a.sellPrice | kr }} · {{ a.quantity }} st</span
                  >
                </mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          <table class="mt-3 w-full text-left text-sm">
            <tbody>
              @for (p of products(); track p.articleId) {
                <tr class="border-b border-gray-100">
                  <td class="py-2 pr-3 tabular-nums whitespace-nowrap text-gray-500">
                    {{ p.code }}
                  </td>
                  <td class="w-full pr-3">
                    {{ p.label }}
                    @if (p.state === 'error') {
                      <div class="text-xs text-red-700">
                        Kassan tog inte emot den: {{ p.message }}
                      </div>
                    }
                  </td>
                  <td class="pr-3 text-right tabular-nums whitespace-nowrap">
                    {{ p.sellPrice | kr }}
                  </td>
                  <td class="pr-3 text-right tabular-nums whitespace-nowrap">
                    {{ p.quantity }} st
                  </td>
                  <td class="pr-3">
                    @if (p.state === 'ok') {
                      <app-pill tone="green">I kassan</app-pill>
                    } @else if (p.state === 'error') {
                      <app-pill tone="red">Fel</app-pill>
                    } @else {
                      <app-pill>Skickas</app-pill>
                    }
                  </td>
                  <td class="text-right whitespace-nowrap">
                    @if (dev) {
                      <button mat-button type="button" [disabled]="busy()" (click)="testSale(p)">
                        Testköp
                      </button>
                    }
                    <button
                      mat-icon-button
                      type="button"
                      aria-label="Ta bort ur kassan"
                      [disabled]="busy()"
                      (click)="remove(p)"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td class="py-4 text-gray-500">
                    Inga artiklar i kassan än. Lägg till det ni säljer vid disken, till exempel
                    spolarvätska, torkarblad och lösa däck.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }
    } @else {
      <p class="p-4 text-gray-500">Läser in…</p>
    }
  `,
})
export class TillPanel implements OnInit {
  private readonly api = inject(ZettleApi);
  private readonly articles = inject(AxleApi);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly dialog = inject(MatDialog);

  /** Testköp i låtsaskassan; servern nekar det mot en riktig kassa. */
  readonly dev = isDevMode();
  readonly status = signal<ZettleStatus | null>(null);
  readonly period = signal<Period>('today');
  readonly sales = signal<PosSale[]>([]);
  readonly products = signal<PosProduct[]>([]);
  readonly hits = signal<Article[]>([]);
  readonly open = signal<string | null>(null);
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly search = new FormControl<string | Article>('', { nonNullable: true });

  /** Summor att stämma av mot dagen: sålt minus returer, per betalsätt. */
  readonly totals = computed(() => {
    const byMethod = new Map<string, number>();
    let net = 0;
    let vat = 0;
    let count = 0;
    let refunds = 0;
    for (const s of this.sales()) {
      const sign = s.refund ? -1 : 1;
      net += sign * s.amount;
      vat += sign * s.vat;
      if (s.refund) refunds++;
      else count++;
      for (const p of s.payments) {
        const label = METHOD[p.method] ?? p.label ?? 'Annat';
        byMethod.set(label, (byMethod.get(label) ?? 0) + sign * p.amount);
      }
    }
    // Kort, Swish och kontant först i den ordningen, andra betalsätt efter.
    const rank = (label: string) => {
      const i = ['Kort', 'Swish', 'Kontant'].indexOf(label);
      return i < 0 ? 9 : i;
    };
    const methods = [...byMethod.entries()]
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => rank(a.label) - rank(b.label));
    return { net, vat, count, refunds, methods };
  });

  ngOnInit() {
    this.api.status().subscribe((s) => {
      this.status.set(s);
      if (!s.connected) return;
      this.loadSales();
      this.loadProducts();
    });
    this.search.valueChanges
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) =>
          typeof q === 'string' && q.trim().length >= 2
            ? this.articles.articles({ q: q.trim(), limit: 10 })
            : EMPTY,
        ),
      )
      .subscribe((page) => this.hits.set(page.items));
  }

  setPeriod(p: Period) {
    this.period.set(p);
    this.loadSales();
  }

  /** Hämtar hela perioden, högst 1 000 köp, så att summorna stämmer. */
  loadSales() {
    const days = this.period() === 'today' ? 0 : Number(this.period()) - 1;
    const from = ymd(new Date(Date.now() - days * 86_400_000));
    const to = ymd(new Date());
    const LIMIT = 100;
    this.loading.set(true);
    this.api
      .sales({ from, to, limit: LIMIT, offset: 0 })
      .pipe(
        expand((p) => {
          const next = p.pagination.offset + p.pagination.limit;
          return next < p.pagination.total && next < 1000
            ? this.api.sales({ from, to, limit: LIMIT, offset: next })
            : EMPTY;
        }),
        reduce((all, p) => all.concat(p.items), [] as PosSale[]),
      )
      .subscribe({
        next: (all) => {
          this.sales.set(all);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  loadProducts() {
    this.api.products().subscribe((p) => this.products.set(p));
  }

  sync() {
    this.busy.set(true);
    this.api.sync().subscribe({
      next: (r) => {
        this.busy.set(false);
        this.snack.open(this.syncText(r), 'OK', { duration: 5000 });
        this.api.status().subscribe((s) => this.status.set(s));
        this.loadSales();
        this.loadProducts();
      },
      error: () => {
        this.busy.set(false);
        this.api.status().subscribe((s) => this.status.set(s));
      },
    });
  }

  add(a: Article | string) {
    if (typeof a === 'string') return;
    this.busy.set(true);
    this.api.addProducts([a.id]).subscribe({
      next: (list) => {
        this.busy.set(false);
        this.products.set(list);
        const p = list.find((x) => x.articleId === a.id);
        this.snack.open(
          p?.state === 'ok' ? `${a.label} ligger nu i kassan` : `Kassan tog inte emot ${a.label}`,
          'OK',
          { duration: 4000 },
        );
      },
      error: () => this.busy.set(false),
    });
  }

  remove(p: PosProduct) {
    this.confirm
      .ask({
        title: 'Ta bort ur kassan?',
        message: `${p.label} tas bort ur PayPal-kassans produktlista. Artikeln och tidigare köp ligger kvar i Axle.`,
        confirmText: 'Ta bort',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.removeProduct(p.articleId).subscribe({
          next: (list) => {
            this.busy.set(false);
            this.products.set(list);
          },
          error: () => this.busy.set(false),
        });
      });
  }

  pushAll() {
    this.busy.set(true);
    this.api.pushProducts().subscribe({
      next: (list) => {
        this.busy.set(false);
        this.products.set(list);
        const failed = list.filter((p) => p.state === 'error').length;
        this.snack.open(
          failed ? `${failed} artiklar togs inte emot` : 'Alla artiklar är skickade',
          'OK',
          { duration: 4000 },
        );
      },
      error: () => this.busy.set(false),
    });
  }

  testSale(p: PosProduct) {
    this.busy.set(true);
    this.api.devPurchase([p.articleId]).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.snack.open(this.syncText(r), 'OK', { duration: 4000 });
        this.loadSales();
        this.loadProducts();
      },
      error: () => this.busy.set(false),
    });
  }

  openConnections = () => {
    void import('../settings/settings').then((m) =>
      m
        .openSettings(this.dialog, 'anslutningar')
        .then((ref) => ref.afterClosed().subscribe(() => this.ngOnInit())),
    );
  };

  toggle(id: string) {
    this.open.set(this.open() === id ? null : id);
  }

  syncText(r: ZettleSyncResult) {
    if (!r.imported && !r.failed) return 'Inga nya köp i kassan';
    const parts = [`${r.imported} ${r.imported === 1 ? 'nytt köp' : 'nya köp'} inlästa`];
    if (r.stockMissing) parts.push(`${r.stockMissing} rader drogs inte från lagret`);
    if (r.failed) parts.push(`${r.failed} kunde inte läsas in`);
    return parts.join(', ');
  }

  goods(s: PosSale) {
    const names = s.rows.map((r) => (r.quantity === 1 ? r.name : `${r.quantity} × ${r.name}`));
    return names.length > 2
      ? `${names.slice(0, 2).join(', ')} +${names.length - 2}`
      : names.join(', ');
  }

  paid(s: PosSale) {
    return s.payments.map((p) => METHOD[p.method] ?? p.label ?? 'Annat').join(', ');
  }

  stockProblems(s: PosSale) {
    return s.rows.filter((r) => r.stock === 'missing' || r.stock === 'failed').length;
  }

  stockText(state: PosSale['rows'][number]['stock'], note: string | null) {
    switch (state) {
      case 'booked':
        return 'drogs från lagret';
      case 'missing':
        return note ?? 'inte i lager';
      case 'failed':
        return 'lagret nekade';
      default:
        return note ?? 'inte en artikel i Axle';
    }
  }

  time(iso: string) {
    return new Date(iso).toLocaleString(appLocale(), { dateStyle: 'short', timeStyle: 'short' });
  }
}
