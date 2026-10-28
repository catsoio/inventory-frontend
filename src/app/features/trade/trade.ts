import { Pricing } from '../../core/pricing';
import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
  computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, firstValueFrom, of, switchMap } from 'rxjs';
import { InventoryApi } from '../../core/api/inventory-api';
import { Article, itemKind } from '../../core/models';
import { normalizeUrl } from '../../shared/web-link';

interface Line {
  a: Article;
  qty: number;
  price: number; // kr
}

@Component({
  selector: 'app-trade',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="mb-4 flex shrink-0 items-center gap-2">
      <a mat-icon-button routerLink=".." aria-label="Till listan"
        ><mat-icon>arrow_back</mat-icon></a
      >
      <h1 class="text-2xl font-semibold">Nytt inköp</h1>
    </div>

    <div class="grid min-h-0 flex-1 gap-6 xl:grid-cols-3">
      <section class="flex min-h-64 min-w-0 flex-col gap-4 xl:col-span-2">
        <div class="relative">
          <mat-icon class="pointer-events-none absolute top-2.5 left-3 text-gray-400"
            >search</mat-icon
          >
          <input
            #searchEl
            type="search"
            [formControl]="search"
            (keydown.enter)="addFirst()"
            placeholder="Sök artikel att köpa in: storlek, märke, artikelnummer…"
            class="focus:ring-brand h-12 w-full rounded-xl border-0 bg-white shadow-sm ring-1 ring-gray-200 pr-3 pl-11 outline-none focus:ring-2"
          />
          @if (results().length) {
            <div
              class="absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-xl bg-white shadow-sm shadow-lg"
            >
              @for (a of results(); track a.id) {
                <button
                  type="button"
                  class="hover:bg-brand-soft flex w-full items-center justify-between gap-3 border-b px-4 py-2 text-left last:border-b-0"
                  (click)="add(a)"
                >
                  <span class="flex items-center gap-3">
                    <app-item-icon [kind]="kind(a)" />
                    <span class="font-medium">{{ a.sizeLabel }}</span> · {{ a.brand }}
                    {{ a.model }}
                    <span class="text-sm text-gray-500">· {{ a.location || 'Ingen plats' }}</span>
                  </span>
                  <span class="flex items-center gap-3 text-sm">
                    <span class="text-gray-600">{{ a.quantity }} st</span>
                    <span class="font-medium">{{ pricing.costIncl(a.averageCost ?? 0) | kr }}</span>
                  </span>
                </button>
              }
            </div>
          }
        </div>

        <ng-template #qtyField let-l="l" let-i="i">
          <mat-form-field class="w-full" subscriptSizing="dynamic">
            <mat-label>Antal</mat-label>
            <input
              matInput
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              class="text-right"
              [value]="l.qty"
              (focus)="$any($event.target).select()"
              (input)="setQty(i, $any($event.target).valueAsNumber)"
            />
          </mat-form-field>
        </ng-template>
        <ng-template #priceField let-l="l" let-i="i">
          <mat-form-field class="w-full" subscriptSizing="dynamic">
            <mat-label>Inköpspris/st (kr, inkl. moms)</mat-label>
            <input
              matInput
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              class="text-right"
              [value]="l.price"
              (focus)="$any($event.target).select()"
              (input)="setPrice(i, $any($event.target).valueAsNumber)"
            />
          </mat-form-field>
        </ng-template>

        <!-- Dator: tabell -->
        <div class="min-h-0 flex-1 overflow-auto rounded-xl bg-white shadow-sm max-md:hidden">
          <table class="w-full text-left text-sm">
            <thead
              class="sticky top-0 z-10 border-b border-gray-100 bg-white text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              <tr>
                <th class="px-3 py-2">Artikel</th>
                <th class="px-3 py-2 text-right">I lager</th>
                <th class="w-28 px-3 py-2 text-right">Antal</th>
                <th class="w-44 px-3 py-2 text-right">Pris/st (kr)</th>
                <th class="px-3 py-2 text-right">Summa inkl. moms</th>
                <th class="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (l of lines(); track l.a.id; let i = $index) {
                <tr class="h-20 align-middle">
                  <td class="px-3">
                    <div class="flex items-center gap-3">
                      <app-item-icon [kind]="kind(l.a)" />
                      <div>
                        <div class="font-medium">{{ l.a.sizeLabel }}</div>
                        <div class="text-gray-500">{{ l.a.brand }} {{ l.a.model }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="px-3 text-right">{{ l.a.quantity }}</td>
                  <td class="px-3">
                    <ng-container
                      [ngTemplateOutlet]="qtyField"
                      [ngTemplateOutletContext]="{ l: l, i: i }"
                    />
                  </td>
                  <td class="px-3">
                    <ng-container
                      [ngTemplateOutlet]="priceField"
                      [ngTemplateOutletContext]="{ l: l, i: i }"
                    />
                  </td>
                  <td class="px-3 text-right font-medium">{{ lineOre(l) | kr }}</td>
                  <td class="px-3 text-right">
                    <button mat-icon-button (click)="remove(i)" aria-label="Ta bort rad">
                      <mat-icon>close</mat-icon>
                    </button>
                  </td>
                </tr>
                @if (!qtyOk(l)) {
                  <tr>
                    <td colspan="6" class="px-3 pb-2 text-xs text-red-600">
                      {{ qtyHint() }}
                    </td>
                  </tr>
                }
              } @empty {
                <tr>
                  <td colspan="6" class="px-3 py-10 text-center text-gray-500">
                    Sök efter en artikel ovan och välj den för att lägga till en rad.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Mobil: ett kort per rad -->
        <div class="flex flex-col gap-2 md:hidden">
          @for (l of lines(); track l.a.id; let i = $index) {
            <div class="rounded-xl bg-white p-3 shadow-sm">
              <div class="flex items-start gap-3">
                <app-item-icon [kind]="kind(l.a)" />
                <div class="min-w-0 flex-1">
                  <div class="font-semibold">{{ l.a.sizeLabel }}</div>
                  <div class="truncate text-sm text-gray-500">{{ l.a.brand }} {{ l.a.model }}</div>
                  <div class="text-xs text-gray-500">{{ l.a.quantity }} st i lager</div>
                </div>
                <button mat-icon-button (click)="remove(i)" aria-label="Ta bort rad">
                  <mat-icon>close</mat-icon>
                </button>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-x-3">
                <ng-container
                  [ngTemplateOutlet]="qtyField"
                  [ngTemplateOutletContext]="{ l: l, i: i }"
                />
                <ng-container
                  [ngTemplateOutlet]="priceField"
                  [ngTemplateOutletContext]="{ l: l, i: i }"
                />
              </div>
              @if (!qtyOk(l)) {
                <div class="mt-3 text-xs text-red-600">{{ qtyHint() }}</div>
              }
              <div class="mt-2 flex justify-between border-t pt-2 text-sm">
                <span class="text-gray-600">Summa inkl. moms</span>
                <b>{{ lineOre(l) | kr }}</b>
              </div>
            </div>
          } @empty {
            <p class="rounded-xl bg-white px-3 py-8 text-center text-gray-500 shadow-sm">
              Sök efter en artikel ovan och välj den för att lägga till en rad.
            </p>
          }
        </div>
      </section>

      <aside class="xl:overflow-y-auto">
        <mat-card class="flex flex-col gap-1 p-4">
          <div class="mb-2 text-lg font-semibold">Inköp</div>
          <mat-form-field>
            <mat-label>Referens</mat-label>
            <input
              matInput
              [value]="reference()"
              (input)="reference.set($any($event.target).value)"
            />
          </mat-form-field>
          <mat-form-field>
            <mat-label>Länk (var du köpte det)</mat-label>
            <input
              matInput
              type="url"
              inputmode="url"
              placeholder="https://…"
              [value]="url()"
              (input)="url.set($any($event.target).value)"
            />
            <mat-hint>Klistra in länken till ordern eller produkten</mat-hint>
          </mat-form-field>
          <app-supplier-select label="Leverantör" [formControl]="supplierCtl" />
          <mat-form-field>
            <mat-label>Anteckning</mat-label>
            <input matInput [value]="note()" (input)="note.set($any($event.target).value)" />
          </mat-form-field>

          <div class="flex justify-between border-t pt-3 text-gray-600">
            <span>Antal</span><b>{{ units() }} st</b>
          </div>
          <div class="flex justify-between py-2 text-xl font-semibold">
            <span>Totalt inkl. moms</span><span>{{ totalOre() | kr }}</span>
          </div>
          <div class="flex justify-between pb-2 text-sm text-gray-600">
            <span>Varav ingående moms {{ pricing.value().purchaseVatRate }} %</span
            ><span>{{ totalOre() - pricing.costNet(totalOre()) | kr }}</span>
          </div>
          <button
            mat-flat-button
            color="primary"
            class="!h-12"
            [disabled]="!valid() || busy()"
            (click)="submit()"
          >
            Slutför inköp
          </button>
          <button mat-button [disabled]="!lines().length || busy()" (click)="lines.set([])">
            Töm raderna
          </button>
        </mat-card>
      </aside>
    </div>
  `,
})
export class Trade {
  private readonly api = inject(InventoryApi);
  readonly pricing = inject(Pricing);
  private readonly snack = inject(MatSnackBar);
  private readonly searchEl = viewChild<ElementRef<HTMLInputElement>>('searchEl');

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly kind = (a: Article) => itemKind(a.category);

  readonly search = new FormControl('', { nonNullable: true });
  readonly results = signal<Article[]>([]);
  readonly lines = signal<Line[]>([]);
  readonly reference = signal('');
  /** Länken man köpte från (bara inköp). */
  readonly url = signal('');
  readonly supplierCtl = new FormControl<string | null>(null);
  readonly note = signal('');
  readonly busy = signal(false);

  readonly units = computed(() => this.lines().reduce((n, l) => n + (l.qty || 0), 0));
  readonly totalOre = computed(() => this.lines().reduce((n, l) => n + this.lineOre(l), 0));
  readonly valid = computed(
    () => this.lines().length > 0 && this.lines().every((l) => this.qtyOk(l) && l.price >= 0),
  );

  constructor() {
    // Länkar från leverantörskortet fyller i vem det gäller.
    const supplierId = this.route.snapshot.queryParamMap.get('supplierId');
    if (supplierId) this.supplierCtl.setValue(supplierId);

    this.search.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => (q.trim() ? this.api.articles({ q: q.trim(), limit: 8 }) : of(null))),
        takeUntilDestroyed(),
      )
      .subscribe((p) => this.results.set(p?.items ?? []));
  }

  qtyOk(l: Line) {
    return Number.isInteger(l.qty) && l.qty >= 1;
  }

  qtyHint() {
    return 'Ange ett helt antal, minst 1.';
  }

  lineOre(l: Line) {
    return Math.round((l.qty || 0) * (l.price || 0) * 100);
  }

  add(a: Article) {
    this.lines.update((ls) => {
      const i = ls.findIndex((l) => l.a.id === a.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      // Inköpspriset skrivs inkl. moms; det lagrade snittpriset är utan.
      const price = this.pricing.costIncl(a.averageCost ?? 0) / 100;
      return [...ls, { a, qty: 1, price }];
    });
    this.search.setValue('', { emitEvent: false });
    this.results.set([]);
    this.searchEl()?.nativeElement.focus();
  }

  addFirst() {
    const [first] = this.results();
    if (first) this.add(first);
  }

  setQty(i: number, qty: number) {
    this.lines.update((ls) => ls.map((l, j) => (j === i ? { ...l, qty } : l)));
  }

  setPrice(i: number, price: number) {
    this.lines.update((ls) => ls.map((l, j) => (j === i ? { ...l, price } : l)));
  }

  remove(i: number) {
    this.lines.update((ls) => ls.filter((_, j) => j !== i));
  }

  /** Alla rader bokförs i ett svep under ett löpnummer; vid fel ändras ingenting. */
  async submit() {
    this.busy.set(true);
    const reference = this.reference().trim() || undefined;
    const note = this.note().trim() || undefined;
    const lines = this.lines().map((l) => ({
      articleId: l.a.id,
      quantity: l.qty,
      unitCost: this.pricing.costNet(Math.round(l.price * 100)),
    }));
    try {
      const doc = await firstValueFrom(
        this.api.createTrade('purchases', {
          lines,
          reference,
          note,
          url: normalizeUrl(this.url()) ?? undefined,
          supplierId: this.supplierCtl.value || undefined,
        }),
      );
      this.snack.open(`Inköp ${doc.code} är registrerat`, 'OK', {
        duration: 4000,
      });
      await this.router.navigate(['..'], { relativeTo: this.route });
    } catch {
      this.busy.set(false);
    }
  }
}
