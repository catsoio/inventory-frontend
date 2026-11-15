import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../../core/auth/auth';
import {
  ScanHit,
  StockCount,
  StockCountApi,
  StockCountHeader,
  StockCountLine,
} from '../../../core/api/stock-count-api';
import { Scanner } from '../../../core/scan/scanner';
import { Confirm } from '../../../shared/confirm';

type Filter = 'all' | 'diff' | 'open';
interface Feedback {
  tone: 'ok' | 'warn' | 'err';
  text: string;
}

/**
 * Räknesidan. Man skannar: på lagret är varje skanning en enhet mer, och man kan skriva ett antal
 * i stället; på däckhotellet skannar man hyllan och sedan varje set på den. Axle visar skillnaderna
 * direkt, men bokför ingenting förrän ägaren trycker Bokför.
 */
@Component({
  selector: 'app-stock-count-page',
  standalone: false,
  host: { class: 'block' },
  template: `
    @if (count(); as c) {
      <div class="mb-1 text-sm text-gray-500">
        <a routerLink="/inventory/counts" class="text-brand underline">Inventering</a> /
        {{ c.code }}
      </div>
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <h1 class="text-2xl font-semibold">{{ c.scopeLabel }}</h1>
        <app-pill [tone]="open() ? 'amber' : 'green'">{{ open() ? 'Pågår' : 'Bokförd' }}</app-pill>
        <span class="text-sm text-gray-500">{{ c.kind === 'hotel' ? 'Däckhotell' : 'Lager' }}</span>
      </div>

      @if (open()) {
        <div class="mb-4 rounded-xl bg-white p-3 shadow-sm md:p-4">
          <div class="flex flex-wrap items-center gap-2">
            <input
              #field
              class="h-12 min-w-0 flex-1 rounded-xl border border-gray-300 px-3 text-lg"
              [placeholder]="placeholder()"
              autocomplete="off"
              autocapitalize="characters"
              (keydown.enter)="submit(field)"
            />
            <button mat-stroked-button type="button" (click)="scanner.openDialog()" class="!h-12">
              <mat-icon>photo_camera</mat-icon> Kamera
            </button>
          </div>
          @if (c.kind === 'hotel' && !c.locationId) {
            <div class="mt-2 text-sm">
              @if (shelf(); as s) {
                Hylla: <b>{{ s.label }}</b> – skanna setten som står här, eller en annan hylla.
              } @else {
                <span class="text-amber-800">Skanna hyllans etikett först.</span>
              }
            </div>
          }
          @if (feedback(); as f) {
            <div
              class="mt-2 rounded-lg px-3 py-2 text-sm"
              [class.bg-green-50]="f.tone === 'ok'"
              [class.text-green-900]="f.tone === 'ok'"
              [class.bg-amber-50]="f.tone === 'warn'"
              [class.text-amber-900]="f.tone === 'warn'"
              [class.bg-red-50]="f.tone === 'err'"
              [class.text-red-900]="f.tone === 'err'"
              role="status"
            >
              {{ f.text }}
            </div>
          }
        </div>
      }

      <div class="mb-3 flex flex-wrap items-center gap-3">
        <app-segmented
          label="Visa"
          [options]="filters()"
          [value]="filter()"
          (valueChange)="filter.set($any($event))"
        />
        <span class="text-sm text-gray-600">
          {{ c.summary.counted }} av {{ c.summary.lines }} räknade
          @if (c.summary.differing) {
            · <b>{{ c.summary.differing }} avvikelser</b>
          }
        </span>
        <span class="flex-1"></span>
        @if (open()) {
          @if (c.kind === 'articles') {
            <mat-checkbox [checked]="zero()" (change)="zero.set($event.checked)">
              Sätt ej räknade till 0
            </mat-checkbox>
          }
          <button mat-stroked-button type="button" class="!text-red-700" (click)="discard()">
            Ta bort
          </button>
          @if (admin) {
            <button mat-flat-button type="button" (click)="post()" [disabled]="busy()">
              <mat-icon>done_all</mat-icon> Bokför
            </button>
          }
        }
      </div>

      <div class="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table class="w-full text-sm">
          <thead class="border-b border-gray-200 text-left text-gray-500">
            <tr>
              <th class="px-3 py-2 font-medium">{{ c.kind === 'hotel' ? 'Set' : 'Artikel' }}</th>
              <th class="px-3 py-2 font-medium">Plats i registret</th>
              @if (c.kind === 'articles') {
                <th class="px-3 py-2 text-right font-medium">Förväntat</th>
                <th class="px-3 py-2 text-right font-medium">Räknat</th>
                <th class="px-3 py-2 text-right font-medium">Skillnad</th>
              } @else {
                <th class="px-3 py-2 font-medium">Hittat på</th>
                <th class="px-3 py-2 font-medium">Läge</th>
              }
              <th class="w-10"></th>
            </tr>
          </thead>
          <tbody>
            @for (l of shown(); track l.id) {
              <tr
                class="border-b border-gray-100 last:border-b-0"
                [class.bg-green-50]="l.id === touched()"
              >
                <td class="px-3 py-2">
                  <div class="font-medium">{{ l.label }}</div>
                  <div class="text-xs text-gray-500">
                    {{ sub(l) }}
                    @if (l.added) {
                      · <span class="text-amber-800">inte på listan</span>
                    }
                  </div>
                </td>
                <td class="px-3 py-2">{{ l.place || '–' }}</td>
                @if (c.kind === 'articles') {
                  <td class="px-3 py-2 text-right tabular-nums">{{ l.expected }}</td>
                  <td class="px-3 py-2 text-right">
                    @if (open()) {
                      <input
                        type="number"
                        min="0"
                        class="h-9 w-20 rounded-lg border border-gray-300 px-2 text-right tabular-nums"
                        [value]="l.counted ?? ''"
                        (change)="setCount(l, $any($event.target).value)"
                        [attr.aria-label]="'Räknat antal ' + l.label"
                      />
                    } @else {
                      {{ l.counted ?? '–' }}
                    }
                  </td>
                  <td
                    class="px-3 py-2 text-right font-semibold tabular-nums"
                    [class.text-red-700]="diff(l) < 0"
                    [class.text-amber-700]="diff(l) > 0"
                  >
                    {{ l.counted === null ? '' : diff(l) > 0 ? '+' + diff(l) : diff(l) }}
                  </td>
                } @else {
                  <td class="px-3 py-2">{{ l.foundPlace || '–' }}</td>
                  <td class="px-3 py-2">
                    @if (l.counted === null) {
                      <app-pill>Ej räknad</app-pill>
                    } @else if (l.moved) {
                      <app-pill tone="amber">Flyttas</app-pill>
                    } @else {
                      <app-pill tone="green">Hittad</app-pill>
                    }
                  </td>
                }
                <td class="px-1 py-1 text-right">
                  @if (open() && (l.counted !== null || l.added)) {
                    <button
                      mat-icon-button
                      type="button"
                      aria-label="Ångra"
                      matTooltip="Ångra"
                      (click)="clear(l)"
                    >
                      <mat-icon>undo</mat-icon>
                    </button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td class="px-3 py-6 text-center text-gray-500" colspan="6">Inget att visa här.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (c.kind === 'hotel' && missing().length && !open()) {
        <p class="mt-3 text-sm text-amber-900">
          {{ missing().length }} set hittades inte och står kvar i registret: leta efter dem eller
          lämna ut dem.
        </p>
      }
    } @else {
      <mat-progress-bar mode="indeterminate" />
    }
  `,
})
export class StockCountPage implements OnDestroy {
  private readonly api = inject(StockCountApi);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  private readonly router = inject(Router);
  private readonly confirm = inject(Confirm);
  readonly scanner = inject(Scanner);
  readonly admin = inject(Auth).isAdmin();

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly release: () => void;

