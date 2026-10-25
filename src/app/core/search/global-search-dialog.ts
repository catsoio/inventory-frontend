import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { openBooking } from '../../shared/booking-dialog/open-booking';
import { SharedModule } from '../../shared/shared-module';
import { InventoryApi } from '../api/inventory-api';
import { SalesCardApi } from '../api/sales-card-api';
import { StorageApi } from '../api/storage-api';
import { WorkOrderApi } from '../api/work-order-api';
import { WorkshopApi } from '../api/workshop-api';
import { environment } from '../../../environments/environment';
import {
  Hit,
  HitKind,
  KIND_ICONS,
  KIND_LABELS,
  articleHit,
  customerHit,
  groupOrder,
  normalize,
  orderHit,
  saleHit,
  storageHit,
  supplierHit,
  vehicleHit,
} from './search-hits';

interface Group {
  kind: HitKind;
  label: string;
  hits: Hit[];
}

const RECENT_KEY = 'garagestock.recentSearches';
const PER_GROUP = 5;

/**
 * Sök allt på en gång: ett regnr ger däckhotellets hylla, bilen, ordrar och köp; ett namn eller
 * telefonnummer ger kunden; en storlek ger lagret. Tomt fält visar genvägar till det man gör
 * oftast och det man sökte senast.
 */
