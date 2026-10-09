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
import { ActivatedRoute } from '@angular/router';
import { debounceTime, distinctUntilChanged, firstValueFrom, of, switchMap } from 'rxjs';
import { InventoryApi } from '../../core/api/inventory-api';
import { Article } from '../../core/models';

interface Line {
  a: Article;
  qty: number;
  price: number; // kr
}

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

@Component({
  selector: 'app-trade',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <h1 class="mb-4 shrink-0 text-2xl font-semibold">{{ sell ? 'Sälj' : 'Inköp' }}</h1>

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
                ? 'Sök däck att sälja: storlek, märke, artikelnummer…'
                : 'Sök däck att köpa in: storlek, märke, artikelnummer…'
            "
            class="focus:border-brand focus:ring-brand h-12 w-full rounded-lg border border-gray-300 bg-white pr-3 pl-11 outline-none focus:ring-1"
          />
          @if (results().length) {
            <div
              class="absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-lg border bg-white shadow-lg"
            >
              @for (a of results(); track a.id) {
                <button
                  type="button"
                  class="hover:bg-brand-soft flex w-full items-center justify-between gap-3 border-b px-4 py-2 text-left last:border-b-0"
                  (click)="add(a)"
                >
                  <span>
                    <span class="font-medium">{{ a.tyre.sizeLabel }}</span> · {{ a.brand }}
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

        <div class="min-h-0 flex-1 overflow-auto rounded-lg border bg-white">
          <table class="w-full text-left text-sm">
            <thead class="sticky top-0 z-10 bg-gray-100 text-gray-600">
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
            <tbody class="divide-y">
              @for (l of lines(); track l.a.id; let i = $index) {
                <tr class="h-14">
                  <td class="px-3">
                    <div class="font-medium">{{ l.a.tyre.sizeLabel }}</div>
                    <div class="text-gray-500">{{ l.a.brand }} {{ l.a.model }}</div>
                  </td>
                  <td class="px-3 text-right">{{ l.a.quantity }}</td>
                  <td class="px-3 text-right">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputmode="numeric"
                      class="h-9 w-20 rounded border px-2 text-right"
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
                      class="h-9 w-28 rounded border px-2 text-right"
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
                    Sök efter ett däck ovan och välj det för att lägga till en rad.
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
          @if (!sell) {
            <mat-form-field>
              <mat-label>Leverantör</mat-label>
              <input
                matInput
                [value]="supplier()"
                (input)="supplier.set($any($event.target).value)"
              />
            </mat-form-field>
          }
          <mat-form-field>
            <mat-label>Anteckning</mat-label>
            <input matInput [value]="note()" (input)="note.set($any($event.target).value)" />
          </mat-form-field>

          <div class="flex justify-between border-t pt-3 text-gray-600">
            <span>Antal däck</span><b>{{ units() }} st</b>
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

    <h2 class="mt-4 mb-1 shrink-0 text-xl font-semibold">
      {{ sell ? 'Senaste försäljningar' : 'Senaste inköp' }}
    </h2>
    <app-movement-list class="h-64 shrink-0" [type]="sell ? 'sale' : 'purchase'" [pageSize]="10" [reloadKey]="done()" />
  `,
})
export class Trade {
  private readonly api = inject(InventoryApi);
  private readonly snack = inject(MatSnackBar);
  private readonly searchEl = viewChild<ElementRef<HTMLInputElement>>('searchEl');

  readonly mode: 'sell' | 'receive' = inject(ActivatedRoute).snapshot.data['mode'];
  readonly sell = this.mode === 'sell';

  readonly search = new FormControl('', { nonNullable: true });
  readonly results = signal<Article[]>([]);
  readonly lines = signal<Line[]>([]);
  readonly reference = signal(`${this.sell ? 'S' : 'I'}-${stamp()}`);
  readonly supplier = signal('');
  readonly note = signal('');
  readonly busy = signal(false);
  readonly done = signal(0);

  readonly units = computed(() => this.lines().reduce((n, l) => n + (l.qty || 0), 0));
  readonly totalOre = computed(() => this.lines().reduce((n, l) => n + this.lineOre(l), 0));
  readonly valid = computed(
    () => this.lines().length > 0 && this.lines().every((l) => this.qtyOk(l) && l.price >= 0),
  );

  constructor() {
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

  // Backend har bara åtgärder per artikel, så raderna körs en i taget; lyckade rader tas bort.
  async submit() {
    this.busy.set(true);
    const reference = this.reference().trim() || undefined;
    const note = this.note().trim() || undefined;
    const supplier = this.supplier().trim() || undefined;
    for (const l of [...this.lines()]) {
      const price = Math.round(l.price * 100);
      const body = this.sell
        ? { quantity: l.qty, unitPrice: price, reference, note }
        : { quantity: l.qty, unitCost: price, supplier, reference, note };
      try {
        await firstValueFrom(this.api.stockAction(l.a.id, this.mode, body));
        this.lines.update((ls) => ls.filter((x) => x !== l));
      } catch {
        this.busy.set(false);
        this.done.update((n) => n + 1);
        return;
      }
    }
    this.busy.set(false);
    this.done.update((n) => n + 1);
    this.snack.open(this.sell ? 'Försäljningen är registrerad' : 'Inköpet är registrerat', 'OK', {
      duration: 4000,
    });
    this.reference.set(`${this.sell ? 'S' : 'I'}-${stamp()}`);
    this.note.set('');
  }
}