  readonly count = signal<StockCount | null>(null);
  readonly filter = signal<Filter>('all');
  readonly feedback = signal<Feedback | null>(null);
  readonly shelf = signal<{ id: string; label: string } | null>(null);
  readonly touched = signal<string | null>(null);
  readonly zero = signal(false);
  readonly busy = signal(false);

  readonly open = computed(() => this.count()?.status === 'open');
  readonly placeholder = computed(() =>
    this.count()?.kind === 'hotel'
      ? 'Skanna hylla eller hjulset…'
      : 'Skanna en vara eller skriv koden…',
  );
  readonly filters = computed(() => {
    const hotel = this.count()?.kind === 'hotel';
    return [
      { value: 'all', label: 'Alla' },
      { value: 'diff', label: hotel ? 'Avvikelser' : 'Skillnader' },
      { value: 'open', label: 'Ej räknade' },
    ];
  });
  readonly missing = computed(() =>
    (this.count()?.lines ?? []).filter((l) => !l.added && l.counted === null),
  );
  readonly shown = computed(() => {
    const c = this.count();
    if (!c) return [];
    const f = this.filter();
    const hotel = c.kind === 'hotel';
    let rows = c.lines.filter((l) => {
      if (f === 'open') return l.counted === null;
      if (f === 'diff')
        return hotel
          ? l.moved || l.added || l.counted === 0
          : l.counted !== null && l.counted !== l.expected;
      return true;
    });
    // Det senast skannade överst.
    const t = this.touched();
    rows = [...rows].sort((a, b) => (a.id === t ? -1 : b.id === t ? 1 : 0));
    return rows;
  });

  constructor() {
    this.api.get(this.id).subscribe((c) => {
      this.count.set(c);
      if (c.locationId) this.shelf.set({ id: c.locationId, label: c.scopeLabel });
      setTimeout(() => this.field()?.nativeElement.focus(), 0);
    });
    // Skanningar utanför fältet kommer hit i stället för att öppna något.
    this.release = this.scanner.capture((code) => void this.onScan(code));
  }

  ngOnDestroy() {
    this.release();
  }

  sub(l: StockCountLine) {
    return [l.code, l.detail].filter(Boolean).join(' · ');
  }

