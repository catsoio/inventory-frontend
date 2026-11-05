import { Component, Input, computed, signal } from '@angular/core';
import { carStatus, workshopFacts, type Fact } from './workshop-facts';
import type { DetailGroup, DetailRow, DetailSection, VehicleDetails } from '../../../core/models';

interface ShownGroup extends DetailGroup {
  key: string;
  open: boolean;
}

interface ShownSection extends Omit<DetailSection, 'groups'> {
  key: string;
  open: boolean;
  count: number;
  groups: ShownGroup[];
}

/** Rad som matchar sökningen. Rubriker och kolumnrubriker följer med sina rader. */
const matches = (r: DetailRow, q: string): boolean =>
  r.label.toLowerCase().includes(q) || r.cells.some((c) => c.toLowerCase().includes(q));

/**
 * Allt källan visar om bilen, sorterat som tabeller: sektion, grupp, rad. Det viktiga ligger
 * öppet och resten ihopfällt; sökrutan öppnar det som träffas. En sektion eller grupp fälls ut
 * och ihop med ett klick, och alla på en gång med knapparna överst.
 */
@Component({
  selector: 'app-vehicle-details',
  standalone: false,
  template: `
    <details class="rounded-xl bg-white shadow-sm">
      <summary class="cursor-pointer px-5 py-4 text-lg font-semibold select-none">
        Alla fordonsuppgifter
      </summary>
      <div class="flex flex-col gap-4 px-4 pb-4">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 p-1">
          <span class="flex-1"></span>
          <input
            type="search"
            class="h-9 w-56 px-2 text-sm field"
            placeholder="Sök i uppgifterna"
            aria-label="Sök i fordonsuppgifterna"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
          <button mat-stroked-button type="button" (click)="setAll(true)">Fäll ut alla</button>
          <button mat-stroked-button type="button" (click)="setAll(false)">Fäll ihop alla</button>
        </div>
        @for (s of shown(); track s.key) {
          <section class="rounded-xl bg-white shadow-sm">
            <button
              type="button"
              class="flex w-full items-center gap-2 px-5 py-4 text-left"
              [attr.aria-expanded]="s.open"
              (click)="toggle(s.key, s.open)"
            >
              <mat-icon class="shrink-0 transition-transform" [class.-rotate-90]="!s.open"
                >expand_more</mat-icon
              >
              <span class="flex-1 font-semibold">{{ s.title }}</span>
              <span class="text-xs text-gray-500">{{ s.count }} rader</span>
            </button>
            @if (s.open) {
              <div
                class="grid gap-x-10 gap-y-4 px-5 pb-5 grid-flow-dense lg:grid-cols-2 xl:grid-cols-3"
              >
                @for (g of s.groups; track g.key) {
                  <div [class.lg:col-span-2]="wide(g)">
                    <button
                      type="button"
                      class="mb-1 flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left hover:bg-gray-50"
                      [attr.aria-expanded]="g.open"
                      (click)="toggle(g.key, g.open)"
                    >
                      <mat-icon class="shrink-0 transition-transform" [class.-rotate-90]="!g.open"
                        >expand_more</mat-icon
                      >
                      <span class="text-sm font-semibold">{{ g.title || 'Övrigt' }}</span>
                      <span class="ml-1 text-xs text-gray-400">{{ count(g) }}</span>
                    </button>
                    @if (g.open) {
                      @if (wide(g)) {
                        <div class="overflow-x-auto">
                          <table class="w-full text-sm">
                            <tbody>
                              @for (r of g.rows; track $index) {
                                @if (r.kind === 'heading') {
                                  <tr>
                                    <td
                                      [attr.colspan]="width(g)"
                                      class="px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase"
                                    >
                                      {{ r.label }}
                                    </td>
                                  </tr>
                                } @else if (r.kind === 'columns') {
                                  <tr class="border-b border-gray-200 text-xs text-gray-500">
                                    <td class="px-2 py-1.5 pr-6 font-semibold whitespace-nowrap">
                                      {{ r.label }}
                                    </td>
                                    @for (c of r.cells; track $index) {
                                      <td class="py-1.5 pr-6 font-semibold whitespace-nowrap">
                                        {{ c }}
                                      </td>
                                    }
                                  </tr>
                                } @else {
                                  <tr class="border-b border-gray-100 hover:bg-gray-50">
                                    <td class="px-2 py-1.5 pr-6 align-top font-medium">
                                      {{ r.label }}
                                    </td>
                                    @for (c of r.cells; track $index) {
                                      <td
                                        class="py-1.5 pr-6 align-top text-gray-700 tabular-nums"
                                        [class.whitespace-nowrap]="!$last"
                                      >
                                        {{ c }}
                                      </td>
                                    }
                                  </tr>
                                }
                              }
                            </tbody>
                          </table>
                        </div>
                      } @else {
                        <dl>
                          @for (r of g.rows; track $index) {
                            @if (r.kind === 'heading') {
                              <div
                                class="px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase"
                              >
                                {{ r.label }}
                              </div>
                            } @else {
                              <div
                                class="flex items-baseline justify-between gap-4 rounded-lg px-2 py-1.5 hover:bg-gray-50"
                                [style.padding-left.rem]="0.5 + (r.level ?? 0)"
                              >
                                <dt class="text-sm text-gray-500">{{ r.label }}</dt>
                                <dd class="text-right font-medium">{{ r.cells[0] }}</dd>
                              </div>
                            }
                          }
                        </dl>
                      }
                    }
                  </div>
                }
              </div>
            }
          </section>
        } @empty {
          <p class="rounded-xl bg-white p-5 text-sm text-gray-500 shadow-sm">
            @if (query()) {
              Inget i uppgifterna matchar "{{ query() }}".
            } @else {
              Inga uppgifter än. Tryck på Uppdatera från registret för att hämta dem.
            }
          </p>
        }
      </div>
    </details>
  `,
})
export class VehicleDetailsView {
  private readonly source = signal<VehicleDetails | null>(null);

