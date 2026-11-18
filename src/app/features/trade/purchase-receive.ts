import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { PurchaseCardApi } from '../../core/api/purchase-card-api';
import type { ScanHit } from '../../core/api/stock-count-api';
import { shrinkImage } from '../../core/image-resize';
import {
  Article,
  DocumentProposal,
  PurchaseCard,
  PurchaseCardLine,
  itemKind,
} from '../../core/models';
import { Pricing } from '../../core/pricing';
import { isOwnLabel } from '../../core/scan/code';
import { Scanner } from '../../core/scan/scanner';
import { Confirm } from '../../shared/confirm';
import { SharedModule } from '../../shared/shared-module';

/** Så här mycket får summan på pappret avvika från raderna (öresavrundning) innan det varnas. */
const TOTAL_TOLERANCE_ORE = 100;

type Shelf = Extract<ScanHit, { kind: 'location' }>;

/**
 * Ta emot en beställning: varje rad har beställt, mottaget och det som kommer in nu. Skanna varorna
 * (en skanning = en till), eller välj Ta emot allt; Ta emot bokför det som kom och resten väntar på
 * nästa leverans. En vara som inte har en rad på ordern visas, mer än beställt frågas om, en okänd
 * streckkod frågar vilken rad den är och lär in den, och en skannad hylla får varorna att läggas där.
 * Pappret som följde med fotas och sparas på inköpet; det kan också läsas, så fylls raderna i, och
 * dess summa kontrolleras mot beställningen.
 */
