import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { OnlineBookingApi } from '../../core/api/online-booking-api';
import {
  DAY_PART_LABELS,
  DayPart,
  PublicBookingProfile,
  PublicBookingService,
  PublicBookingVehicle,
  ServicePrice,
  VehicleClass,
} from '../../core/models';
import { PICKABLE_CLASSES, campaignNote, priceText, problems, toE164 } from './booking-form';

/**
 * Verkstadens publika bokningssida (`/boka/<adress>`): kunden skriver regnumret, ser sin bil och
 * vad varje åtgärd kostar för den, väljer en dag och skickar en förfrågan. Ingen inloggning. Förfrågan
 * hamnar i verkstadens kalender som "Förfrågan" och verkstaden bekräftar en tid. Byggd för mobilen.
 */
@Component({
  selector: 'app-public-booking',
  standalone: false,
  host: { class: 'block min-h-dvh bg-gray-50 pb-16 text-gray-800' },
  template: `
    @if (notFound()) {
      <main
        class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center"
      >
        <mat-icon class="!h-14 !w-14 !text-[56px] text-gray-400">event_busy</mat-icon>
        <h1 class="mt-4 text-xl font-semibold">Bokningssidan finns inte</h1>
        <p class="mt-2 text-gray-600">
          Adressen stämmer inte, eller så har verkstaden stängt den. Hör av dig till verkstaden
          direkt.
        </p>
      </main>
    } @else if (profile(); as p) {
      <header class="bg-brand text-white">
        <div class="mx-auto flex max-w-xl items-center justify-between gap-4 px-4 py-4">
          <div class="min-w-0">
            <div class="truncate text-lg font-semibold">{{ p.name }}</div>
            @if (p.address) {
              <div class="truncate text-sm opacity-80">{{ p.address }}</div>
            }
          </div>
          @if (p.phone) {
            <a
              class="flex shrink-0 items-center gap-1 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium"
              [href]="'tel:' + p.phone"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">call</mat-icon> Ring
            </a>
          }
        </div>
      </header>

      <main class="mx-auto max-w-xl space-y-4 px-4 py-5">
        @if (sent(); as s) {
          <section class="rounded-2xl bg-emerald-50 p-6 text-emerald-900">
            <div class="flex items-center gap-2 text-xl font-semibold">
              <mat-icon>check_circle</mat-icon> Tack, vi har fått din förfrågan
            </div>
            <p class="mt-2">
              {{ p.name }} hör av sig med en bekräftad tid. Du får ett SMS nu som kvitto på att den
              kom fram.
            </p>
            @if (s.code) {
              <p class="mt-3 text-sm">
                Förfrågan har nummer <b>{{ s.code }}</b
                >.
              </p>
            }
            @if (p.phone) {
              <a mat-stroked-button class="mt-4" [href]="'tel:' + p.phone">
                <mat-icon>call</mat-icon> Ring {{ p.phone }}
              </a>
            }
          </section>
        } @else {
          @if (p.intro) {
            <p class="text-gray-700">{{ p.intro }}</p>
          }

          <form [formGroup]="form" (ngSubmit)="send()" class="space-y-4" novalidate>
            <section class="rounded-2xl bg-white p-5 shadow-sm">
              <h2 class="text-base font-semibold">1. Din bil</h2>
              @if (vehicle(); as v) {
                <div class="mt-3 flex flex-wrap items-center gap-3">
                  <app-reg-plate [value]="v.regNo" size="lg" />
                  <div class="min-w-0">
                    <div class="font-medium">{{ v.title }}</div>
                    @if (v.tyreSize) {
                      <div class="text-sm text-gray-600">
                        Däck {{ v.tyreSize
                        }}{{
                          v.tyreSizeRear && v.tyreSizeRear !== v.tyreSize
                            ? ' fram, ' + v.tyreSizeRear + ' bak'
                            : ''
                        }}
                      </div>
                    }
                  </div>
                </div>
                <button
                  type="button"
                  class="mt-3 text-sm font-medium underline"
                  (click)="resetCar()"
                >
                  Inte din bil?
                </button>
              } @else if (!noReg()) {
                <div class="mt-3 flex gap-2">
                  <input
                    formControlName="regNo"
                    class="h-12 min-w-0 flex-1 px-3 text-lg tracking-widest uppercase field"
                    placeholder="ABC123"
                    autocomplete="off"
                    autocapitalize="characters"
                    maxlength="12"
                    (keydown.enter)="lookup(); $event.preventDefault()"
                    aria-label="Registreringsnummer"
                  />
                  <button
                    mat-flat-button
                    color="primary"
                    type="button"
                    class="!h-12"
                    [disabled]="looking()"
                    (click)="lookup()"
                  >
                    {{ looking() ? 'Söker…' : 'Sök' }}
                  </button>
                </div>
                @if (carNote(); as n) {
                  <p class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {{ n }}
                  </p>
                }
                <button
                  type="button"
                  class="mt-3 text-sm font-medium underline"
                  (click)="useClass()"
                >
                  Jag har inget regnummer (husvagn, MC med mera)
                </button>
              }
              @if (noReg() && !vehicle()) {
                <p class="mt-3 text-sm text-gray-600">Vad gäller det?</p>
                <div class="mt-2 grid gap-2">
                  @for (c of classes; track c.value) {
                    <button
                      type="button"
                      class="rounded-xl border px-4 py-3 text-left"
                      [class]="
                        manualClass() === c.value
                          ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] font-medium'
                          : 'border-gray-200 bg-white'
                      "
                      (click)="manualClass.set(c.value)"
                    >
                      {{ c.label }}
                    </button>
                  }
                </div>
                <button
                  type="button"
                  class="mt-3 text-sm font-medium underline"
                  (click)="resetCar()"
                >
                  Jag har ett regnummer
                </button>
              }
            </section>

            <section class="rounded-2xl bg-white p-5 shadow-sm">
              <h2 class="text-base font-semibold">2. Vad vill du ha gjort?</h2>
              <div class="mt-3 grid gap-2">
                @for (s of p.services; track s.id) {
                  <button
                    type="button"
                    class="rounded-xl border px-4 py-3 text-left"
                    [class]="
                      selected() === s.id
                        ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                        : 'border-gray-200 bg-white'
                    "
                    (click)="selected.set(s.id)"
                    [attr.aria-pressed]="selected() === s.id"
                  >
                    <div class="flex items-baseline justify-between gap-3">
                      <span class="font-medium">{{ s.title }}</span>
                      <span class="shrink-0 font-semibold tabular-nums">{{ price(s) }}</span>
                    </div>
                    @if (s.description) {
                      <div class="mt-0.5 text-sm text-gray-600">{{ s.description }}</div>
                    }
                    @if (note(s); as n) {
                      <div
                        class="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
                      >
                        {{ n }}
                      </div>
                    }
                  </button>
                } @empty {
                  <p class="text-sm text-gray-600">
                    Verkstaden har inte lagt in något att boka här än. Ring oss så hjälper vi dig.
                  </p>
                }
              </div>
            </section>

            <section class="rounded-2xl bg-white p-5 shadow-sm">
              <h2 class="text-base font-semibold">3. När passar det?</h2>
              <label class="mt-3 block text-sm text-gray-600" for="day">Önskad dag</label>
              <input
                id="day"
                type="date"
                formControlName="day"
                [min]="p.window.from"
                [max]="p.window.to"
                class="mt-1 h-12 w-full px-3 field"
              />
              <div class="mt-3 grid grid-cols-2 gap-2">
                @for (d of parts; track d.value) {
                  <button
                    type="button"
                    class="rounded-xl border px-4 py-3"
                    [class]="
                      form.controls.part.value === d.value
                        ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] font-medium'
                        : 'border-gray-200 bg-white'
                    "
                    (click)="form.controls.part.setValue(d.value)"
                  >
                    {{ d.label }}
                  </button>
                }
              </div>
              <p class="mt-2 text-xs text-gray-500">
                Det här är en förfrågan. {{ p.name }} bekräftar en exakt tid.
              </p>
            </section>

            <section class="rounded-2xl bg-white p-5 shadow-sm">
              <h2 class="text-base font-semibold">4. Dina uppgifter</h2>
              <div class="mt-3 grid gap-3">
                <label class="block text-sm text-gray-600"
                  >Namn
                  <input
                    formControlName="name"
                    autocomplete="name"
                    class="mt-1 h-12 w-full px-3 text-base text-gray-900 field"
                /></label>
                <label class="block text-sm text-gray-600"
                  >Mobilnummer
                  <input
                    formControlName="phone"
                    type="tel"
                    autocomplete="tel"
                    inputmode="tel"
                    placeholder="070-123 45 67"
                    class="mt-1 h-12 w-full px-3 text-base text-gray-900 field"
                /></label>
                <label class="block text-sm text-gray-600"
                  >E-post (valfritt)
                  <input
                    formControlName="email"
                    type="email"
                    autocomplete="email"
                    class="mt-1 h-12 w-full px-3 text-base text-gray-900 field"
                /></label>
                <label class="block text-sm text-gray-600"
                  >Något vi bör veta? (valfritt)
                  <textarea
                    formControlName="note"
                    rows="3"
                    maxlength="500"
                    class="mt-1 w-full px-3 py-2 text-base text-gray-900 field"
                  ></textarea>
                </label>
                <!-- Dolt fält: bara program fyller i det. -->
                <input
                  formControlName="website"
                  tabindex="-1"
                  autocomplete="off"
                  aria-hidden="true"
                  class="absolute -left-[9999px] h-0 w-0 opacity-0"
                />
                <label class="flex items-start gap-3 text-sm">
                  <input type="checkbox" formControlName="consent" class="mt-1 h-5 w-5" />
                  <span>
                    Jag godkänner att {{ p.name }} använder mina uppgifter för att svara på den här
                    förfrågan och kontakta mig om tiden.
                  </span>
                </label>
              </div>
            </section>

            @if (errors().length) {
              <ul
                class="list-disc space-y-1 rounded-xl bg-red-50 py-3 pr-4 pl-8 text-sm text-red-800"
              >
                @for (e of errors(); track e) {
                  <li>{{ e }}</li>
                }
              </ul>
            }
            @if (failed(); as f) {
              <p class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{{ f }}</p>
            }
            <button
              mat-flat-button
              color="primary"
              type="submit"
              class="!h-14 w-full !text-base"
              [disabled]="sending()"
            >
              {{ sending() ? 'Skickar…' : 'Skicka förfrågan' }}
            </button>
          </form>
        }
      </main>
    } @else {
      <main class="mx-auto max-w-xl p-8 text-center text-gray-500">Laddar…</main>
    }
  `,
})
export class PublicBooking implements OnInit {
  private readonly api = inject(OnlineBookingApi);
  private readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';
  private readonly fb = inject(FormBuilder);

