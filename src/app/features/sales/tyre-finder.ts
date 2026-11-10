import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { AxleApi } from '../../core/api/axle-api';
import { SupplierCatalogApi } from '../../core/api/supplier-catalog-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import { Article, CatalogHit, Season, Vehicle, VehicleInfo } from '../../core/models';
import { FitSize, fittingSizes } from '../../core/tyre-fit';

export interface TyreFinderData {
  /** Bilen på kortet, om det finns en. Annars skriver man regnumret i dialogen. */
  vehicle: Vehicle | null;
  /** Lägger däcken på säljkortet. Dialogen står kvar så man kan lägga till bak också. */
  add: (article: Article, quantity: number) => void;
  /** Säger till kortet vilket regnummer som slagits upp, så att det också skrivs där. */
  setVehicle?: (regNo: string, existing: Vehicle | null) => void;
}

const SEASON_LABEL: Record<Season, string> = {
  summer: 'Sommar',
  winter: 'Vinter',
  all_season: 'Helår',
};

/** Det som söks: hela eller delar av en dimension, och eventuellt märke eller modell. */
interface Query {
  width?: number;
  profile?: number;
  diameter?: number;
  words: string;
}

const num = (v: string): number | undefined => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Däck till bilen på säljkortet. Regnumret slås upp i fordonsregistret och ger bilens däckmått,
 * så visas däck som passar: i lagret med pris och antal, och hos grossisten när Gummigrossen är
 * ansluten. Bredd, profil, tum, märke och modell kan fyllas i var för sig, som på nya artikeln.
 */