@Component({
  selector: 'app-purchase-receive',
  standalone: true,
  imports: [SharedModule],
  host: { class: 'flex flex-col gap-4' },
  template: `
    <section class="rounded-xl bg-white p-5 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold">Ta emot leverans</h2>
          <p class="text-sm text-gray-600">
            {{ card().receivedUnits }} av {{ card().units }} st mottagna. Skanna varorna när de
            kommer, eller välj Ta emot allt.
          </p>
        </div>
        <div class="flex gap-2">
          <button mat-stroked-button type="button" (click)="scanner.openDialog()">
            <mat-icon>qr_code_scanner</mat-icon> Skanna
          </button>
          <button mat-stroked-button type="button" [disabled]="!anyLeft()" (click)="takeAll()">
            Ta emot allt
          </button>
        </div>
      </div>

      @if (shelf(); as s) {
        <p class="mt-3 flex items-center gap-2 rounded-lg bg-green-50 p-2.5 text-sm text-green-900">
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
        <p class="mt-3 text-xs text-gray-500">
          Skanna en hylla för att lägga varorna där de tas emot.
        </p>
      }

      @if (notOnOrder().length) {
        <div class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <b>Står på pappret men inte på ordern:</b>
          {{ notOnOrder().join(', ') }}
        </div>
      }

      <ul class="mt-4 divide-y divide-gray-100">
        @for (r of rows(); track r.line.id) {
          <li class="flex items-center gap-3 py-3">
            @if (r.line.article; as a) {
              <app-item-icon [kind]="kind(a)" />
            }
            <div class="min-w-0 flex-1">
              <div class="truncate text-[15px] font-medium">{{ title(r.line) }}</div>
              <div class="truncate text-xs text-gray-500">{{ subtitle(r.line) }}</div>
              <div class="mt-0.5 text-xs text-gray-600">
                Beställt {{ r.line.quantity }} · mottaget {{ r.line.received }}
              </div>
              <div class="text-xs font-medium" [class]="r.cls">{{ r.state }}</div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button
                mat-icon-button
                type="button"
                aria-label="Ett färre"
                [disabled]="r.now <= 0"
                (click)="step(r.line, -1)"
              >
                <mat-icon>remove</mat-icon>
              </button>
              <span class="w-8 text-center text-lg font-semibold tabular-nums">{{ r.now }}</span>
              <button mat-icon-button type="button" aria-label="Ett till" (click)="step(r.line, 1)">
                <mat-icon>add</mat-icon>
              </button>
            </div>
          </li>
        }
      </ul>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button
          mat-flat-button
          color="primary"
          type="button"
          class="!h-12 flex-1 !text-base"
          [disabled]="busy() || nowUnits() === 0"
          (click)="receive()"
        >
          Ta emot {{ nowUnits() }} st
        </button>
        <button mat-button type="button" [disabled]="busy()" (click)="closeOrder()">
          Stäng beställningen
        </button>
      </div>
    </section>

    <section class="rounded-xl bg-white p-5 shadow-sm">
      <h2 class="mb-1 text-base font-semibold">Följesedel och kvitto</h2>
      <p class="mb-3 text-sm text-gray-600">
        Ta ett foto på pappret som följde med. Det sparas på inköpet. Läs det, så fylls det som kom
        i av sig självt.
      </p>
      <div class="flex flex-wrap gap-2">
        <button mat-stroked-button type="button" (click)="photo.click()">
          <mat-icon>photo_camera</mat-icon> Lägg till foto
        </button>
        <input
          #photo
          type="file"
          hidden
          accept="image/*,application/pdf"
          (change)="addPaper($event)"
        />
        <button mat-stroked-button type="button" [disabled]="reading()" (click)="scan.click()">
          <mat-icon>document_scanner</mat-icon>
          {{ reading() ? 'Läser…' : 'Läs följesedeln' }}
        </button>
        <input
          #scan
          type="file"
          hidden
          accept="image/*,application/pdf"
          (change)="readPaper($event)"
        />
      </div>
      @if (demo()) {
        <p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Läsningen är inte påslagen här: raderna är ett exempel, inte vad pappret säger.
        </p>
      }
      @if (card().attachments.length) {
        <ul class="mt-3 divide-y divide-gray-100">
          @for (p of card().attachments; track p.name) {
            <li class="flex items-center gap-2 py-1.5">
              <mat-icon class="text-gray-400">{{
                p.type === 'application/pdf' ? 'picture_as_pdf' : 'image'
              }}</mat-icon>
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left text-sm text-brand hover:underline"
                (click)="openPaper(p.name)"
              >
                {{ p.label }}
              </button>
              <button
                mat-icon-button
                type="button"
                aria-label="Ta bort pappret"
                (click)="removePaper(p.name)"
              >
                <mat-icon>close</mat-icon>
              </button>
            </li>
          }
        </ul>
      }

      <div class="mt-4 grid items-start gap-3 sm:grid-cols-2">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Summa på pappret (kr, inkl. moms)</mat-label>
          <input
            matInput
            type="number"
            inputmode="decimal"
            step="0.01"
            [formControl]="totalCtl"
            (blur)="saveTotal()"
          />
        </mat-form-field>
        @if (check(); as c) {
          <p class="rounded-lg p-3 text-sm" [class]="c.cls">{{ c.text }}</p>
        }
      </div>
    </section>

    @if (card().receipts.length) {
      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-2 text-base font-semibold">Mottagna leveranser</h2>
        <ul class="divide-y divide-gray-100 text-sm">
          @for (r of card().receipts; track r.documentNumber) {
            <li class="flex items-center justify-between gap-3 py-2">
              <span class="font-medium">{{ r.documentCode }}</span>
              <span class="text-gray-600">{{ r.at | date: 'yyyy-MM-dd HH:mm' }}</span>
              <span class="tabular-nums">{{ unitsOf(r) }} st</span>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class PurchaseReceive implements OnInit {
  readonly card = input.required<PurchaseCard>();
  /** Något ändrades på servern: sidan hämtar kortet på nytt. */
  readonly changed = output<void>();

  private readonly cards = inject(PurchaseCardApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly pricing = inject(Pricing);
  readonly scanner = inject(Scanner);

  /** Det som kommer in nu, per rad. */
  private readonly nowMap = signal<Record<string, number>>({});
  /** Rader där man godtagit mer än beställt, så det inte frågas om vid varje skanning. */
  private readonly accepted = new Set<string>();

  readonly shelf = signal<Shelf | null>(null);
  readonly busy = signal(false);
  readonly reading = signal(false);
  readonly demo = signal(false);
  /** Rader på ett inläst papper som inte fanns på ordern. */
  readonly notOnOrder = signal<string[]>([]);

  readonly totalCtl = new FormControl<number | null>(null);
  private readonly docTotal = signal<number | null>(null);

  readonly rows = computed(() =>
    this.card().lines.map((line) => {
      const now = this.nowMap()[line.id] ?? 0;
      const after = line.received + now;
      let state = 'Väntar';
      let cls = 'text-gray-500';
      if (after > line.quantity) {
        state = `Extra +${after - line.quantity}`;
        cls = 'text-amber-700';
      } else if (after === line.quantity) {
        state = 'Komplett';
        cls = 'text-green-700';
      } else if (after > 0) {
        state = `${after} av ${line.quantity}`;
        cls = 'text-amber-700';
      }
      return { line, now, state, cls };
    }),
  );
  readonly nowUnits = computed(() => this.rows().reduce((n, r) => n + r.now, 0));
  readonly anyLeft = computed(() => this.rows().some((r) => r.line.remaining - r.now > 0));

  /** Beställningens summa inkl. moms, som den ska stämma mot pappret. */
  private readonly orderedIncl = computed(() =>
    this.card().lines.reduce((n, l) => n + l.quantity * this.pricing.costIncl(l.unitCost), 0),
  );
  readonly check = computed(() => {
    const total = this.docTotal();
    if (total == null) return null;
    const diff = total - this.orderedIncl();
    const kr = (ore: number) => `${(Math.abs(ore) / 100).toLocaleString('sv-SE')} kr`;
    return Math.abs(diff) <= TOTAL_TOLERANCE_ORE
      ? {
          cls: 'bg-green-50 text-green-900',
          text: `Stämmer med beställningen (${kr(this.orderedIncl())}).`,
        }
      : {
          cls: 'bg-amber-50 text-amber-900',
          text: `Avviker ${kr(diff)} från beställningens ${kr(this.orderedIncl())}. Kontrollera priserna, eller om pappret gäller en del av ordern.`,
        };
  });

  constructor() {
    // Skanningarna gäller leveransen: en vara räknas upp, en hylla väljs, en okänd kod kopplas.
    const release = this.scanner.capture((code) => void this.onScan(code));
    inject(DestroyRef).onDestroy(release);
  }

  ngOnInit() {
    const t = this.card().documentTotal;
    this.docTotal.set(t);
    this.totalCtl.setValue(t == null ? null : t / 100, { emitEvent: false });
  }

  // --- att välja vad som kommer in ---

  title(l: PurchaseCardLine) {
    const a = l.article;
    return a
      ? a.sizeLabel || [a.brand, a.model].filter(Boolean).join(' ') || a.label
      : 'Okänd artikel';
  }

  subtitle(l: PurchaseCardLine) {
    const a = l.article;
    if (!a) return '';
    const name = a.sizeLabel ? [a.brand, a.model].filter(Boolean).join(' ') : '';
    return [name, a.sku, a.location].filter(Boolean).join(' · ');
  }

  kind(a: Article) {
    return itemKind(a.category);
  }

  unitsOf(r: PurchaseCard['receipts'][number]) {
    return r.lines.reduce((n, l) => n + l.quantity, 0);
  }

  takeAll() {
    const all: Record<string, number> = {};
    for (const l of this.card().lines) if (l.remaining > 0) all[l.id] = l.remaining;
    this.nowMap.set(all);
  }

  async step(line: PurchaseCardLine, by: number) {
    if (by < 0) {
      this.nowMap.update((m) => ({ ...m, [line.id]: Math.max(0, (m[line.id] ?? 0) + by) }));
      return;
    }
    await this.add(line);
  }

  /** En till av raden; mer än beställt frågas om en gång per rad. */
  private async add(line: PurchaseCardLine): Promise<boolean> {
    const now = (this.nowMap()[line.id] ?? 0) + 1;
    const after = line.received + now;
    if (after > line.quantity && !this.accepted.has(line.id)) {
      const ok = await firstValueFrom(
        this.confirm.ask({
          title: 'Mer än beställt?',
          message: `${this.title(line)}: ${line.quantity} beställda och ${line.received} redan mottagna. Ta emot ${after} ändå? Det som är över märks som extra.`,
          confirmText: 'Ta emot ändå',
        }),
      );
      if (!ok) return false;
      this.accepted.add(line.id);
    }
    this.nowMap.update((m) => ({ ...m, [line.id]: now }));
    return true;
  }

  // --- skanning ---

  private async onScan(code: string) {
    const hit = await this.scanner.resolve(code);
    if (!hit) return;
    if (hit.kind === 'article') return void this.count(hit.id, hit.label);
    if (hit.kind === 'none') return this.unknown(hit.code);
    if (hit.kind === 'location') return this.setShelf(hit);
    this.scanner.open(hit);
  }

  private async count(articleId: string, label: string) {
    const line = this.card().lines.find((l) => l.articleId === articleId);
    if (!line) {
      this.scanner.beep(false);
      this.snack.open(`${label} finns inte på den här ordern`, undefined, { duration: 3500 });
      return;
    }
    if (await this.add(line)) this.scanner.beep(true);
  }

  /** En streckkod som ingen känner: vilken rad är det? Raderna på ordern är de troligaste. */
  private async unknown(code: string) {
    this.scanner.beep(false);
    if (isOwnLabel(code)) {
      this.snack.open(`${code} hör inte till någon artikel`, undefined, { duration: 3500 });
      return;
    }
    const { ArticleLinkDialog } = await import('../../core/scan/article-link-dialog');
    const article = await firstValueFrom(
      this.dialog
        .open(ArticleLinkDialog, {
          width: '460px',
          maxWidth: '96vw',
          autoFocus: false,
          data: {
            code,
            title: 'Vilken rad är det här?',
            suggestionsLabel: 'Raderna på ordern',
            suggestions: this.card()
              .lines.map((l) => l.article)
              .filter((a): a is Article => !!a),
          },
        })
        .afterClosed(),
    );
    if (article) await this.count(article.id, article.label);
  }

  private setShelf(hit: Shelf) {
    if (hit.warehouseKind !== 'own') {
      this.scanner.beep(false);
      this.snack.open('Det där är en hylla i däckhotellet, inte i lagret.', undefined, {
        duration: 3500,
      });
      return;
    }
    this.shelf.set(hit);
    this.scanner.beep(true);
    this.snack.open(`Hylla: ${hit.label}`, undefined, { duration: 2500 });
  }

  // --- ta emot ---

  private nowLines() {
    return Object.entries(this.nowMap())
      .filter(([, q]) => q > 0)
      .map(([lineId, quantity]) => ({ lineId, quantity }));
  }

  private send(close: boolean) {
    const s = this.shelf();
    this.busy.set(true);
    this.cards
      .receive(this.card().id, {
        lines: this.nowLines(),
        place: s ? { warehouseId: s.warehouseId, locationId: s.locationId } : null,
        close,
      })
      .subscribe({
        next: (c) => {
          this.busy.set(false);
          this.nowMap.set({});
          this.accepted.clear();
          this.notOnOrder.set([]);
          this.snack.open(
            c.status === 'posted'
              ? `Beställningen är klar (${c.documentCode ?? 'ingen leverans'})`
              : `Tog emot ${this.nowUnitsBefore} st (${c.documentCode})`,
            'OK',
            { duration: 4000 },
          );
          this.changed.emit();
        },
        error: () => this.busy.set(false),
      });
  }

  /** Antalet som skickades, för meddelandet efter att listan nollats. */
  private nowUnitsBefore = 0;

  receive() {
    if (this.nowUnits() === 0) return;
    this.nowUnitsBefore = this.nowUnits();
    this.send(false);
  }

  closeOrder() {
    const missing = this.rows().reduce((n, r) => n + Math.max(0, r.line.remaining - r.now), 0);
    this.confirm
      .ask({
        title: 'Stänga beställningen?',
        message: missing
          ? `${missing} st saknas och räknas som att de inte kommer. Det du skannat tas emot först, sedan stängs ordern.`
          : 'Allt är mottaget. Beställningen stängs.',
        confirmText: 'Stäng',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.nowUnitsBefore = this.nowUnits();
        this.send(true);
      });
  }

  // --- pappret ---

  async addPaper(ev: Event) {
    const file = await this.fileOf(ev);
    if (!file) return;
    this.cards.addAttachment(this.card().id, await shrinkImage(file)).subscribe({
      next: () => this.changed.emit(),
    });
  }

  openPaper(name: string) {
    this.cards.attachment(this.card().id, name).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  removePaper(name: string) {
    this.cards.removeAttachment(this.card().id, name).subscribe(() => this.changed.emit());
  }

  saveTotal() {
    const v = this.totalCtl.value;
    const ore = v == null || Number.isNaN(v) ? null : Math.round(v * 100);
    if (ore === this.docTotal()) return;
    this.docTotal.set(ore);
    this.cards.update(this.card().id, { documentTotal: ore }).subscribe();
  }

  /** Läser pappret: raderna som finns på ordern fylls i som mottagna, resten visas. Pappret sparas. */
  async readPaper(ev: Event) {
    const file = await this.fileOf(ev);
    if (!file) return;
    const small = await shrinkImage(file);
    this.reading.set(true);
    this.cards.readDocument(small).subscribe({
      next: (p) => {
        this.reading.set(false);
        this.applyRead(p);
        this.cards
          .addAttachment(this.card().id, small)
          .subscribe({ next: () => this.changed.emit() });
      },
      error: () => this.reading.set(false),
    });
  }

  private applyRead(p: DocumentProposal) {
    this.demo.set(p.demo);
    const lines = new Map(this.card().lines.map((l) => [l.articleId, l]));
    const now: Record<string, number> = {};
    const left: string[] = [];
    for (const pl of p.lines) {
      const line = pl.match ? lines.get(pl.match.article.id) : undefined;
      if (!line) {
        left.push(pl.description);
        continue;
      }
      now[line.id] = (now[line.id] ?? 0) + pl.quantity;
      if (line.received + now[line.id] > line.quantity) this.accepted.add(line.id);
    }
    this.nowMap.set(now);
    this.notOnOrder.set(left);
    if (p.totalInclVat != null && this.docTotal() == null) {
      this.totalCtl.setValue(p.totalInclVat / 100);
      this.saveTotal();
    }
    this.snack.open(
      `Läste ${p.lines.length} rader, ${p.lines.length - left.length} fanns på ordern`,
      undefined,
      { duration: 3500 },
    );
  }

  private async fileOf(ev: Event): Promise<File | null> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    return file;
  }
}
