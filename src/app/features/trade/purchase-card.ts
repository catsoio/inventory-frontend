import { Component, computed, inject, signal, ElementRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { format } from 'date-fns';
import { debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { AxleApi } from '../../core/api/axle-api';
import { PurchaseCardApi } from '../../core/api/purchase-card-api';
import { Article, PurchaseCard, itemKind } from '../../core/models';
import { Pricing } from '../../core/pricing';
import { HasUnsaved } from '../../core/unsaved-guard';
import { Confirm } from '../../shared/confirm';
import { QuickArticleDialog } from '../../shared/quick-article-dialog/quick-article-dialog';
import { TradeDocumentDialog } from '../../shared/trade-document-dialog/trade-document-dialog';
import { normalizeUrl } from '../../shared/web-link';

/** En rad som den redigeras: priset i kronor inkl. moms, som man skriver av leverantörens faktura. */
interface Row {
  key: string;
  id?: string;
  a: Article;
  qty: number;
  price: number;
}

let seq = 0;
const key = () => `p${++seq}`;
/** Mitt på dagen, så att en dag inte hamnar på fel datum i en annan tidszon. */
const noonOf = (day: string) => new Date(`${day}T12:00:00`).toISOString();

/**
 * Inköpskortet: ett inköp med leverantör, rader och summa, som säljkortet fast åt andra hållet.
 * Ett utkast ändras fritt; bokförs det läggs raderna in i lagret under ett INK-nummer och kortet
 * låses.
 */
@Component({
  selector: 'app-purchase-card',
  standalone: false,
  template: `
    <app-card-page
      [wide]="true"
      listLink="/purchases"
      listLabel="Inköp"
      newTitle="Nytt inköp"
      [title]="card()?.supplier?.name ?? ''"
      [code]="card()?.code ?? null"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          @if (c.status === 'draft') {
            <button
              mat-icon-button
              class="!text-red-700"
              aria-label="Ta bort"
              matTooltip="Ta bort"
              (click)="remove()"
            >
              <mat-icon>delete_outline</mat-icon>
            </button>
          } @else {
            <button mat-stroked-button type="button" (click)="openDocument()">
              <mat-icon>receipt_long</mat-icon> Visa inköpsdokument
            </button>
          }
        }
        @if (!readOnly()) {
          <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
            Spara
          </button>
        }
      </div>

      @if (card()?.status === 'posted') {
        <p class="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          <b>Bokfört som {{ card()!.documentCode }}.</b>
          Raderna ligger i lagret och kortet är låst: ett bokfört inköp ändras inte i efterhand.
        </p>
      }

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-3 text-base font-semibold">Leverantör</h2>
        <div class="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
          <app-supplier-select
            class="sm:col-span-2"
            label="Leverantör"
            [formControl]="supplierCtl"
          />
          <mat-form-field>
            <mat-label>Leverantörens fakturanummer</mat-label>
            <input
              matInput
              autocomplete="off"
              [disabled]="readOnly()"
              [value]="reference()"
              (input)="reference.set($any($event.target).value); touch()"
            />
          </mat-form-field>
          <mat-form-field>
            <mat-label>Inköpsdatum</mat-label>
            <input
              matInput
              type="date"
              [disabled]="readOnly()"
              [value]="day()"
              (input)="day.set($any($event.target).value); touch()"
            />
          </mat-form-field>
          <mat-form-field class="sm:col-span-2 lg:col-span-4">
            <mat-label>Länk (var du köpte det)</mat-label>
            <input
              matInput
              type="url"
              inputmode="url"
              placeholder="https://…"
              [disabled]="readOnly()"
              [value]="url()"
              (input)="url.set($any($event.target).value); touch()"
            />
          </mat-form-field>
        </div>
      </section>

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-3 text-base font-semibold">Rader</h2>

        @if (!readOnly()) {
          <div class="relative mb-3">
            <mat-icon class="pointer-events-none absolute top-2.5 left-3 text-gray-400"
              >search</mat-icon
            >
            <input
              #searchEl
              type="search"
              [formControl]="search"
              (keydown.enter)="addFirst()"
              (keydown.escape)="clearSearch()"
              placeholder="Lägg till artikel: namn, storlek, märke, artikelnummer… eller skriv ett nytt namn"
              class="h-11 w-full pr-3 pl-11 field"
            />
            @if (query().trim()) {
              <div
                class="absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-xl bg-white shadow-lg"
              >
                @for (a of results(); track a.id) {
                  <button
                    type="button"
                    class="hover:bg-brand-soft flex w-full items-center justify-between gap-3 border-b px-4 py-2 text-left"
                    (click)="add(a)"
                  >
                    <span class="flex min-w-0 items-center gap-3">
                      <app-item-icon [kind]="kind(a)" />
                      <span class="min-w-0">
                        <span class="block truncate font-medium">{{ title(a) }}</span>
                        <span class="block truncate text-sm text-gray-500">{{ subtitle(a) }}</span>
                      </span>
                    </span>
                    <span class="flex shrink-0 items-center gap-3 text-sm">
                      <span class="text-gray-600">{{ a.quantity }} st</span>
                      <span class="font-medium">{{
                        pricing.costIncl(a.averageCost ?? 0) | kr
                      }}</span>
                    </span>
                  </button>
                }
                <button
                  type="button"
                  class="hover:bg-brand-soft text-brand flex w-full items-center gap-2 px-4 py-3 text-left font-medium"
                  (click)="newArticle()"
                >
                  <mat-icon>add</mat-icon> Ny artikel "{{ query().trim() }}"
                </button>
              </div>
            }
          </div>
        }

        @if (rows().length) {
          <div class="flex flex-col gap-3 md:hidden">
            @for (r of rows(); track r.key; let i = $index) {
              <div class="rounded-lg border border-gray-200 p-3">
                <div class="flex items-start gap-3">
                  <app-item-icon [kind]="kind(r.a)" />
                  <div class="min-w-0 flex-1">
                    <div class="font-medium">{{ title(r.a) }}</div>
                    <div class="truncate text-xs text-gray-500">{{ subtitle(r.a) }}</div>
                    <div class="text-xs text-gray-500">{{ r.a.quantity }} st i lager</div>
                  </div>
                  @if (!readOnly()) {
                    <button
                      mat-icon-button
                      type="button"
                      (click)="removeRow(i)"
                      aria-label="Ta bort raden"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  }
                </div>
                <div class="mt-2 grid grid-cols-2 gap-3">
                  <label class="flex flex-col gap-0.5 text-xs text-gray-500">
                    Antal
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputmode="numeric"
                      class="h-10 px-2 text-right text-gray-900 field"
                      [disabled]="readOnly()"
                      [value]="r.qty"
                      (focus)="$any($event.target).select()"
                      (input)="edit(i, { qty: $any($event.target).valueAsNumber })"
                    />
                  </label>
                  <label class="flex flex-col gap-0.5 text-xs text-gray-500">
                    Inköpspris/st
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputmode="decimal"
                      class="h-10 px-2 text-right text-gray-900 field"
                      [disabled]="readOnly()"
                      [value]="r.price"
                      (focus)="$any($event.target).select()"
                      (input)="edit(i, { price: $any($event.target).valueAsNumber })"
                    />
                  </label>
                </div>
                <div class="mt-2 flex justify-between border-t pt-2 text-sm">
                  <span class="text-gray-600">Summa</span>
                  <b class="tabular-nums">{{ lineOre(r) | kr }}</b>
                </div>
              </div>
            }
          </div>
          <div class="overflow-x-auto max-md:hidden">
            <table class="w-full min-w-[640px] text-left text-sm">
              <thead
                class="border-b border-gray-100 text-xs font-medium tracking-wide text-gray-500 uppercase"
              >
                <tr>
                  <th class="py-2">Artikel</th>
                  <th class="w-20 py-2 text-right">I lager</th>
                  <th class="w-24 py-2 text-right">Antal</th>
                  <th class="w-36 py-2 text-right">Inköpspris/st</th>
                  <th class="w-28 py-2 text-right">Summa</th>
                  <th class="w-10 py-2"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (r of rows(); track r.key; let i = $index) {
                  <tr class="align-top">
                    <td class="py-2 pr-2">
                      <div class="flex items-center gap-3 py-1">
                        <app-item-icon [kind]="kind(r.a)" />
                        <div class="min-w-0">
                          <div class="truncate font-medium">{{ title(r.a) }}</div>
                          <div class="truncate text-xs text-gray-500">{{ subtitle(r.a) }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="py-2 pr-2 text-right tabular-nums">
                      <div class="py-2">{{ r.a.quantity }}</div>
                    </td>
                    <td class="py-2 pr-2 text-right">
                      @if (readOnly()) {
                        <div class="py-2 tabular-nums">{{ r.qty }}</div>
                      } @else {
                        <input
                          type="number"
                          min="1"
                          step="1"
                          inputmode="numeric"
                          class="h-10 w-full px-2 text-right field"
                          [value]="r.qty"
                          (focus)="$any($event.target).select()"
                          (input)="edit(i, { qty: $any($event.target).valueAsNumber })"
                        />
                        @if (!qtyOk(r)) {
                          <div class="text-xs text-red-600">Helt antal, minst 1.</div>
                        }
                      }
                    </td>
                    <td class="py-2 pr-2 text-right">
                      @if (readOnly()) {
                        <div class="py-2 tabular-nums">{{ r.price * 100 | kr }}</div>
                      } @else {
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputmode="decimal"
                          class="h-10 w-full px-2 text-right field"
                          [value]="r.price"
                          (focus)="$any($event.target).select()"
                          (input)="edit(i, { price: $any($event.target).valueAsNumber })"
                        />
                      }
                    </td>
                    <td class="py-2 text-right tabular-nums">
                      <div class="py-2">{{ lineOre(r) | kr }}</div>
                    </td>
                    <td class="py-2 text-right">
                      @if (!readOnly()) {
                        <button
                          mat-icon-button
                          type="button"
                          (click)="removeRow(i)"
                          aria-label="Ta bort raden"
                        >
                          <mat-icon>close</mat-icon>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="mt-2 text-xs text-gray-500">Inköpspriset skrivs inkl. moms, som på fakturan.</p>
        } @else {
          <p class="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            Inga rader än. Sök efter det du köper in ovan. Finns det inte, skriv namnet och välj Ny
            artikel.
          </p>
        }
      </section>

      <div class="grid items-start gap-4 lg:grid-cols-2">
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Anteckning</h2>
          <mat-form-field class="w-full" subscriptSizing="dynamic">
            <mat-label>Intern anteckning</mat-label>
            <input
              matInput
              [disabled]="readOnly()"
              [value]="note()"
              (input)="note.set($any($event.target).value); touch()"
            />
          </mat-form-field>
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="ml-auto max-w-sm text-sm">
            <div class="flex justify-between py-0.5 text-gray-600">
              <span>Antal</span><span class="tabular-nums">{{ units() }} st</span>
            </div>
            <div class="flex justify-between py-0.5 text-gray-600">
              <span>Exkl. moms</span
              ><span class="tabular-nums">{{ pricing.costNet(totalOre()) | kr }}</span>
            </div>
            <div class="flex justify-between py-0.5 text-gray-600">
              <span>Ingående moms {{ pricing.value().purchaseVatRate }} %</span
              ><span class="tabular-nums">{{ totalOre() - pricing.costNet(totalOre()) | kr }}</span>
            </div>
            <div class="mt-1 flex justify-between border-t pt-2 text-lg font-semibold">
              <span>Totalt inkl. moms</span><span class="tabular-nums">{{ totalOre() | kr }}</span>
            </div>
          </div>
        </section>
      </div>

      @if (card(); as c) {
        @if (c.status === 'draft') {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-1 text-base font-semibold">Bokför</h2>
            <p class="mb-3 text-sm text-gray-600">
              Vid bokföring läggs raderna in i lagret och inköpet får sitt nummer (INK-). Därefter
              går kortet inte att ändra. Delar som väntar på en arbetsorder blir tillgängliga
              direkt.
            </p>
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="busy() || !valid() || !rows().length"
              (click)="post()"
            >
              Bokför inköp
            </button>
          </section>
        }
      } @else {
        <p class="text-sm text-gray-600">
          Spara kortet för att få ett nummer. Därefter kan du bokföra inköpet in i lagret.
        </p>
      }
    </app-card-page>
  `,
})
export class PurchaseCardPage implements HasUnsaved {
  private readonly api = inject(AxleApi);
  private readonly cards = inject(PurchaseCardApi);
  readonly pricing = inject(Pricing);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly searchEl = viewChild<ElementRef<HTMLInputElement>>('searchEl');
  private readonly id = this.route.snapshot.paramMap.get('id');

  readonly kind = (a: Article) => itemKind(a.category);
  readonly card = signal<PurchaseCard | null>(null);
  readonly busy = signal(false);
  readonly dirty = signal(false);
  readonly readOnly = computed(() => this.card()?.status === 'posted');

  readonly supplierCtl = new FormControl<string | null>(null);
  readonly reference = signal('');
  readonly url = signal('');
  readonly note = signal('');
  readonly day = signal(format(new Date(), 'yyyy-MM-dd'));
  readonly rows = signal<Row[]>([]);

  readonly search = new FormControl('', { nonNullable: true });
  /** Vad som skrivits i sökrutan just nu, innan sökningen hunnit svara. */
  readonly query = signal('');
  readonly results = signal<Article[]>([]);

  readonly units = computed(() => this.rows().reduce((n, r) => n + (r.qty || 0), 0));
  readonly totalOre = computed(() => this.rows().reduce((n, r) => n + this.lineOre(r), 0));
  readonly valid = computed(() => this.rows().every((r) => this.qtyOk(r) && r.price >= 0));

  constructor() {
    this.supplierCtl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.touch());
    this.search.valueChanges
      .pipe(
        tap((v) => this.query.set(v)),
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => (q.trim() ? this.api.articles({ q: q.trim(), limit: 8 }) : of(null))),
        takeUntilDestroyed(),
      )
      .subscribe((p) => this.results.set(p?.items ?? []));

    if (this.id) {
      this.load();
      return;
    }
    // Från leverantörskortet, eller Beställ på en arbetsorder (delen, antalet som saknas, ordern).
    const q = this.route.snapshot.queryParamMap;
    const supplierId = q.get('supplierId');
    if (supplierId) this.supplierCtl.setValue(supplierId, { emitEvent: false });
    const articleId = q.get('articleId');
    if (articleId) {
      this.api
        .article(articleId)
        .subscribe((a) => this.add(a, Math.max(1, Number(q.get('qty')) || 1)));
    }
    const order = q.get('order');
    if (order) this.note.set(`Till ${order}`);
    if (order || supplierId) this.dirty.set(true);
  }

  hasUnsaved() {
    return this.dirty();
  }

  touch() {
    this.dirty.set(true);
  }

  private load() {
    this.cards.get(this.id!).subscribe((c) => {
      this.card.set(c);
      this.supplierCtl.setValue(c.supplierId, { emitEvent: false });
      this.reference.set(c.reference ?? '');
      this.url.set(c.url ?? '');
      this.note.set(c.note ?? '');
      if (c.purchasedAt) this.day.set(format(new Date(c.purchasedAt), 'yyyy-MM-dd'));
      this.rows.set(
        c.lines
          .filter((l) => l.article)
          .map((l) => ({
            key: key(),
            id: l.id,
            a: l.article!,
            qty: l.quantity,
            price: this.pricing.costIncl(l.unitCost) / 100,
          })),
      );
      if (c.status === 'posted') this.supplierCtl.disable({ emitEvent: false });
      this.dirty.set(false);
    });
  }

  /** Mått för däck och fälgar, benämningen för allt annat. */
  title(a: Article) {
    return a.sizeLabel || [a.brand, a.model].filter(Boolean).join(' ') || a.label;
  }

  subtitle(a: Article) {
    const name = a.sizeLabel ? [a.brand, a.model].filter(Boolean).join(' ') : '';
    const bits = [name, a.sku, a.stocked ? '' : 'Enstaka del', a.location].filter(Boolean);
    return bits.join(' · ') || 'Ingen plats';
  }

  qtyOk(r: Row) {
    return Number.isInteger(r.qty) && r.qty >= 1;
  }

  lineOre(r: Row) {
    return Math.round((r.qty || 0) * (r.price || 0) * 100);
  }

  add(a: Article, qty = 1) {
    this.rows.update((rs) => {
      const i = rs.findIndex((r) => r.a.id === a.id);
      if (i >= 0) return rs.map((r, j) => (j === i ? { ...r, qty: r.qty + qty } : r));
      // Inköpspriset skrivs inkl. moms; det lagrade snittpriset är utan.
      return [
        ...rs,
        { key: key(), a, qty, price: this.pricing.costIncl(a.averageCost ?? 0) / 100 },
      ];
    });
    this.touch();
    this.clearSearch();
    this.searchEl()?.nativeElement.focus();
  }

  edit(i: number, patch: Partial<Row>) {
    this.rows.update((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    this.touch();
  }

  removeRow(i: number) {
    this.rows.update((rs) => rs.filter((_, j) => j !== i));
    this.touch();
  }

  clearSearch() {
    this.search.setValue('', { emitEvent: false });
    this.query.set('');
    this.results.set([]);
  }

  /** Enter tar första träffen, och finns ingen öppnas "Ny artikel" med det man skrev. */
  addFirst() {
    const [first] = this.results();
    if (first) this.add(first);
    else if (this.query().trim()) this.newArticle();
  }

  /** En del som inte finns i registret läggs in direkt och hamnar som en rad i inköpet. */
  newArticle() {
    const name = this.query().trim();
    this.dialog
      .open(QuickArticleDialog, { data: { name, purchase: true }, width: '460px' })
      .afterClosed()
      .subscribe((a: Article | undefined) => {
        if (a) this.add(a);
      });
  }

  private body() {
    return {
      supplierId: this.supplierCtl.value || null,
      reference: this.reference().trim() || null,
      url: normalizeUrl(this.url()) ?? null,
      note: this.note().trim() || null,
      purchasedAt: this.day() ? noonOf(this.day()) : null,
      lines: this.rows().map((r) => ({
        id: r.id,
        articleId: r.a.id,
        quantity: r.qty,
        // Skrivs inkl. moms och lagras utan (ingående moms dras av).
        unitCost: this.pricing.costNet(Math.round((r.price || 0) * 100)),
      })),
    };
  }

  /** Sparar utkastet; ett nytt kort får sitt nummer och sidan byter till kortets adress. */
  save(after?: () => void) {
    if (!this.valid()) {
      this.snack.open('Kontrollera raderna: antal ska vara ett helt tal, minst 1.', 'OK', {
        duration: 4000,
      });
      return;
    }
    this.busy.set(true);
    const req = this.id ? this.cards.update(this.id, this.body()) : this.cards.create(this.body());
    req.subscribe({
      next: (c) => {
        this.busy.set(false);
        this.dirty.set(false);
        if (!this.id) {
          void this.router.navigate(['/purchases', c.id], { replaceUrl: true });
          return;
        }
        this.snack.open('Sparat', undefined, { duration: 2000 });
        this.load();
        after?.();
      },
      error: () => this.busy.set(false),
    });
  }

  post() {
    this.confirm
      .ask({
        title: 'Bokföra inköpet?',
        message: `${this.units()} st läggs in i lagret under ett inköpsnummer. Därefter går kortet inte att ändra.`,
        confirmText: 'Bokför',
      })
      .subscribe((ok) => {
        if (!ok) return;
        const book = () => {
          this.busy.set(true);
          this.cards.post(this.id!).subscribe({
            next: (c) => {
              this.busy.set(false);
              this.snack.open(`Inköp ${c.documentCode} är bokfört`, 'OK', { duration: 4000 });
              this.load();
            },
            error: () => this.busy.set(false),
          });
        };
        if (this.dirty()) this.save(book);
        else book();
      });
  }

  remove() {
    this.confirm
      .ask({
        title: 'Ta bort utkastet?',
        message: 'Utkastet och dess rader tas bort. Inget har lagts in i lagret.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.cards.remove(this.id!).subscribe(() => {
          this.dirty.set(false);
          void this.router.navigate(['/purchases']);
        });
      });
  }

  openDocument() {
    const n = this.card()?.documentNumber;
    if (n == null) return;
    this.dialog.open(TradeDocumentDialog, {
      data: { kind: 'purchases', number: n },
      width: '720px',
      maxWidth: '95vw',
    });
  }
}
