import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, firstValueFrom, of } from 'rxjs';
import { AxleApi } from '../../../core/api/axle-api';
import { CatalogApi } from '../../../core/api/catalog-api';
import type { ScanHit } from '../../../core/api/stock-count-api';
import { Pricing } from '../../../core/pricing';
import { Scanner } from '../../../core/scan/scanner';
import { Confirm } from '../../../shared/confirm';
import { STOCK_TABS } from '../../../shared/page-header/tabs';
import { ReceiveDraft, ReceiveLine } from './receive-draft';

interface Feedback {
  tone: 'ok' | 'warn' | 'err';
  text: string;
  /** Koden som inte kändes igen: erbjuder att skapa artikeln. */
  unknownCode?: string;
}

/**
 * Ta emot varor. Man skannar det som kommer in (streckkoden på kartongen eller vår egen etikett);
 * varje skanning är en enhet mer på artikelns rad. Först när man bekräftar blir det inköp i lagret:
 * saldot ökar och snittpriset räknas om, precis som när man gör Inköp på en enskild artikel.
 */
@Component({
  selector: 'app-stock-receive',
  standalone: false,
  host: { class: 'block' },
  template: `
    <app-page-header [tabs]="tabs" [desktopOnly]="true" label="Ta emot varor" />

    <div class="mb-4 rounded-xl bg-white p-3 shadow-sm md:p-4">
      <div class="flex flex-wrap items-center gap-2">
        <input
          #field
          class="h-12 min-w-0 flex-1 rounded-xl border border-gray-300 px-3 text-lg"
          placeholder="Skanna en vara eller skriv koden…"
          autocomplete="off"
          autocapitalize="characters"
          (keydown.enter)="submit(field)"
        />
        <button mat-flat-button type="button" (click)="scanner.openDialog()" class="!h-12">
          <mat-icon>qr_code_scanner</mat-icon> Skanna
        </button>
      </div>
      @if (feedback(); as f) {
        <div
          class="mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm"
          [class.bg-green-50]="f.tone === 'ok'"
          [class.text-green-900]="f.tone === 'ok'"
          [class.bg-amber-50]="f.tone === 'warn'"
          [class.text-amber-900]="f.tone === 'warn'"
          [class.bg-red-50]="f.tone === 'err'"
          [class.text-red-900]="f.tone === 'err'"
          role="status"
        >
          <span class="min-w-0 flex-1">{{ f.text }}</span>
          @if (f.unknownCode; as code) {
            <button mat-stroked-button type="button" (click)="linkArticle(code)">
              <mat-icon>link</mat-icon> Koppla till artikel
            </button>
            <button mat-stroked-button type="button" (click)="createArticle(code)">
              <mat-icon>add</mat-icon> Skapa artikel
            </button>
          }
        </div>
      }
      @if (shelf(); as s) {
        <p class="mt-2 flex items-center gap-2 rounded-lg bg-green-50 p-2.5 text-sm text-green-900">
          <mat-icon class="!h-5 !w-5 !text-xl">warehouse</mat-icon>
          <span class="min-w-0 flex-1">Varorna läggs på {{ s.label }}</span>
          <button
            type="button"
            class="grid h-7 w-7 place-items-center rounded-full hover:bg-green-100"
            aria-label="Ta bort hyllan"
            (click)="shelf.set(null)"
          >
            <mat-icon class="!h-4 !w-4 !text-base">close</mat-icon>
          </button>
        </p>
      } @else {
        <p class="mt-2 text-xs text-gray-500">
          Skanna en hylla för att lägga varorna där de tas emot.
        </p>
      }
    </div>

    <div
      class="mb-4 grid grid-cols-1 gap-3 rounded-xl bg-white p-3 shadow-sm sm:grid-cols-2 md:p-4"
    >
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Leverantör (valfritt)</mat-label>
        <input
          matInput
          [value]="draft.supplier()"
          (input)="draft.supplier.set($any($event.target).value)"
        />
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Följesedel eller ordernr (valfritt)</mat-label>
        <input
          matInput
          [value]="draft.reference()"
          (input)="draft.reference.set($any($event.target).value)"
        />
      </mat-form-field>
    </div>

    @if (!draft.lines().length) {
      <div class="rounded-xl bg-white p-8 text-center shadow-sm">
        <mat-icon class="!h-10 !w-10 !text-4xl text-gray-400">inventory_2</mat-icon>
        <h2 class="mt-2 text-lg font-semibold">Inget skannat än</h2>
        <p class="mx-auto mt-1 max-w-md text-sm text-gray-600">
          Skanna varorna när de kommer. Varje skanning räknar upp antalet. Lagret ändras först när
          du bekräftar.
        </p>
      </div>
    } @else {
      <div class="overflow-hidden rounded-xl bg-white shadow-sm">
        @for (l of draft.lines(); track l.articleId) {
          <div
            class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 px-3 py-3 last:border-b-0"
            [class.bg-green-50]="l.articleId === touched()"
          >
            <div class="min-w-0 flex-1 basis-48">
              <div class="font-medium">{{ l.label }}</div>
              @if (l.code) {
                <div class="text-xs text-gray-500">{{ l.code }}</div>
              }
            </div>
            <div class="flex items-center gap-1">
              <button
                mat-icon-button
                type="button"
                aria-label="Ett färre"
                [disabled]="l.quantity <= 1"
                (click)="draft.patch(l.articleId, { quantity: l.quantity - 1 })"
              >
                <mat-icon>remove</mat-icon>
              </button>
              <input
                type="number"
                min="1"
                inputmode="numeric"
                class="h-10 w-16 rounded-lg border border-gray-300 px-2 text-center tabular-nums"
                [value]="l.quantity"
                (change)="setQuantity(l, $any($event.target).value)"
                [attr.aria-label]="'Antal ' + l.label"
              />
              <button
                mat-icon-button
                type="button"
                aria-label="Ett till"
                (click)="draft.patch(l.articleId, { quantity: l.quantity + 1 })"
              >
                <mat-icon>add</mat-icon>
              </button>
            </div>
            <label class="flex items-center gap-1 text-sm text-gray-600">
              <input
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                placeholder="Pris"
                class="h-10 w-24 rounded-lg border px-2 text-right tabular-nums"
                [class.border-amber-500]="!l.unitCost"
                [class.border-gray-300]="!!l.unitCost"
                [value]="l.unitCost"
                (input)="draft.patch(l.articleId, { unitCost: $any($event.target).value })"
                [attr.aria-label]="'Pris per styck inkl. moms ' + l.label"
              />
              kr/st
            </label>
            <button
              mat-icon-button
              type="button"
              aria-label="Ta bort raden"
              (click)="draft.remove(l.articleId)"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
        }
      </div>

      <div
        class="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-md"
      >
        <div class="min-w-0 flex-1 text-sm">
          <b>{{ draft.units() }} st</b> på {{ draft.lines().length }} artiklar
          @if (draft.totalOre() > 0) {
            · {{ draft.totalOre() | kr }} inkl. moms
          }
          @if (draft.missingPrice(); as m) {
            <div class="text-amber-800">Pris saknas på {{ m }} rader.</div>
          }
        </div>
        <button mat-stroked-button type="button" (click)="discard()" [disabled]="busy()">
          Töm
        </button>
        <button
          mat-flat-button
          type="button"
          (click)="confirmReceive()"
          [disabled]="busy() || draft.missingPrice() > 0"
        >
          <mat-icon>done_all</mat-icon> Bekräfta inköp
        </button>
      </div>
    }
  `,
})
export class StockReceive implements OnDestroy {
  private readonly api = inject(AxleApi);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly pricing = inject(Pricing);
  private readonly dialog = inject(MatDialog);
  private readonly catalog = inject(CatalogApi);
  readonly scanner = inject(Scanner);
  readonly draft = inject(ReceiveDraft);
  readonly tabs = STOCK_TABS;

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly release = this.scanner.capture((code) => void this.onScan(code));

