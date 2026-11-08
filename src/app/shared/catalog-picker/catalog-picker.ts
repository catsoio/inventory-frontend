import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { SupplierCatalogApi } from '../../core/api/supplier-catalog-api';
import { CatalogHit, SEASON_LABELS } from '../../core/models';
import { Pricing } from '../../core/pricing';

/**
 * En träff i grossistens katalog som en rad: vad det är, om verkstaden redan har artikeln, vad den
 * kostar (inkl. moms, som på fakturan) och vad som finns i lager hos grossisten.
 */
@Component({
  selector: 'app-catalog-hit',
  standalone: false,
  host: { class: 'block' },
  template: `
    <span class="flex min-w-0 items-center gap-3 md:flex-1">
      <app-item-icon [kind]="hit.kind === 'tyre' ? 'tyre' : hit.kind === 'rim' ? 'rim' : 'other'" />
      <span class="min-w-0">
        <span class="block font-medium break-words md:truncate">{{ title() }}</span>
        <span class="block text-sm break-words text-gray-500 md:truncate">{{ detail() }}</span>
      </span>
    </span>
    <span class="hidden shrink-0 flex-col items-end text-sm md:flex">
      <span class="font-medium tabular-nums">
        {{ hit.costFinal ? '' : 'ca ' }}{{ pricing.costIncl(hit.costExVat) | kr }}
      </span>
      @if (hit.available > 0) {
        <span class="text-green-700">{{ hit.available }} hos grossist</span>
      } @else {
        <span class="text-amber-700">
          {{ hit.nextDelivery ? 'Kommer ' + hit.nextDelivery : 'Slut hos grossist' }}
        </span>
      }
    </span>
  `,
})
export class CatalogHitRow {
  @Input({ required: true }) hit!: CatalogHit;
  readonly pricing = inject(Pricing);

  title() {
    const h = this.hit;
    return h.tyre
      ? `${[h.brand, h.model].filter(Boolean).join(' ')} ${h.tyre.width}/${h.tyre.profile} R${h.tyre.rimDiameter}${
          h.tyre.loadIndex || h.tyre.speedIndex
            ? ' ' + (h.tyre.loadIndex ?? '') + (h.tyre.speedIndex ?? '')
            : ''
        }`
      : h.title;
  }

  detail() {
    const h = this.hit;
    const bits: string[] = [];
    if (h.tyre) {
      bits.push(SEASON_LABELS[h.tyre.season]);
      if (h.tyre.studded) bits.push('Dubbat');
      if (h.tyre.runFlat) bits.push('Runflat');
    }
    if (h.partNo) bits.push(h.partNo);
    if (h.articleId) bits.push(`Du har den${h.inStock != null ? ` (${h.inStock} st)` : ''}`);
    return bits.join(' · ');
  }
}

/**
 * Sökrutan mot grossistens katalog (Gummigrossen) för ett nytt däck: skriv storlek eller märke och
 * välj, så fylls resten i. Visas bara när verkstaden har anslutit grossisten.
 */
@Component({
  selector: 'app-catalog-picker',
  standalone: false,
  template: `
    @if (connected()) {
      <div class="relative">
        <mat-icon class="pointer-events-none absolute top-2.5 left-3 text-gray-400"
          >search</mat-icon
        >
        <input
          type="search"
          [formControl]="search"
          autocomplete="off"
          [placeholder]="placeholder"
          class="h-11 w-full pr-3 pl-11 field"
        />
        @if (search.value.trim().length >= 3) {
          <div
            class="absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-xl bg-white shadow-lg"
          >
            @if (loading()) {
              <p class="px-4 py-3 text-sm text-gray-500">Söker hos grossisten…</p>
            } @else {
              @for (h of results(); track h.sourceId) {
                <button
                  type="button"
                  class="hover:bg-brand-soft flex w-full items-center justify-between gap-3 border-b px-4 py-2 text-left"
                  (click)="pick(h)"
                >
                  <app-catalog-hit [hit]="h" class="contents" />
                </button>
              } @empty {
                <p class="px-4 py-3 text-sm text-gray-500">
                  Inga träffar. Prova storleken, t.ex. 205/55 R16.
                </p>
              }
            }
          </div>
        }
      </div>
    }
  `,
})
export class CatalogPicker implements OnInit {
  private readonly api = inject(SupplierCatalogApi);
  @Input() placeholder = 'Sök hos Gummigrossen: storlek eller märke, t.ex. 205/55 R16';
  @Output() picked = new EventEmitter<CatalogHit>();

  readonly connected = signal(false);
  readonly loading = signal(false);
  readonly results = signal<CatalogHit[]>([]);
  readonly search = new FormControl('', { nonNullable: true });

  constructor() {
    this.search.valueChanges
      .pipe(
        tap((v) => {
          this.results.set([]);
          this.loading.set(v.trim().length >= 3);
        }),
        debounceTime(350),
        distinctUntilChanged(),
        switchMap((q) =>
          q.trim().length >= 3
            ? this.api.search(q.trim()).pipe(catchError(() => of([] as CatalogHit[])))
            : of([] as CatalogHit[]),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((r) => {
        this.results.set(r);
        this.loading.set(false);
      });
  }

  ngOnInit() {
    this.api.status().subscribe({ next: (s) => this.connected.set(s.connected), error: () => {} });
  }

  pick(h: CatalogHit) {
    this.search.setValue('', { emitEvent: false });
    this.results.set([]);
    this.picked.emit(h);
  }
}