  readonly classes = PICKABLE_CLASSES;
  readonly parts = (Object.entries(DAY_PART_LABELS) as [DayPart, string][]).map(
    ([value, label]) => ({ value, label }),
  );

  readonly profile = signal<PublicBookingProfile | null>(null);
  readonly notFound = signal(false);
  readonly vehicle = signal<PublicBookingVehicle | null>(null);
  readonly prices = signal<Record<string, ServicePrice | null>>({});
  readonly looking = signal(false);
  readonly carNote = signal<string | null>(null);
  /** Kunden har inget regnummer och väljer sorts fordon i stället. */
  readonly noReg = signal(false);
  readonly manualClass = signal<VehicleClass | null>(null);
  readonly selected = signal<string | null>(null);
  readonly errors = signal<string[]>([]);
  readonly failed = signal<string | null>(null);
  readonly sending = signal(false);
  readonly sent = signal<{ code: string | null } | null>(null);

  /** Bilen är uppslagen, eller en klass är vald. */
  readonly hasCar = computed(() => !!this.vehicle() || (this.noReg() && !!this.manualClass()));

  readonly form = this.fb.nonNullable.group({
    regNo: '',
    name: '',
    phone: '',
    email: '',
    day: '',
    part: '' as DayPart | '',
    note: '',
    consent: false,
    website: '',
  });