@Component({
  selector: 'app-tyre-finder',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Däck till bilen</h2>
    <mat-dialog-content class="!flex flex-col gap-5 !pt-2">
      <div class="flex flex-wrap items-center gap-3">
        <input
          class="h-10 w-40 px-3 text-base font-medium uppercase field"
          placeholder="Regnummer"
          aria-label="Regnummer"
          autocomplete="off"
          [value]="regNo()"
          (input)="regNo.set($any($event.target).value)"
          (keydown.enter)="lookup()"
        />
        <button
          mat-stroked-button
          type="button"
          [disabled]="lookingUp() || !regNo().trim()"
          (click)="lookup()"
        >
          <mat-icon>search</mat-icon> Hämta bilen
        </button>
        @if (carText()) {
          <span class="text-sm text-gray-700">{{ carText() }}</span>
        }
        @if (lookingUp()) {
          <span class="text-sm text-gray-500">Hämtar…</span>
        } @else if (status() === 'not_found') {
          <span class="text-sm text-amber-700">Regnumret finns inte i registret.</span>
        } @else if (status() === 'unavailable') {
          <span class="text-sm text-amber-700">Registret svarar inte just nu.</span>
        }
      </div>

      @if (sizes().length) {
        <div>
          <div class="mb-1 text-xs font-medium tracking-wide text-gray-500 uppercase">
            Rekommenderat för bilen
          </div>
          <mat-button-toggle-group
            aria-label="Däckstorlek för bilen"
            [value]="manual() ? null : selectedLabel()"
            (change)="pick($event.value)"
          >
            @for (s of sizes(); track s.label) {
              <mat-button-toggle [value]="s.label">
                {{ s.label }}
                @if (s.where !== 'all') {
                  <span class="ml-1 text-xs text-gray-500">{{
                    s.where === 'front' ? 'fram' : 'bak'
                  }}</span>
                }
              </mat-button-toggle>
            }
          </mat-button-toggle-group>
        </div>
      } @else if (!lookingUp() && status() !== 'idle') {
        <p class="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
          Registret har inga däckmått för bilen. Fyll i dem nedan.
        </p>
      }

      <div class="flex flex-wrap items-center gap-2">
        <input
          class="h-10 w-24 px-3 field"
          inputmode="numeric"
          placeholder="Bredd"
          aria-label="Bredd"
          [value]="width()"
          (input)="setDim(width, $event)"
        />
        <span class="text-gray-400">/</span>
        <input
          class="h-10 w-20 px-3 field"
          inputmode="numeric"
          placeholder="Profil"
          aria-label="Profil"
          [value]="profile()"
          (input)="setDim(profile, $event)"
        />
        <span class="text-gray-400">R</span>
        <input
          class="h-10 w-20 px-3 field"
          inputmode="numeric"
          placeholder="Tum"
          aria-label="Tum"
          [value]="rim()"
          (input)="setDim(rim, $event)"
        />
        <input
          class="h-10 min-w-40 flex-1 px-3 field"
          placeholder="Märke eller modell"
          aria-label="Märke eller modell"
          [value]="words()"
          (input)="words.set($any($event.target).value)"
        />
        <mat-button-toggle-group
          aria-label="Säsong"
          [value]="season()"
          (change)="season.set($event.value)"
        >
          <mat-button-toggle value="all">Alla</mat-button-toggle>
          <mat-button-toggle value="summer">Sommar</mat-button-toggle>
          <mat-button-toggle value="winter">Vinter</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      @if (query(); as q) {
        <section>
          <div class="mb-2 flex items-center justify-between gap-3">
            <h3 class="text-base font-semibold">I lager{{ title() }}</h3>
            <mat-checkbox [checked]="soldOut()" (change)="soldOut.set($event.checked)">
              Visa även slut
            </mat-checkbox>
          </div>
          @if (loadingOwn()) {
            <mat-progress-bar mode="indeterminate" />
          }
          @for (a of own(); track a.id) {
            <div class="flex flex-wrap items-center gap-3 border-b py-2 last:border-b-0">
              <div class="min-w-48 flex-1">
                <div class="font-medium">
                  <span class="tabular-nums">{{ a.sizeLabel }}</span> · {{ a.brand }} {{ a.model }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ seasonOf(a) }}
                  @if (a.tyre?.studded) {
                    · dubb
                  }
                  @if (a.tyre?.loadIndex) {
                    · {{ a.tyre?.loadIndex }}{{ a.tyre?.speedIndex }}
                  }
                  @if (a.location) {
                    · {{ a.location }}
                  }
                </div>
              </div>
              <div class="w-20 text-right text-sm" [class.text-red-700]="a.quantity <= 0">
                {{ a.quantity }} st
              </div>
              <div class="w-24 text-right font-medium">{{ a.sellPrice | kr }}</div>
              <input
                type="number"
                min="1"
                max="99"
                class="h-9 w-16 px-2 text-center field"
                [attr.aria-label]="'Antal ' + a.brand"
                [value]="qty(a.id)"
                (input)="setQty(a.id, $any($event.target).value)"
              />
              <button mat-flat-button color="primary" type="button" (click)="addOwn(a)">
                {{ addedOf(a.id) ? 'Lägg till fler' : 'Lägg på kortet' }}
              </button>
            </div>
          } @empty {
            @if (!loadingOwn()) {
              <p class="text-sm text-gray-600">
                Inga däck {{ soldOut() ? 'i artikelregistret' : 'i lager' }} som matchar.
              </p>
            }
          }
        </section>

        @if (supplierOn()) {
          <section>
            <h3 class="mb-2 text-base font-semibold">Hos Gummigrossen{{ title() }}</h3>
            @if (loadingHits()) {
              <mat-progress-bar mode="indeterminate" />
            }
            @for (h of hits(); track h.sourceId) {
              <div class="flex flex-wrap items-center gap-3 border-b py-2 last:border-b-0">
                <div class="min-w-48 flex-1">
                  <div class="font-medium">
                    @if (h.tyre) {
                      <span class="tabular-nums"
                        >{{ h.tyre.width }}/{{ h.tyre.profile }} R{{ h.tyre.rimDiameter }}</span
                      >
                      ·
                    }
                    {{ h.brand }} {{ h.model }}
                  </div>
                  <div class="text-xs text-gray-500">
                    {{ h.tyre ? seasonName(h.tyre.season) : '' }}
                    @if (h.tyre?.studded) {
                      · dubb
                    }
                    @if (h.tyre?.loadIndex) {
                      · {{ h.tyre?.loadIndex }}{{ h.tyre?.speedIndex }}
                    }
                    @if (h.articleId) {
                      · finns i ert register
                    }
                  </div>
                </div>
                @if (h.fromCatalog) {
                  <!-- Från vår egen däckkatalog: lager och pris hämtas live när däcket väljs. -->
                  <div class="w-56 text-right text-xs text-gray-500">
                    Lager och pris hämtas när du lägger på kortet
                  </div>
                } @else {
                  <div class="w-28 text-right text-sm" [class.text-red-700]="h.available <= 0">
                    {{ h.available > 0 ? h.available + ' hos grossist' : 'slut hos grossist' }}
                  </div>
                  <div class="w-28 text-right text-sm text-gray-600">
                    @if (h.retailInclVat) {
                      Rek. {{ h.retailInclVat | kr }}
                    }
                  </div>
                }
                <input
                  type="number"
                  min="1"
                  max="99"
                  class="h-9 w-16 px-2 text-center field"
                  [attr.aria-label]="'Antal ' + h.brand"
                  [value]="qty(h.sourceId)"
                  (input)="setQty(h.sourceId, $any($event.target).value)"
                />
                <button
                  mat-stroked-button
                  type="button"
                  [disabled]="busy().has(h.sourceId)"
                  (click)="addHit(h)"
                >
                  {{ addedOf(h.sourceId) ? 'Lägg till fler' : 'Lägg på kortet' }}
                </button>
              </div>
            } @empty {
              @if (!loadingHits()) {
                <p class="text-sm text-gray-600">Grossisten visar inga däck som matchar.</p>
              }
            }
            <p class="mt-2 text-xs text-gray-500">
              Däck som inte finns i lager läggs på kortet med en varning. Beställ dem under Inköp,
              så försvinner varningen när de är mottagna.
            </p>
          </section>
        }
      } @else {
        <p class="text-sm text-gray-600">
          Skriv regnumret för att få däck som passar bilen, eller fyll i en storlek eller ett märke.
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" type="button" mat-dialog-close>Klar</button>
    </mat-dialog-actions>
  `,
})
export class TyreFinderDialog {
  protected readonly data = inject<TyreFinderData>(MAT_DIALOG_DATA);
  private readonly inventory = inject(AxleApi);
  private readonly supplier = inject(SupplierCatalogApi);
  private readonly workshop = inject(WorkshopApi);

  protected readonly regNo = signal(this.data.vehicle?.regNo ?? '');
  /** Bilens uppgifter: den på kortet, eller det som registret gav för regnumret. */
  private readonly car = signal<Pick<VehicleInfo, 'make' | 'model' | 'year'> | null>(
    this.data.vehicle,
  );
  protected readonly status = signal<'idle' | 'found' | 'not_found' | 'unavailable'>('idle');
  protected readonly lookingUp = signal(false);
  protected readonly sizes = signal<FitSize[]>(fittingSizes(this.data.vehicle));
  protected readonly selectedLabel = signal<string | null>(this.sizes()[0]?.label ?? null);

  // Fälten är själva sökningen, som på nya artikeln: bredd, profil, tum, märke och säsong.
  protected readonly width = signal('');
  protected readonly profile = signal('');
  protected readonly rim = signal('');
  protected readonly words = signal('');
  protected readonly season = signal<Season | 'all'>('all');
  protected readonly soldOut = signal(false);

  protected readonly own = signal<Article[]>([]);
  protected readonly loadingOwn = signal(false);
  protected readonly hits = signal<CatalogHit[]>([]);
  protected readonly loadingHits = signal(false);
  protected readonly supplierOn = signal(false);
  protected readonly busy = signal<Set<string>>(new Set());
  private readonly qtys = signal<Record<string, number>>({});
  private readonly added = signal<Set<string>>(new Set());
  private ownRun = 0;
  private hitsRun = 0;

  protected readonly carText = computed(() => {
    const c = this.car();
    return c ? [c.make, c.model, c.year].filter(Boolean).join(' ') : '';
  });

  /** Är något skrivet för hand, gäller det före bilens storlek. */
  protected readonly manual = computed(
    () => !!(num(this.width()) || num(this.profile()) || num(this.rim())),
  );

  protected readonly seasonFilter = computed<Season | null>(() =>
    this.season() === 'all' ? null : (this.season() as Season),
  );

  /** Antal däck som föreslås: fyra, eller två när bilen har olika storlek fram och bak. */
  private readonly suggestedQty = computed(
    () => this.sizes().find((s) => s.label === this.selectedLabel())?.quantity ?? 4,
  );

  protected readonly query = computed<Query | null>(() => {
    const words = this.words().trim();
    if (this.manual()) {
      return {
        width: num(this.width()),
        profile: num(this.profile()),
        diameter: num(this.rim()),
        words,
      };
    }
    const s = this.sizes().find((x) => x.label === this.selectedLabel());
    if (s) return { width: s.width, profile: s.profile, diameter: s.diameter, words };
    return words.length >= 2 ? { words } : null;
  });

  protected readonly title = computed(() => {
    const q = this.query();
    if (!q) return '';
    const size = [
      q.width ? String(q.width) : '',
      q.profile ? `/${q.profile}` : '',
      q.diameter ? ` R${q.diameter}` : '',
    ].join('');
    return [size.trim(), q.words].filter(Boolean).length
      ? ' · ' + [size.trim(), q.words].filter(Boolean).join(' ')
      : '';
  });

  constructor() {
    this.supplier.status().subscribe({
      next: (s) => this.supplierOn.set(s.connected),
      error: () => this.supplierOn.set(false),
    });
    // Har kortet en bil utan däckmått, eller bara ett regnummer är känt, frågar vi registret.
    if (!this.sizes().length && this.regNo().trim()) this.lookup();
    effect(() => {
      const q = this.query();
      const season = this.seasonFilter();
      const soldOut = this.soldOut();
      untracked(() => this.loadOwn(q, season, soldOut));
    });
    // Grossisten frågas först när anslutningen är känd.
    effect(() => {
      this.supplierOn();
      const q = this.query();
      const season = this.seasonFilter();
      untracked(() => this.loadHits(q, season));
    });
  }

  /**
   * Letar först i vår egen databas: finns bilen där (med kund) sätts den på kortet direkt, och
   * har den däckmått används de. Först när bilen saknas eller saknar mått frågas fordonsregistret.
   */
  protected lookup() {
    const reg = this.regNo().trim().toUpperCase().replace(/\s+/g, '');
    if (!reg) return;
    this.regNo.set(reg);
    this.lookingUp.set(true);
    const fail = () => {
      this.lookingUp.set(false);
      this.status.set('unavailable');
    };
    const useSizes = (v: Parameters<typeof fittingSizes>[0]) => {
      const sizes = fittingSizes(v);
      this.sizes.set(sizes);
      this.selectedLabel.set(sizes[0]?.label ?? null);
      this.clearManual();
      return sizes.length > 0;
    };
    const registry = (own: Vehicle | null) =>
      this.workshop.lookupVehicle(reg).subscribe({
        next: (r) => {
          this.lookingUp.set(false);
          this.status.set(r.status);
          if (!own) this.car.set(r.info);
          useSizes(r.info);
        },
        error: fail,
      });
    this.workshop.vehicles({ q: reg, limit: 5 }).subscribe({
      next: (p) => {
        const own = p.items.find((v) => v.regNo === reg) ?? null;
        this.data.setVehicle?.(reg, own);
        if (own) {
          this.car.set(own);
          if (useSizes(own)) {
            this.lookingUp.set(false);
            this.status.set('found');
            return;
          }
        }
        registry(own);
      },
      error: () => registry(null),
    });
  }

  protected pick(label: string | null) {
    if (!label) return;
    this.clearManual();
    this.selectedLabel.set(label);
  }

  private clearManual() {
    this.width.set('');
    this.profile.set('');
    this.rim.set('');
  }

  protected setDim(target: { set: (v: string) => void }, e: Event) {
    target.set((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 3));
  }

  protected seasonOf = (a: Article) => (a.tyre ? SEASON_LABEL[a.tyre.season] : '');
  protected seasonName = (s: Season) => SEASON_LABEL[s];
  protected addedOf = (key: string) => this.added().has(key);

  protected qty(key: string): number {
    return this.qtys()[key] ?? this.suggestedQty();
  }

  protected setQty(key: string, raw: string) {
    const n = Math.max(1, Math.min(99, Math.floor(Number(raw)) || 1));
    this.qtys.update((q) => ({ ...q, [key]: n }));
  }

  protected addOwn(a: Article) {
    this.data.add(a, this.qty(a.id));
    this.added.update((s) => new Set(s).add(a.id));
  }

  protected addHit(h: CatalogHit) {
    const finish = () =>
      this.busy.update((s) => {
        const n = new Set(s);
        n.delete(h.sourceId);
        return n;
      });
    const done = (article: Article) => {
      this.data.add(article, this.qty(h.sourceId));
      this.added.update((s) => new Set(s).add(h.sourceId));
      finish();
    };
    this.busy.update((s) => new Set(s).add(h.sourceId));
    // Har verkstaden artikeln används den; annars skapas den ur katalogen (som enstaka del).
    if (h.articleId) this.inventory.article(h.articleId).subscribe({ next: done, error: finish });
    else this.supplier.adopt(h.sourceId).subscribe({ next: (r) => done(r.article), error: finish });
  }

  private loadOwn(q: Query | null, season: Season | null, soldOut: boolean) {
    const run = ++this.ownRun;
    if (!q) {
      this.own.set([]);
      this.loadingOwn.set(false);
      return;
    }
    this.loadingOwn.set(true);
    this.inventory
      .articles({
        category: 'tyre',
        width: q.width,
        profile: q.profile,
        rimDiameter: q.diameter,
        q: q.words || undefined,
        season: season ?? undefined,
        inStock: soldOut ? undefined : true,
        limit: 40,
      })
      .subscribe({
        next: (p) => {
          if (run !== this.ownRun) return;
          this.own.set(p.items);
          this.loadingOwn.set(false);
        },
        error: () => run === this.ownRun && this.loadingOwn.set(false),
      });
  }

  private loadHits(q: Query | null, season: Season | null) {
    const run = ++this.hitsRun;
    if (!q || !this.supplierOn()) {
      this.hits.set([]);
      this.loadingHits.set(false);
      return;
    }
    this.loadingHits.set(true);
    // Som på nya artikeln: det som är ifyllt av måttet räcker, och säsongen är ett ord i sökningen.
    const size = [
      q.width ? String(q.width) : '',
      q.width && q.profile ? `/${q.profile}` : '',
      q.diameter ? ` R${q.diameter}` : '',
    ].join('');
    const word = season === 'summer' ? 'sommar' : season === 'winter' ? 'vinter' : '';
    const text = [size.trim(), word, q.words].filter(Boolean).join(' ');
    this.supplier.search(text).subscribe({
      next: (list) => {
        if (run !== this.hitsRun) return;
        const tyres = list.filter((h) => h.kind === 'tyre');
        tyres.sort(
          (a, b) => Number(b.available > 0) - Number(a.available > 0) || a.costExVat - b.costExVat,
        );
        this.hits.set(tyres.slice(0, 12));
        this.loadingHits.set(false);
      },
      error: () => {
        if (run !== this.hitsRun) return;
        this.hits.set([]);
        this.loadingHits.set(false);
      },
    });
  }
}
