import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PublicSiteApi } from '../../core/api/car-api';
import { PublicCar } from '../../core/models';
import { SiteContext } from './site-context';

/** Ramen runt webbplatsen: verkstadens namn och telefon överst, sidorna under. */
@Component({
  selector: 'app-public-site',
  standalone: false,
  providers: [SiteContext],
  host: { class: 'block min-h-dvh bg-gray-50 pb-16 text-gray-800' },
  template: `
    @if (ctx.notFound()) {
      <main
        class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center"
      >
        <mat-icon class="!h-14 !w-14 !text-[56px] text-gray-400">directions_car</mat-icon>
        <h1 class="mt-4 text-xl font-semibold">Sidan finns inte</h1>
        <p class="mt-2 text-gray-600">Adressen stämmer inte, eller så är sidan inte öppen än.</p>
      </main>
    } @else if (ctx.profile(); as p) {
      <header class="bg-brand text-white">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <a [routerLink]="ctx.base" class="min-w-0">
            <div class="truncate text-lg font-semibold">{{ p.title }}</div>
            @if (p.address) {
              <div class="truncate text-sm opacity-80">{{ p.address }}</div>
            }
          </a>
          <div class="flex shrink-0 items-center gap-2">
            @if (p.bookingSlug) {
              <a
                class="rounded-lg bg-white/15 px-3 py-2 text-sm font-medium max-sm:hidden"
                [routerLink]="['/boka', p.bookingSlug]"
                >Boka tid</a
              >
            }
            @if (p.phone) {
              <a
                class="flex items-center gap-1 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium"
                [href]="'tel:' + p.phone"
              >
                <mat-icon class="!h-5 !w-5 !text-xl">call</mat-icon> {{ p.phone }}
              </a>
            }
          </div>
        </div>
      </header>
      <router-outlet />
    }
  `,
})
export class PublicSite implements OnInit {
  readonly ctx = inject(SiteContext);

  ngOnInit() {
    this.ctx.load();
  }
}

/** Bilarna till salu: ett rutnät med omslagsbild, rubrik, uppgifter och pris. */
@Component({
  selector: 'app-public-car-list',
  standalone: false,
  template: `
    <main class="mx-auto max-w-6xl space-y-4 px-4 py-5">
      @if (ctx.profile(); as p) {
        @if (p.intro) {
          <p class="max-w-2xl text-gray-700">{{ p.intro }}</p>
        }
      }
      <div class="flex flex-wrap items-center gap-3">
        <input
          [value]="q()"
          (input)="q.set($any($event.target).value)"
          placeholder="Sök märke eller modell…"
          aria-label="Sök"
          class="h-11 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 sm:max-w-sm"
        />
        <select
          [value]="sort()"
          (change)="sort.set($any($event.target).value)"
          aria-label="Sortera"
          class="h-11 rounded-lg border border-gray-300 bg-white px-2"
        >
          <option value="new">Senast tillagda</option>
          <option value="price">Lägst pris</option>
          <option value="year">Nyast årsmodell</option>
          <option value="mil">Lägst miltal</option>
        </select>
        <span class="text-sm text-gray-500">{{ shown().length }} bilar</span>
      </div>

      @if (loading()) {
        <p class="py-10 text-center text-gray-500">Laddar…</p>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (c of shown(); track c.id) {
            <a
              [routerLink]="[...ctx.base, 'bil', c.id]"
              class="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition hover:shadow-md"
            >
              <div class="relative">
                <img
                  [src]="ctx.media(c.images[0])"
                  [alt]="c.heading"
                  loading="lazy"
                  class="aspect-[4/3] w-full object-cover"
                />
                @if (c.reserved) {
                  <span
                    class="absolute top-2 left-2 rounded-md bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white"
                    >Reserverad</span
                  >
                }
              </div>
              <div class="p-4">
                <div class="font-semibold">{{ c.heading }}</div>
                <div class="mt-0.5 text-sm text-gray-600">{{ facts(c) }}</div>
                <div class="mt-2 text-lg font-semibold tabular-nums">
                  {{ c.price == null ? 'Pris på förfrågan' : (c.price | kr) }}
                </div>
              </div>
            </a>
          } @empty {
            <p class="col-span-full py-10 text-center text-gray-500">
              Inga bilar just nu. Titta in igen snart.
            </p>
          }
        </div>
      }
    </main>
  `,
})
export class PublicCarList implements OnInit {
  readonly ctx = inject(SiteContext);
  private readonly api = inject(PublicSiteApi);

  readonly cars = signal<PublicCar[]>([]);
  readonly loading = signal(true);
  readonly q = signal('');
  readonly sort = signal<'new' | 'price' | 'year' | 'mil'>('new');

  readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    const list = this.cars().filter((c) => !q || c.heading.toLowerCase().includes(q));
    const by = this.sort();
    if (by === 'new') return list;
    const key = (c: PublicCar) =>
      by === 'price'
        ? (c.price ?? Number.MAX_SAFE_INTEGER)
        : by === 'year'
          ? -(c.year ?? 0)
          : (c.mileageKm ?? Number.MAX_SAFE_INTEGER);
    return [...list].sort((a, b) => key(a) - key(b));
  });

  ngOnInit() {
    this.api.cars(this.ctx.key).subscribe({
      next: (r) => {
        this.cars.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** "2019 · 8 400 mil · Diesel · Automat" */
  facts(c: PublicCar): string {
    return [
      c.year,
      c.mileageKm == null ? null : `${Math.round(c.mileageKm / 10).toLocaleString('sv-SE')} mil`,
      c.fuel,
      c.gearbox,
    ]
      .filter(Boolean)
      .join(' · ');
  }
}

/** En bil: bildgalleri, uppgifter, beskrivning och en enkel intresseanmälan. */
@Component({
  selector: 'app-public-car',
  standalone: false,
  template: `
    <main class="mx-auto max-w-6xl px-4 py-5">
      <a [routerLink]="ctx.base" class="mb-3 inline-flex items-center gap-1 text-sm text-gray-600">
        <mat-icon class="!h-5 !w-5 !text-xl">arrow_back</mat-icon> Alla bilar
      </a>
      @if (notFound()) {
        <p class="py-10 text-center text-gray-600">Den här bilen finns inte längre.</p>
      } @else if (car(); as c) {
        <div class="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section>
            <div class="relative overflow-hidden rounded-2xl bg-gray-200">
              <img
                [src]="ctx.media(c.images[current()])"
                [alt]="c.heading"
                class="aspect-[4/3] w-full object-cover"
              />
              @if (c.reserved) {
                <span
                  class="absolute top-3 left-3 rounded-md bg-amber-500 px-2.5 py-1 text-sm font-semibold text-white"
                  >Reserverad</span
                >
              }
              @if (c.images.length > 1) {
                <button
                  type="button"
                  class="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white"
                  (click)="step(-1)"
                  aria-label="Föregående bild"
                >
                  <mat-icon>chevron_left</mat-icon>
                </button>
                <button
                  type="button"
                  class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white"
                  (click)="step(1)"
                  aria-label="Nästa bild"
                >
                  <mat-icon>chevron_right</mat-icon>
                </button>
              }
            </div>
            @if (c.images.length > 1) {
              <div class="mt-2 flex gap-2 overflow-x-auto pb-1">
                @for (img of c.images; track img; let i = $index) {
                  <button
                    type="button"
                    (click)="current.set(i)"
                    class="shrink-0 overflow-hidden rounded-lg ring-2"
                    [class]="i === current() ? 'ring-[var(--color-brand)]' : 'ring-transparent'"
                    [attr.aria-label]="'Visa bild ' + (i + 1)"
                  >
                    <img
                      [src]="ctx.media(img)"
                      alt=""
                      loading="lazy"
                      class="h-16 w-24 object-cover"
                    />
                  </button>
                }
              </div>
            }
            @if (c.description) {
              <h2 class="mt-6 text-lg font-semibold">Om bilen</h2>
              <p class="mt-1 whitespace-pre-line text-gray-700">{{ c.description }}</p>
            }
            @if (c.equipment.length) {
              <h2 class="mt-6 text-lg font-semibold">Utrustning</h2>
              <ul class="mt-2 flex flex-wrap gap-2">
                @for (e of c.equipment; track e) {
                  <li class="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-gray-200">
                    {{ e }}
                  </li>
                }
              </ul>
            }
          </section>

          <aside class="space-y-4">
            <div class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
              <h1 class="text-xl font-semibold">{{ c.heading }}</h1>
              <div class="mt-1 text-2xl font-semibold tabular-nums">
                {{ c.price == null ? 'Pris på förfrågan' : (c.price | kr) }}
              </div>
              <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                @for (f of rows(c); track f[0]) {
                  <dt class="text-gray-500">{{ f[0] }}</dt>
                  <dd class="text-right font-medium">{{ f[1] }}</dd>
                }
              </dl>
            </div>

            <div class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
              @if (sent()) {
                <div class="flex items-center gap-2 font-semibold text-emerald-800">
                  <mat-icon>check_circle</mat-icon> Tack! Vi hör av oss.
                </div>
              } @else {
                <h2 class="text-lg font-semibold">Intresserad?</h2>
                <p class="mt-1 text-sm text-gray-600">Skriv ditt nummer så ringer vi upp.</p>
                <form [formGroup]="form" (ngSubmit)="send()" class="mt-3 flex flex-col gap-2.5">
                  <input
                    formControlName="name"
                    placeholder="Namn"
                    autocomplete="name"
                    class="h-11 rounded-lg border border-gray-300 px-3"
                  />
                  <input
                    formControlName="phone"
                    placeholder="Mobilnummer"
                    type="tel"
                    autocomplete="tel"
                    class="h-11 rounded-lg border border-gray-300 px-3"
                  />
                  <input
                    formControlName="email"
                    placeholder="E-post (valfritt)"
                    type="email"
                    autocomplete="email"
                    class="h-11 rounded-lg border border-gray-300 px-3"
                  />
                  <textarea
                    formControlName="message"
                    rows="3"
                    placeholder="Meddelande (valfritt)"
                    class="rounded-lg border border-gray-300 px-3 py-2"
                  ></textarea>
                  <!-- Fälle för program: en människa ser det inte. -->
                  <input
                    formControlName="website"
                    tabindex="-1"
                    autocomplete="off"
                    aria-hidden="true"
                    class="absolute -left-[9999px]"
                  />
                  <label class="flex items-start gap-2 text-sm text-gray-600">
                    <input type="checkbox" formControlName="consent" class="mt-1" />
                    Jag godkänner att {{ ctx.profile()?.name }} kontaktar mig om bilen.
                  </label>
                  @if (error(); as e) {
                    <p class="text-sm text-red-700">{{ e }}</p>
                  }
                  <button mat-flat-button color="primary" type="submit" [disabled]="sending()">
                    Skicka
                  </button>
                </form>
              }
              @if (ctx.profile()?.phone; as phone) {
                <a mat-stroked-button class="mt-3 w-full" [href]="'tel:' + phone">
                  <mat-icon>call</mat-icon> Ring {{ phone }}
                </a>
              }
            </div>
          </aside>
        </div>
      }
    </main>
  `,
})
export class PublicCarPage implements OnInit {
  readonly ctx = inject(SiteContext);
  private readonly api = inject(PublicSiteApi);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private readonly fb = inject(FormBuilder);

  readonly car = signal<PublicCar | null>(null);
  readonly notFound = signal(false);
  readonly current = signal(0);
  readonly sending = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', Validators.required],
    email: '',
    message: '',
    consent: false,
    website: '',
  });

  ngOnInit() {
    this.api.car(this.ctx.key, this.id).subscribe({
      next: (c) => {
        this.car.set(c);
        this.ctx.setTitle(c.heading);
      },
      error: () => this.notFound.set(true),
    });
  }

  step(by: -1 | 1) {
    const n = this.car()?.images.length ?? 0;
    if (n) this.current.update((i) => (i + by + n) % n);
  }

  /** Uppgifterna som en tabell: bara det bilen har. */
  rows(c: PublicCar): [string, string][] {
    const mil =
      c.mileageKm == null ? null : `${Math.round(c.mileageKm / 10).toLocaleString('sv-SE')} mil`;
    const all: [string, string | null][] = [
      ['Årsmodell', c.year ? `${c.year}` : null],
      ['Miltal', mil],
      ['Drivmedel', c.fuel],
      ['Växellåda', c.gearbox],
      ['Effekt', c.powerHp ? `${c.powerHp} hk` : null],
      ['Fyrhjulsdrift', c.fourWheelDrive === null ? null : c.fourWheelDrive ? 'Ja' : 'Nej'],
      ['Kaross', c.bodyText],
      ['Färg', c.color],
      ['Besiktas senast', c.inspectionDue],
      ['Regnr', c.regNo],
    ];
    return all.filter((r): r is [string, string] => !!r[1]);
  }

  send() {
    const v = this.form.getRawValue();
    this.error.set(null);
    if (v.name.trim().length < 2 || !v.phone.trim()) {
      this.error.set('Skriv ditt namn och ett mobilnummer.');
      return;
    }
    if (!v.consent) {
      this.error.set('Godkänn att vi kontaktar dig.');
      return;
    }
    this.sending.set(true);
    this.api
      .inquire(this.ctx.key, this.id, {
        name: v.name.trim(),
        phone: v.phone.trim(),
        email: v.email.trim() || null,
        message: v.message.trim() || null,
        consent: v.consent,
        website: v.website || null,
      })
      .subscribe({
        next: () => {
          this.sending.set(false);
          this.sent.set(true);
        },
        error: (e: { error?: { error?: { message?: string } } }) => {
          this.sending.set(false);
          this.error.set(
            e.error?.error?.message ?? 'Det gick inte att skicka. Försök igen eller ring oss.',
          );
        },
      });
  }
}