  ngOnInit() {
    this.api.profile(this.slug).subscribe({
      next: (p) => this.profile.set(p),
      error: () => this.notFound.set(true),
    });
  }

  /** Slår upp bilen och prissätter åtgärderna för den. */
  lookup() {
    const regNo = this.form.controls.regNo.value.replace(/\s/g, '').toUpperCase();
    this.carNote.set(null);
    if (regNo.length < 2) {
      this.carNote.set('Skriv ditt registreringsnummer.');
      return;
    }
    this.looking.set(true);
    this.api.vehicle(this.slug, regNo).subscribe({
      next: (r) => {
        this.looking.set(false);
        if (r.status === 'found' && r.vehicle) {
          this.vehicle.set(r.vehicle);
          this.prices.set(r.prices);
          return;
        }
        this.carNote.set(
          r.status === 'unavailable'
            ? 'Vi kunde inte slå upp bilen just nu. Välj sort fordon nedan, så får du ett pris av verkstaden.'
            : 'Vi hittade ingen bil med det numret. Kontrollera numret, eller välj sort fordon nedan.',
        );
      },
      error: () => {
        this.looking.set(false);
        this.carNote.set(
          'Det gick inte att söka just nu. Försök igen, eller välj sort fordon nedan.',
        );
      },
    });
  }