  @Input({ required: true }) set details(v: VehicleDetails | null | undefined) {
    this.source.set(v ?? null);
  }

  readonly query = signal('');
  /** Det man själv fällt ut eller ihop; allt annat följer vad som är viktigt. */
  private readonly manual = signal<ReadonlyMap<string, boolean>>(new Map());
  /** Fäll ut/ihop alla gäller tills man klickar på en enskild rad. */
  private readonly all = signal<boolean | null>(null);

  readonly shown = computed<ShownSection[]>(() => {
    const q = this.query().trim().toLowerCase();
    const manual = this.manual();
    const all = this.all();
    const state = (key: string, important: boolean, searching: boolean) =>
      searching ? true : (manual.get(key) ?? all ?? important);
    const out: ShownSection[] = [];
    for (const s of this.source()?.sections ?? []) {
      const groups: ShownGroup[] = [];
      for (const g of s.groups) {
        const rows = q ? g.rows.filter((r) => !r.kind && matches(r, q)) : g.rows;
        if (!rows.length) continue;
        const key = `${s.title}/${g.title}`;
        groups.push({
          ...g,
          rows: q ? withHeaders(g.rows, rows) : rows,
          key,
          open: state(key, g.important, !!q),
        });
      }
      if (!groups.length) continue;
      out.push({
        ...s,
        key: s.title,
        open: state(s.title, s.important, !!q),
        count: groups.reduce((n, g) => n + g.rows.filter((r) => !r.kind).length, 0),
        groups,
      });
    }
    return out;
  });

  toggle(key: string, open: boolean) {
    this.manual.update((m) => new Map(m).set(key, !open));
  }

  setAll(open: boolean) {
    this.manual.set(new Map());
    this.all.set(open);
  }

  /** Antal kolumner i en grupp: etikett plus det flesta värden på någon rad. */
  width(g: DetailGroup): number {
    return 1 + Math.max(1, ...g.rows.map((r) => r.cells.length));
  }