  readonly feedback = signal<Feedback | null>(null);
  readonly touched = signal<string | null>(null);
  readonly busy = signal(false);
  /** Hyllan varorna läggs på när de tas emot (en skannad hylla, eller den man kom från). */
  readonly shelf = signal<{ warehouseId: string; locationId: string; label: string } | null>(null);

  constructor() {
    // Från hyllbladet ("Ta emot här"): hyllan är redan vald.
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    const warehouseId = q.get('warehouseId');
    const locationId = q.get('locationId');
    if (warehouseId && locationId) {
      this.catalog
        .warehouses()
        .pipe(catchError(() => of([])))
        .subscribe((all) => {
          const w = all.find((x) => x.id === warehouseId);
          const l = w?.locations.find((x) => x.id === locationId);
          if (w && l) this.shelf.set({ warehouseId, locationId, label: `${w.name} · ${l.name}` });
        });
    }
  }

  ngOnDestroy() {
    this.release();
  }

  submit(el: HTMLInputElement) {
    const code = el.value;
    el.value = '';
    void this.onScan(code);
    el.focus();
  }

  async onScan(raw: string) {
    if (this.busy() || !raw.trim()) return;
    const hit = await this.scanner.resolve(raw);
    if (!hit) return;
    if (hit.kind === 'none') {
      this.scanner.beep(false);
      return this.say('err', `Hittar ingen artikel med koden ${hit.code}.`, hit.code);
    }
    if (hit.kind === 'location') return this.setShelf(hit);
    if (hit.kind !== 'article') {
      this.scanner.beep(false);
      return this.say('warn', 'Det där är inte en artikel. Skanna varans streckkod.');
    }
    this.take(hit.id, hit.label, hit.code);
  }

