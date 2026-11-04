import { Component, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { OnlineBookingApi } from '../../core/api/online-booking-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import { OnlineBookingSettings, ServiceType } from '../../core/models';
import { HasUnsaved } from '../../core/unsaved-guard';

/**
 * Webbsida: ägaren slår på verkstadens bokningssida för kunder, väljer adress och bestämmer vilka
 * åtgärder som visas och vad som står vid dem. Åtgärderna är samma som i registret; priset skrivs
 * aldrig här utan kommer från åtgärdens prisrader, så sidan och säljkortet visar samma pris.
 */
@Component({
  selector: 'app-online-booking-page',
  standalone: false,
  template: `
    <div class="mx-auto max-w-5xl space-y-4 p-4">
      <header>
        <h1 class="text-xl font-semibold">Webbsida</h1>
        <p class="mt-1 text-sm text-gray-600">
          Låt kunderna boka själva. De skriver regnumret, ser vad åtgärderna kostar för deras bil
          och skickar en förfrågan. Den dyker upp i kalendern som <b>Förfrågan</b> (lila) och ni
          bekräftar en tid. Länka till sidan från er hemsida, era annonser och Instagram.
        </p>
      </header>

      <section class="rounded-xl bg-white p-5 shadow-sm" [formGroup]="form">
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <h2 class="flex-1 text-base font-semibold">Bokningssidan</h2>
          <mat-slide-toggle formControlName="enabled">Påslagen</mat-slide-toggle>
        </div>
        <div class="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          <label class="flex flex-col gap-0.5 text-xs text-gray-500 sm:col-span-2"
            >Adress
            <span class="flex items-center gap-2">
              <span class="text-sm text-gray-500">{{ origin }}/boka/</span>
              <input
                formControlName="slug"
                maxlength="60"
                placeholder="dackmasterab"
                class="h-10 min-w-0 flex-1 px-2 text-sm text-gray-900 field"
              />
            </span>
          </label>
          @if (slugError(); as e) {
            <p class="text-sm text-red-700 sm:col-span-2">{{ e }}</p>
          }
          <label class="flex flex-col gap-0.5 text-xs text-gray-500 sm:col-span-2"
            >Välkomsttext (valfritt)
            <textarea
              formControlName="intro"
              rows="2"
              maxlength="400"
              placeholder="t.ex. Boka tid för däckbyte eller service. Vi bekräftar inom en arbetsdag."
              class="px-2 py-2 text-sm text-gray-900 field"
            ></textarea>
          </label>
          <label class="flex flex-col gap-0.5 text-xs text-gray-500"
            >Tidigast (dagar framåt)
            <input
              type="number"
              min="0"
              max="30"
              formControlName="leadDays"
              class="h-10 w-28 px-2 text-right text-sm text-gray-900 field"
            />
          </label>
          <label class="flex flex-col gap-0.5 text-xs text-gray-500"
            >Senast (dagar framåt)
            <input
              type="number"
              min="7"
              max="180"
              formControlName="horizonDays"
              class="h-10 w-28 px-2 text-right text-sm text-gray-900 field"
            />
          </label>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button
            mat-flat-button
            color="primary"
            type="button"
            (click)="saveSettings()"
            [disabled]="busy() || form.pristine"
          >
            Spara
          </button>
          @if (saved(); as s) {
            @if (s.path) {
              <a mat-stroked-button [href]="s.path" target="_blank" rel="noopener">
                <mat-icon>open_in_new</mat-icon> Öppna sidan
              </a>
              <button mat-stroked-button type="button" (click)="copy(origin + s.path)">
                <mat-icon>content_copy</mat-icon> Kopiera länken
              </button>
            }
          }
        </div>
        @if (saved()?.path; as path) {
          <p class="mt-3 text-sm text-gray-600">
            Länk att dela: <b>{{ origin }}{{ path }}</b>
          </p>
        }
      </section>

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-1 text-base font-semibold">Åtgärder på sidan</h2>
        <p class="mb-3 text-sm text-gray-600">
          Välj vilka åtgärder kunden kan be om. Rubrik och text är valfria: utan dem används
          åtgärdens namn. Priset kommer från åtgärdens prisrader (visas som "från" tills kunden
          skrivit sitt regnummer) och ändras på åtgärden.
        </p>
        <div [formGroup]="rowsForm">
          <div formArrayName="rows" class="flex flex-col">
            @for (row of rows.controls; track row; let i = $index) {
              <div
                [formGroupName]="i"
                class="flex flex-wrap items-start gap-2 border-t border-gray-100 py-3"
              >
                <mat-checkbox formControlName="published" class="mt-1">Visa</mat-checkbox>
                <div class="min-w-48 flex-1">
                  <div class="text-sm font-medium">{{ row.value.name }}</div>
                  <div class="text-xs text-gray-500">
                    @if (row.value.from) {
                      från {{ row.value.from.total | kr }}
                    } @else {
                      Inget pris
                    }
                    ·
                    <a class="underline" [routerLink]="['/service-types', row.value.id]"
                      >Ändra pris</a
                    >
                  </div>
                </div>
                <input
                  formControlName="title"
                  [placeholder]="row.value.name"
                  maxlength="80"
                  aria-label="Rubrik på sidan"
                  class="h-10 w-56 px-2 text-sm text-gray-900 field"
                />
                <input
                  formControlName="description"
                  placeholder="Kort text (valfri)"
                  maxlength="300"
                  aria-label="Text på sidan"
                  class="h-10 min-w-48 flex-1 px-2 text-sm text-gray-900 field"
                />
                <span class="flex">
                  <button
                    mat-icon-button
                    type="button"
                    (click)="move(i, -1)"
                    [disabled]="i === 0"
                    aria-label="Flytta upp"
                  >
                    <mat-icon>arrow_upward</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    (click)="move(i, 1)"
                    [disabled]="i === rows.length - 1"
                    aria-label="Flytta ned"
                  >
                    <mat-icon>arrow_downward</mat-icon>
                  </button>
                </span>
              </div>
            } @empty {
              <p class="text-sm text-gray-500">Inga åtgärder än. Lägg in dem under Åtgärder.</p>
            }
          </div>
        </div>
        <div class="mt-3 flex items-center gap-3">
          <button
            mat-flat-button
            color="primary"
            type="button"
            (click)="saveServices()"
            [disabled]="busy() || rowsForm.pristine"
          >
            Spara åtgärderna
          </button>
          <span class="text-sm text-gray-500">{{ publishedCount() }} visas på sidan</span>
        </div>
      </section>
    </div>
  `,
})
export class OnlineBookingPage implements OnInit, HasUnsaved {
  private readonly api = inject(OnlineBookingApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  /** Appens adress, så länken man delar är hel. */
  readonly origin = globalThis.location?.origin ?? '';
  readonly busy = signal(false);
  readonly saved = signal<OnlineBookingSettings | null>(null);
  readonly slugError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    enabled: false,
    slug: '',
    intro: '',
    leadDays: 1,
    horizonDays: 60,
  });

  readonly rows = this.fb.array<FormGroup>([]);
  readonly rowsForm = this.fb.group({ rows: this.rows });

  ngOnInit() {
    forkJoin([this.api.settings(), this.workshop.serviceTypes()]).subscribe(([s, types]) => {
      this.setSettings(s);
      this.setRows(types);
    });
  }

  hasUnsaved() {
    return this.form.dirty || this.rowsForm.dirty;
  }

  publishedCount() {
    return this.rows.controls.filter((r) => r.value.published).length;
  }

  private setSettings(s: OnlineBookingSettings) {
    this.saved.set(s);
    this.form.reset({
      enabled: s.enabled,
      slug: s.slug ?? '',
      intro: s.intro ?? '',
      leadDays: s.leadDays,
      horizonDays: s.horizonDays,
    });
  }

  /** Åtgärderna som visas först, i ägarens ordning; resten efter. */
  private setRows(types: ServiceType[]) {
    const sorted = [...types.filter((t) => t.active)].sort(
      (a, b) =>
        Number(!!b.online?.published) - Number(!!a.online?.published) ||
        (a.online?.order ?? 0) - (b.online?.order ?? 0) ||
        a.name.localeCompare(b.name, 'sv'),
    );
    this.rows.clear();
    for (const t of sorted) {
      this.rows.push(
        this.fb.group({
          id: [t.id],
          name: [t.name],
          from: [t.from ?? null],
          published: [!!t.online?.published],
          title: [t.online?.title ?? ''],
          description: [t.online?.description ?? ''],
        }),
      );
    }
    this.rowsForm.markAsPristine();
  }

  saveSettings() {
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.slugError.set(null);
    this.api
      .saveSettings({
        enabled: v.enabled,
        slug: v.slug.trim() || null,
        intro: v.intro.trim() || null,
        leadDays: Number(v.leadDays),
        horizonDays: Number(v.horizonDays),
      })
      .subscribe({
        next: (s) => {
          this.busy.set(false);
          this.setSettings(s);
          this.snack.open('Sparat', undefined, { duration: 2000 });
        },
        error: (e: { status?: number; error?: { error?: { message?: string } } }) => {
          this.busy.set(false);
          this.slugError.set(
            e.status === 409
              ? 'Den adressen används redan. Välj en annan.'
              : (e.error?.error?.message ?? 'Det gick inte att spara.'),
          );
        },
      });
  }

  /** Flyttar en åtgärd upp eller ned. Ordningen på sidan följer ordningen här. */
  move(i: number, step: -1 | 1) {
    const j = i + step;
    if (j < 0 || j >= this.rows.length) return;
    const ctl = this.rows.at(i);
    this.rows.removeAt(i);
    this.rows.insert(j, ctl);
    this.rowsForm.markAsDirty();
  }

  saveServices() {
    const requests = this.rows.controls.map((r, index) => {
      const v = r.getRawValue() as {
        id: string;
        published: boolean;
        title: string;
        description: string;
      };
      return this.workshop.updateServiceType(v.id, {
        online: {
          published: v.published,
          title: v.title.trim() || null,
          description: v.description.trim() || null,
          order: index * 10,
        },
      });
    });
    if (!requests.length) return;
    this.busy.set(true);
    forkJoin(requests).subscribe({
      next: () => {
        this.busy.set(false);
        this.rowsForm.markAsPristine();
        this.snack.open('Sparat', undefined, { duration: 2000 });
      },
      error: () => this.busy.set(false),
    });
  }

  copy(text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => this.snack.open('Länken är kopierad', undefined, { duration: 2000 }))
      .catch(() => undefined);
  }
}