  useClass() {
    this.noReg.set(true);
    this.carNote.set(null);
  }

  resetCar() {
    this.vehicle.set(null);
    this.prices.set({});
    this.noReg.set(false);
    this.manualClass.set(null);
    this.carNote.set(null);
  }

  price(s: PublicBookingService): string {
    return priceText(s, this.prices()[s.id], !!this.vehicle());
  }

  note(s: PublicBookingService): string | null {
    return campaignNote(this.vehicle() ? this.prices()[s.id] : s.from);
  }

  send() {
    const p = this.profile();
    if (!p) return;
    const v = this.form.getRawValue();
    const errors = problems(
      {
        serviceId: this.selected(),
        hasCar: this.hasCar(),
        name: v.name,
        phone: v.phone,
        email: v.email,
        day: v.day,
        part: v.part,
        consent: v.consent,
      },
      p.window,
    );
    this.errors.set(errors);
    this.failed.set(null);
    if (errors.length) return;
    this.sending.set(true);
    const car = this.vehicle();
    this.api
      .request(this.slug, {
        serviceTypeId: this.selected()!,
        regNo: car?.regNo ?? null,
        vehicleClass: car ? null : this.manualClass(),
        name: v.name.trim(),
        phone: toE164(v.phone) ?? v.phone,
        email: v.email.trim() || null,
        day: v.day,
        part: v.part as DayPart,
        note: v.note.trim() || null,
        consent: v.consent,
        website: v.website || null,
      })
      .subscribe({
        next: (r) => {
          this.sending.set(false);
          this.sent.set({ code: r.code });
          globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
        },
        error: (e: { error?: { error?: { message?: string }; message?: string } }) => {
          this.sending.set(false);
          const text = e?.error?.error?.message ?? e?.error?.message ?? '';
          this.failed.set(
            /waiting/i.test(text)
              ? 'Du har redan förfrågningar som väntar. Verkstaden hör av sig, eller ring dem.'
              : 'Det gick inte att skicka förfrågan. Försök igen om en stund, eller ring verkstaden.',
          );
        },
      });
  }
}