  diff(l: StockCountLine) {
    return (l.counted ?? 0) - l.expected;
  }

  submit(el: HTMLInputElement) {
    const code = el.value;
    el.value = '';
    void this.onScan(code);
    el.focus();
  }

  async onScan(raw: string) {
    const c = this.count();
    if (!c || c.status !== 'open' || !raw.trim()) return;
    const hit = await this.scanner.resolve(raw);
    if (!hit) return;
    this.handleHit(c, hit);
  }

  private handleHit(c: StockCount, hit: ScanHit) {
    if (hit.kind === 'none') return this.say('err', `Hittar ingen träff på ${hit.code}.`);
    if (hit.kind === 'location') {
      if (c.kind !== 'hotel')
        return this.say('warn', 'Hyllor används bara när du räknar däckhotellet.');
      if (hit.warehouseId !== c.warehouseId) {
        return this.say('err', `${hit.label} är inte i det här lagret.`);
      }
      if (c.locationId && hit.locationId !== c.locationId) {
        return this.say('err', `Den här inventeringen gäller bara ${c.scopeLabel}.`);
      }
      this.shelf.set({ id: hit.locationId, label: hit.label });
      this.scanner.beep(true);
      return this.say('ok', `Hylla ${hit.label}. Skanna setten som står här.`);
    }
    if (c.kind === 'hotel' && hit.kind === 'deposit') {
      const shelf = this.shelf();
      if (!shelf) return this.say('warn', 'Skanna hyllans etikett först.');
      return this.send(hit.id, { locationId: shelf.id }, `${hit.label} (${hit.code})`);
    }
    if (c.kind === 'articles' && hit.kind === 'article') {
      return this.send(hit.id, { delta: 1 }, hit.label);
    }
    const what = c.kind === 'hotel' ? 'ett hjulset (DH-nummer)' : 'en artikel';
    this.scanner.beep(false);
    this.say('warn', `Det där är inte ${what}.`);
  }

  private send(
    refId: string,
    body: { counted?: number; delta?: number; locationId?: string },
    label: string,
  ) {
    this.api.countLine(this.id, { refId, ...body }).subscribe({
      next: ({ line, count }) => {
        this.merge(line, count);
        this.touched.set(line.id);
        this.scanner.beep(true);
        const n = this.count()?.kind === 'articles' ? ` – räknat ${line.counted}` : '';
        const extra = line.added
          ? ' (inte på listan)'
          : line.moved
            ? ' (står på en annan hylla)'
            : '';
        this.say(line.added || line.moved ? 'warn' : 'ok', `${label}${n}${extra}`);
      },
      error: () => this.scanner.beep(false),
    });
  }

  setCount(l: StockCountLine, value: string) {
    if (value === '') return;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) return;
    this.send(l.id, { counted: n }, l.label);
  }

  clear(l: StockCountLine) {
    this.api.clearLine(this.id, l.id).subscribe((header) => {
      this.count.update((c) => {
        if (!c) return c;
        const lines = l.added
          ? c.lines.filter((x) => x.id !== l.id)
          : c.lines.map((x) =>
              x.id === l.id
                ? {
                    ...x,
                    counted: null,
                    foundPlace: null,
                    foundLocationId: null,
                    foundWarehouseId: null,
                    moved: false,
                  }
                : x,
            );
        return { ...c, ...header, lines };
      });
    });
  }

  post() {
    const c = this.count();
    if (!c) return;
    const s = c.summary;
    const text =
      c.kind === 'hotel'
        ? `${s.moved} set flyttas till den hylla de hittades på. Set som inte hittades ändras inte.`
        : `${s.differing} artiklar med skillnad justeras i lagret. ${
            this.zero()
              ? `${s.open} ej räknade sätts till 0.`
              : `${s.open} ej räknade lämnas som de är.`
          }`;
    this.confirm
      .ask({
        title: `Bokför ${c.code}?`,
        message: `${text} Det går inte att ångra.`,
        confirmText: 'Bokför',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.post(this.id, this.zero()).subscribe({
          next: (done) => {
            this.count.set(done);
            this.busy.set(false);
            this.say('ok', 'Bokförd.');
          },
          error: () => this.busy.set(false),
        });
      });
  }

  discard() {
    const c = this.count();
    if (!c) return;
    this.confirm
      .ask({
        title: 'Ta bort inventeringen?',
        message: 'Det du räknat hittills försvinner. Inget i lagret ändras.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe(
        (ok) =>
          ok &&
          this.api.remove(this.id).subscribe(() => this.router.navigateByUrl('/inventory/counts')),
      );
  }

  private merge(line: StockCountLine, header: StockCountHeader) {
    this.count.update((c) => {
      if (!c) return c;
      const exists = c.lines.some((x) => x.id === line.id);
      return {
        ...c,
        ...header,
        lines: exists ? c.lines.map((x) => (x.id === line.id ? line : x)) : [...c.lines, line],
      };
    });
  }

  private say(tone: Feedback['tone'], text: string) {
    this.feedback.set({ tone, text });
  }
}