  /** En artikel räknas upp på listan (en skanning = en till). */
  private take(id: string, label: string, code: string | null) {
    const line = this.draft.add({
      articleId: id,
      label,
      code,
      unitCost: '',
      loaded: false,
    });
    this.touched.set(id);
    this.scanner.beep(true);
    this.say('ok', `${label} – ${line.quantity} st`);
    if (!line.loaded) void this.fill(id);
  }

  private setShelf(hit: Extract<ScanHit, { kind: 'location' }>) {
    if (hit.warehouseKind !== 'own') {
      this.scanner.beep(false);
      return this.say('warn', 'Det där är en hylla i däckhotellet, inte i lagret.');
    }
    this.shelf.set(hit);
    this.scanner.beep(true);
    this.say('ok', `Hylla: ${hit.label}`);
  }

  /** En kod som ingen känner: koppla den till en artikel man har, så hittas den nästa gång. */
  async linkArticle(code: string) {
    const { ArticleLinkDialog } = await import('../../../core/scan/article-link-dialog');
    const article = await firstValueFrom(
      this.dialog
        .open(ArticleLinkDialog, {
          width: '460px',
          maxWidth: '96vw',
          autoFocus: false,
          data: { code },
        })
        .afterClosed(),
    );
    if (article) this.take(article.id, article.label, article.code);
  }

  /** Hämtar artikeln för att förfylla senast betalda pris och leverantör. */
  private async fill(articleId: string) {
    this.draft.patch(articleId, { loaded: true });
    try {
      const a = await firstValueFrom(this.api.article(articleId));
      const cost =
        a.averageCost && a.averageCost > 0
          ? String(this.pricing.costIncl(a.averageCost) / 100)
          : '';
      const current = this.draft.lines().find((l) => l.articleId === articleId);
      if (current && current.unitCost === '') this.draft.patch(articleId, { unitCost: cost });
      if (a.supplier && !this.draft.supplier()) this.draft.supplier.set(a.supplier);
    } catch {
      // Priset får skrivas in för hand.
    }
  }

  setQuantity(l: ReceiveLine, value: string) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 1) this.draft.patch(l.articleId, { quantity: n });
  }

  createArticle(code: string) {
    void this.router.navigate(['/inventory/new'], { queryParams: { ean: code } });
  }

  discard() {
    this.confirm
      .ask({
        title: 'Töm listan?',
        message: 'De skannade raderna tas bort. Lagret är inte ändrat.',
        confirmText: 'Töm',
      })
      .subscribe((ok) => ok && this.draft.clear());
  }

  confirmReceive() {
    const lines = this.draft.lines();
    if (!lines.length || this.draft.missingPrice()) return;
    this.confirm
      .ask({
        title: 'Bekräfta inköp?',
        message: `${this.draft.units()} st på ${lines.length} artiklar läggs in i lagret.`,
        confirmText: 'Bekräfta',
      })
      .subscribe((ok) => ok && void this.post());
  }

  /** En rad i taget: en som misslyckas ligger kvar, de som gick igenom tas bort ur listan. */
  private async post() {
    this.busy.set(true);
    const supplier = this.draft.supplier().trim() || undefined;
    const reference = this.draft.reference().trim() || undefined;
    let done = 0;
    for (const l of [...this.draft.lines()]) {
      try {
        await firstValueFrom(
          this.api.stockAction(l.articleId, 'receive', {
            quantity: l.quantity,
            unitCost: this.pricing.costNet(Math.round(Number(l.unitCost) * 100)),
            supplier,
            reference,
          }),
        );
        // Är en hylla vald läggs varan där; det är en bekvämlighet, så ett fel stoppar inget.
        const shelf = this.shelf();
        if (shelf) {
          await firstValueFrom(
            this.api
              .updateArticle(l.articleId, {
                warehouseId: shelf.warehouseId,
                locationId: shelf.locationId,
              })
              .pipe(catchError(() => of(null))),
          );
        }
        this.draft.remove(l.articleId);
        done++;
      } catch {
        // Felrutan visar orsaken; raden ligger kvar att försöka igen.
        break;
      }
    }
    this.busy.set(false);
    if (!this.draft.lines().length) {
      this.draft.clear();
      this.snack.open(`Inköpet är inlagt: ${done} artiklar.`, undefined, { duration: 4000 });
    } else if (done) {
      this.say('warn', `${done} artiklar lades in. Resten ligger kvar: försök igen.`);
    }
  }

  private say(tone: Feedback['tone'], text: string, unknownCode?: string) {
    this.feedback.set({ tone, text, unknownCode });
    this.field()?.nativeElement.focus();
  }
}