  /** Antal faktiska rader, utan rubriker. */
  count(g: DetailGroup): number {
    return g.rows.filter((r) => !r.kind).length;
  }

  /** Tabeller med flera kolumner får hela raden. */
  wide(g: DetailGroup): boolean {
    return this.width(g) > 2;
  }
}

/** Träffarna med kolumnrubriken (och underrubriken) som hör till dem, i ursprunglig ordning. */
function withHeaders(all: DetailRow[], hits: DetailRow[]): DetailRow[] {
  const out: DetailRow[] = [];
  let heading: DetailRow | null = null;
  let columns: DetailRow | null = null;
  for (const r of all) {
    if (r.kind === 'heading') {
      heading = r;
      columns = null;
    } else if (r.kind === 'columns') {
      columns = r;
    } else if (hits.includes(r)) {
      if (heading && !out.includes(heading)) out.push(heading);
      if (columns && !out.includes(columns)) out.push(columns);
      out.push(r);
    }
  }
  return out;
}

/** Det en verkstad letar efter först, bredvid bilens formulär. */
@Component({
  selector: 'app-vehicle-overview',
  standalone: false,
  template: `
    <section class="h-full rounded-xl bg-white p-5 shadow-sm">
      <h2 class="mb-3 text-lg font-semibold">Verkstadsöversikt</h2>
      <div class="grid gap-x-8 gap-y-4 md:grid-cols-2">
        @for (g of facts(); track g.title) {
          <div>
            <h3 class="mb-1 px-2 text-sm font-semibold">{{ g.title }}</h3>
            <dl>
              @for (f of g.facts; track f.label) {
                <div
                  class="flex items-baseline justify-between gap-4 rounded-lg px-2 py-1.5 hover:bg-gray-50"
                >
                  <dt class="text-sm text-gray-500">{{ f.label }}</dt>
                  <dd class="text-right font-medium">{{ f.value }}</dd>
                </div>
              }
            </dl>
          </div>
        } @empty {
          <p class="text-sm text-gray-500">Inga uppgifter än.</p>
        }
      </div>
    </section>
  `,
})
export class VehicleOverview {
  private readonly source = signal<VehicleDetails | null>(null);

  @Input({ required: true }) set details(v: VehicleDetails | null | undefined) {
    this.source.set(v ?? null);
  }

  readonly facts = computed(() => workshopFacts(this.source()));
}

/** Bilens läge just nu (besiktning, mätarställning, skatt), under formuläret. */
@Component({
  selector: 'app-vehicle-status',
  standalone: false,
  template: `
    <section class="h-full rounded-xl bg-white p-5 shadow-sm">
      <h2 class="mb-3 text-lg font-semibold">Just nu</h2>
      <div class="flex flex-col gap-4">
        @for (g of groups(); track g.title) {
          <div>
            <h3 class="mb-1 px-2 text-sm font-semibold">{{ g.title }}</h3>
            <dl>
              @for (f of g.facts; track f.label) {
                <div
                  class="flex items-baseline justify-between gap-4 rounded-lg px-2 py-1.5 hover:bg-gray-50"
                >
                  <dt class="text-sm text-gray-500">{{ f.label }}</dt>
                  <dd class="text-right font-medium" [class.text-red-700]="tone(f) === 'bad'">
                    {{ f.value }}
                  </dd>
                </div>
              }
            </dl>
          </div>
        } @empty {
          <p class="text-sm text-gray-500">Inga uppgifter än.</p>
        }
      </div>
    </section>
  `,
})
export class VehicleStatus {
  private readonly source = signal<VehicleDetails | null>(null);

  @Input({ required: true }) set details(v: VehicleDetails | null | undefined) {
    this.source.set(v ?? null);
  }

  readonly groups = computed(() =>
    carStatus(this.source(), new Date().toLocaleDateString('sv-SE')),
  );

  tone(f: Fact) {
    return f.tone;
  }
}
