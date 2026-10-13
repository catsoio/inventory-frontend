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
import { WorkshopApi } from '../../core/api/workshop-api';
import { Article, Vehicle, itemKind } from '../../core/models';

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
      <h1 class="text-2xl font-semibold">{{ sell ? 'Ny försäljning' : 'Nytt inköp' }}</h1>
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
            [placeholder]="
              sell
                ? 'Sök artikel att sälja: storlek, märke, artikelnummer…'
                : 'Sök artikel att köpa in: storlek, märke, artikelnummer…'
            "
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
                    <span class="font-medium">{{ (sell ? a.sellPrice : a.averageCost) | kr }}</span>
                  </span>
                </button>
              }
            </div>
          }
        </div>

        <div class="min-h-0 flex-1 overflow-auto rounded-xl bg-white shadow-sm">
          <table class="w-full text-left text-sm">
            <thead
              class="sticky top-0 z-10 border-b border-gray-100 bg-white text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              <tr>
                <th class="px-3 py-2">Artikel</th>
                <th class="px-3 py-2 text-right">I lager</th>
                <th class="px-3 py-2 text-right">Antal</th>
                <th class="px-3 py-2 text-right">
                  {{ sell ? 'Pris/st (kr)' : 'Inköpspris/st (kr)' }}
                </th>
                <th class="px-3 py-2 text-right">Summa</th>
                <th class="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (l of lines(); track l.a.id; let i = $index) {
                <tr class="h-14">
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
                  <td class="px-3 text-right">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputmode="numeric"
                      class="h-9 w-20 rounded-md border-0 bg-gray-50 px-2 text-right ring-1 ring-gray-200 focus:ring-2 focus:ring-brand outline-none"
                      [class.border-red-500]="!qtyOk(l)"
                      [value]="l.qty"
                      (focus)="$any($event.target).select()"
                      (input)="setQty(i, $any($event.target).valueAsNumber)"
                    />
                  </td>
                  <td class="px-3 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputmode="decimal"
                      class="h-9 w-28 rounded-md border-0 bg-gray-50 px-2 text-right ring-1 ring-gray-200 focus:ring-2 focus:ring-brand outline-none"
                      [class.border-red-500]="!(l.price >= 0)"
                      [value]="l.price"
                      (focus)="$any($event.target).select()"
                      (input)="setPrice(i, $any($event.target).valueAsNumber)"
                    />
                  </td>
                  <td class="px-3 text-right font-medium">{{ lineOre(l) | kr }}</td>
                  <td class="px-3 text-right">
                    <button mat-icon-button (click)="remove(i)" aria-label="Ta bort rad">
                      <mat-icon>close</mat-icon>
                    </button>
                  </td>
                </tr>
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
      </section>

      <aside class="overflow-y-auto">
        <mat-card class="flex flex-col gap-1 p-4">
          <div class="mb-2 text-lg font-semibold">{{ sell ? 'Försäljning' : 'Inköp' }}</div>
          <mat-form-field>
            <mat-label>Referens</mat-label>
            <input
              matInput
              [value]="reference()"
              (input)="reference.set($any($event.target).value)"
            />
          </mat-form-field>
          @if (sell) {
            <app-customer-select
              label="Kund (tomt = kontantförsäljning)"
              [formControl]="customerCtl"
            />
            @if (cars().length) {
              <mat-form-field>
                <mat-label>Bil</mat-label>
                <mat-select [formControl]="vehicleCtl">
                  <mat-option [value]="null">Ingen bil</mat-option>
                  @for (v of cars(); track v.id) {
                    <mat-option [value]="v.id">
                      {{ v.regNo }} {{ v.make }} {{ v.model }}
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
          } @else {
            <app-supplier-select label="Leverantör" [formControl]="supplierCtl" />
          }
          <mat-form-field>
            <mat-label>Anteckning</mat-label>
            <input matInput [value]="note()" (input)="note.set($any($event.target).value)" />
          </mat-form-field>

          <div class="flex justify-between border-t pt-3 text-gray-600">
            <span>Antal</span><b>{{ units() }} st</b>
          </div>
          <div class="flex justify-between py-2 text-xl font-semibold">
            <span>Totalt</span><span>{{ totalOre() | kr }}</span>
          </div>
          <button
            mat-flat-button
            color="primary"
            class="!h-12"
            [disabled]="!valid() || busy()"
            (click)="submit()"
          >
            {{ sell ? 'Slutför försäljning' : 'Slutför inköp' }}
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
  private readonly snack = inject(MatSnackBar);
  private readonly searchEl = viewChild<ElementRef<HTMLInputElement>>('searchEl');

  private readonly workshop = inject(WorkshopApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly mode: 'sell' | 'receive' = this.route.snapshot.data['mode'];
  readonly sell = this.mode === 'sell';
  readonly kind = (a: Article) => itemKind(a.category);

  readonly search = new FormControl('', { nonNullable: true });
  readonly results = signal<Article[]>([]);
  readonly lines = signal<Line[]>([]);
  readonly reference = signal('');
  readonly customerCtl = new FormControl<string | null>(null);
  readonly vehicleCtl = new FormControl<string | null>(null);
  readonly supplierCtl = new FormControl<string | null>(null);
  /** Vald kunds bilar, att välja bland. */
  readonly cars = signal<Vehicle[]>([]);
  readonly note = signal('');
  readonly busy = signal(false);

  readonly units = computed(() => this.lines().reduce((n, l) => n + (l.qty || 0), 0));
  readonly totalOre = computed(() => this.lines().reduce((n, l) => n + this.lineOre(l), 0));
  readonly valid = computed(
    () => this.lines().length > 0 && this.lines().every((l) => this.qtyOk(l) && l.price >= 0),
  );

  constructor() {
    // Kunden styr vilka bilar som kan väljas.
    this.customerCtl.valueChanges
      .pipe(
        distinctUntilChanged(),
        switchMap((id) => (id ? this.workshop.vehicles({ customerId: id, limit: 50 }) : of(null))),
        takeUntilDestroyed(),
      )
      .subscribe((p) => {
        this.cars.set(p?.items ?? []);
        const v = this.vehicleCtl.value;
        if (v && !this.cars().some((c) => c.id === v)) this.vehicleCtl.setValue(null);
      });
    // Länkar från kund-, bil- och leverantörskort fyller i vem det gäller.
    const q = this.route.snapshot.queryParamMap;
    if (this.sell) {
      const customerId = q.get('customerId');
      if (customerId) this.customerCtl.setValue(customerId);
      const vehicleId = q.get('vehicleId');
      if (vehicleId) this.vehicleCtl.setValue(vehicleId);
    } else {
      const supplierId = q.get('supplierId');
      if (supplierId) this.supplierCtl.setValue(supplierId);
    }

    this.search.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) =>
          q.trim()
            ? this.api.articles({ q: q.trim(), limit: 8, inStock: this.sell ? true : undefined })
            : of(null),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((p) => this.results.set(p?.items ?? []));
  }

  qtyOk(l: Line) {
    return Number.isInteger(l.qty) && l.qty >= 1 && (!this.sell || l.qty <= l.a.quantity);
  }

  lineOre(l: Line) {
    return Math.round((l.qty || 0) * (l.price || 0) * 100);
  }

  add(a: Article) {
    this.lines.update((ls) => {
      const i = ls.findIndex((l) => l.a.id === a.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      const price = this.sell ? a.sellPrice / 100 : a.averageCost / 100;
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
    const lines = this.lines().map((l) => {
      const price = Math.round(l.price * 100);
      return this.sell
        ? { articleId: l.a.id, quantity: l.qty, unitPrice: price }
        : { articleId: l.a.id, quantity: l.qty, unitCost: price };
    });
    try {
      const doc = await firstValueFrom(
        this.api.createTrade(this.sell ? 'sales' : 'purchases', {
          lines,
          reference,
          note,
          ...(this.sell
            ? {
                customerId: this.customerCtl.value || undefined,
                vehicleId: this.vehicleCtl.value || undefined,
              }
            : { supplierId: this.supplierCtl.value || undefined }),
        }),
      );
      this.snack.open(`${this.sell ? 'Försäljning' : 'Inköp'} ${doc.code} är registrerad`, 'OK', {
        duration: 4000,
      });
      await this.router.navigate(['..'], { relativeTo: this.route });
    } catch {
      this.busy.set(false);
    }
  }
}