@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [SharedModule],
  host: { class: 'flex max-h-[80dvh] min-h-0 flex-col max-md:h-full max-md:max-h-none' },
  template: `
    <div class="flex shrink-0 items-center gap-1 border-b border-gray-100 px-3 py-2 md:px-4">
      <mat-icon class="text-gray-400">search</mat-icon>
      <input
        type="search"
        [formControl]="q"
        (keydown.arrowdown)="move(1, $event)"
        (keydown.arrowup)="move(-1, $event)"
        (keydown.enter)="openActive($event)"
        [placeholder]="placeholder"
        aria-label="Sök"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="search"
        class="h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      @if (loading()) {
        <mat-icon class="animate-spin text-gray-300">progress_activity</mat-icon>
      } @else if (q.value) {
        <button
          type="button"
          class="grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100"
          aria-label="Rensa"
          (click)="q.setValue('')"
        >
          <mat-icon class="!h-5 !w-5 !text-xl !leading-5">close</mat-icon>
        </button>
      }
      <button
        type="button"
        class="rounded-lg px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
        (click)="ref.close()"
      >
        <span class="md:hidden">Stäng</span>
        <kbd class="hidden rounded border border-gray-200 px-1.5 py-0.5 text-xs md:inline">Esc</kbd>
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-2" role="listbox" aria-label="Träffar">
      @if (!term()) {
        <div class="px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
          Genvägar
        </div>
        <div class="grid grid-cols-2 gap-2 p-1 md:grid-cols-4">
          @for (a of actions; track a.label) {
            <button
              type="button"
              class="flex min-h-14 items-center gap-3 rounded-xl bg-white px-3 text-left text-sm font-medium shadow-sm ring-1 ring-black/5 hover:bg-gray-50 active:bg-gray-100"
              (click)="run(a)"
            >
              <span
                class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white shadow-sm"
              >
                <mat-icon class="!text-xl text-brand">{{ a.icon }}</mat-icon>
              </span>
              {{ a.label }}
            </button>
          }
        </div>
        @if (recent().length) {
          <div
            class="px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-gray-500 uppercase"
          >
            Senast sökt
          </div>
          @for (r of recent(); track r) {
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-gray-50"
              (click)="q.setValue(r)"
            >
              <mat-icon class="!text-xl text-gray-400">history</mat-icon>{{ r }}
            </button>
          }
        }
      } @else if (term().length < 2) {
        <p class="px-3 py-6 text-center text-sm text-gray-500">Skriv minst två tecken.</p>
      } @else if (!groups().length && !loading()) {
        <p class="px-3 py-8 text-center text-sm text-gray-500">
          Inget hittades för <b class="text-gray-700">{{ term() }}</b
          >.<br />Sök på regnr, namn, telefonnummer, däckstorlek eller nummer som DH-0042.
        </p>
      } @else {
        @for (g of groups(); track g.kind) {
          <div
            class="flex items-center gap-2 px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-gray-500 uppercase"
          >
            <mat-icon class="!h-4 !w-4 !text-base !leading-4 text-gray-400">{{
              icons[g.kind]
            }}</mat-icon>
            {{ g.label }}
          </div>
          @for (h of g.hits; track h.id) {
            <!-- Dator: en rad (skylt, text, status). Mobil: skylt och status överst, texten under. -->
            <a
              [routerLink]="h.link"
              role="option"
              [attr.aria-selected]="isActive(h)"
              class="grid min-h-12 items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 hover:bg-gray-50 md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:grid-cols-[minmax(0,1fr)_auto]"
              [class.bg-brand-soft]="isActive(h)"
              (click)="chosen()"
              (mouseenter)="active.set(indexOf(h))"
            >
              @if (h.plate) {
                <app-reg-plate [value]="h.plate" size="sm" class="justify-self-start" />
              } @else {
                <span class="flex min-w-0 items-center gap-3">
                  <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100">
                    <mat-icon class="!h-5 !w-5 !text-xl !leading-5 text-gray-500">{{
                      icons[h.kind]
                    }}</mat-icon>
                  </span>
                  <span class="truncate text-sm font-medium">{{ h.title }}</span>
                </span>
              }
              <span
                class="min-w-0 truncate text-sm text-gray-600 max-md:order-last max-md:col-span-2"
                >{{ h.sub }}</span
              >
              @if (h.side) {
                <span
                  class="max-w-[16rem] truncate justify-self-end rounded-full px-2.5 py-0.5 text-xs font-medium max-md:max-w-[14rem]"
                  [class]="tones[h.tone ?? 'gray']"
                  >{{ h.side }}</span
                >
              } @else {
                <span></span>
              }
            </a>
          }
        }
      }
    </div>
  `,
})
export class GlobalSearchDialog {
  readonly ref = inject<MatDialogRef<GlobalSearchDialog>>(MatDialogRef);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly storage = inject(StorageApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly orders = inject(WorkOrderApi);
  private readonly cards = inject(SalesCardApi);
  private readonly inventory = inject(InventoryApi);

  readonly icons = KIND_ICONS;
  readonly placeholder =
    window.innerWidth >= 768
      ? 'Sök regnr, kund, telefon, plats eller storlek…'
      : 'Sök regnr, kund, plats…';
  readonly tones = {
    gray: 'bg-gray-100 text-gray-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
    green: 'bg-green-100 text-green-800',
  };

  readonly q = new FormControl('', { nonNullable: true });
  readonly term = signal('');
  readonly loading = signal(false);
  readonly groups = signal<Group[]>([]);
  readonly active = signal(0);
  readonly recent = signal<string[]>(this.loadRecent());
  private readonly flat = computed(() => this.groups().flatMap((g) => g.hits));

  readonly actions = [
    { label: 'Ny inlämning', icon: 'warehouse', go: ['/storage', 'new'] },
    { label: 'Ny bokning', icon: 'event', go: null },
    { label: 'Nytt säljkort', icon: 'point_of_sale', go: ['/sales', 'new'] },
    { label: 'Ny kund', icon: 'person_add', go: ['/customers', 'new'] },
  ];

  constructor() {
    this.q.valueChanges
      .pipe(
        tap((v) => {
          this.term.set(v.trim());
          this.loading.set(v.trim().length >= 2);
        }),
        debounceTime(180),
        map((v) => normalize(v)),
        distinctUntilChanged(),
        switchMap((t) => (t.length < 2 ? of([] as Group[]) : this.search(t))),
        takeUntilDestroyed(),
      )
      .subscribe((g) => {
        this.groups.set(g);
        this.active.set(0);
        this.loading.set(false);
      });
  }

  private search(q: string): Observable<Group[]> {
    const quiet = <T>(o: Observable<{ items: T[] }>, f: (x: T) => Hit): Observable<Hit[]> =>
      o.pipe(
        map((p) => p.items.slice(0, PER_GROUP).map(f)),
        catchError(() => of([] as Hit[])),
      );
    const limit = PER_GROUP;
    const sources: Record<HitKind, Observable<Hit[]>> = {
      storage: quiet(this.storage.deposits({ q, limit }), storageHit),
      vehicle: quiet(this.workshop.vehicles({ q, limit }), vehicleHit),
      customer: quiet(this.workshop.customers({ q, limit }), customerHit),
      order: environment.workOrders ? quiet(this.orders.list({ q, limit }), orderHit) : of([]),
      sale: quiet(this.cards.list({ q, limit }), saleHit),
      article: quiet(this.inventory.articles({ q, limit }), articleHit),
      supplier: quiet(this.workshop.suppliers({ q, limit }), supplierHit),
    };
    const order = groupOrder(q);
    return forkJoin(order.map((k) => sources[k])).pipe(
      map((lists) =>
        lists
          .map((hits, i): Group => ({ kind: order[i], label: KIND_LABELS[order[i]], hits }))
          .filter((g) => g.hits.length),
      ),
    );
  }

  indexOf(h: Hit): number {
    return this.flat().indexOf(h);
  }

  isActive(h: Hit): boolean {
    return this.flat()[this.active()] === h;
  }

  move(step: number, e: Event) {
    e.preventDefault();
    const n = this.flat().length;
    if (n) this.active.set((this.active() + step + n) % n);
  }

  openActive(e: Event) {
    e.preventDefault();
    const h = this.flat()[this.active()];
    if (!h) return;
    this.chosen();
    void this.router.navigate(h.link);
  }

  /** En träff är vald (klick eller Enter): kom ihåg sökningen och stäng. */
  chosen() {
    this.remember(this.term());
    this.ref.close();
  }

  run(a: { go: string[] | null }) {
    this.ref.close();
    if (a.go) void this.router.navigate(a.go);
    else openBooking(this.dialog, null).subscribe();
  }

  private loadRecent(): string[] {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  private remember(term: string) {
    if (term.length < 2) return;
    const next = [
      term,
      ...this.recent().filter((r) => r.toLowerCase() !== term.toLowerCase()),
    ].slice(0, 5);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* sparas bara som bekvämlighet */
    }
  }
}
