import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Auth } from '../../core/auth/auth';
import { environment } from '../../../environments/environment';
import { shrinkImage } from '../../core/image-resize';
import { SiteApi } from '../../core/api/car-api';
import { SiteDomain, SiteSettings } from '../../core/models';
import { HasUnsaved } from '../../core/unsaved-guard';

type ApiError = { status?: number; error?: { error?: { message?: string } } };

const STATUS_TEXT: Record<SiteDomain['status'], string> = {
  pending: 'Väntar på DNS',
  active: 'Igång',
  error: 'Fel',
};

/**
 * Verkstadens webbplats (bilarna till salu): ägaren skriver rubrik och välkomsttext. Adress,
 * på/av och domäner sätter Catso åt verkstaden (superadmin): vi köper eller tar emot domänen,
 * kopplar den och talar om vilka DNS-poster som ska skapas. Ägaren ser bara hur det går.
 */
@Component({
  selector: 'app-site-page',
  standalone: false,
  template: `
    <app-card-page listLink="/dealership" listLabel="Hem" newTitle="Webbplats" title="Webbplats">
      <div actions>
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="busy() || (form.pristine && look.pristine)"
        >
          Spara
        </button>
      </div>

      @if (site(); as s) {
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="mb-2 flex flex-wrap items-center gap-3">
            <h2 class="flex-1 text-base font-semibold">Så når kunderna er webbplats</h2>
            <span
              class="rounded-full px-2.5 py-0.5 text-xs font-medium"
              [class]="s.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'"
            >
              {{ s.enabled ? 'Påslagen' : 'Inte påslagen' }}
            </span>
          </div>
          @if (!s.enabled) {
            <p class="text-sm text-gray-600">
              Sidan är inte påslagen än. Hör av dig till Catso, så kopplar vi er domän och slår på
              den åt er.
            </p>
          }
          <ul class="mt-2 flex flex-col gap-1.5 text-sm">
            @for (d of s.domains; track d.hostname) {
              <li class="flex flex-wrap items-center gap-2">
                <mat-icon class="!h-5 !w-5 !text-xl text-gray-500">language</mat-icon>
                @if (d.status === 'active') {
                  <a
                    class="underline"
                    [href]="'https://' + d.hostname"
                    target="_blank"
                    rel="noopener"
                    >{{ d.hostname }}</a
                  >
                } @else {
                  <span>{{ d.hostname }}</span>
                }
                <app-pill
                  [tone]="d.status === 'active' ? 'green' : d.status === 'error' ? 'red' : 'amber'"
                  >{{ statusText[d.status] }}</app-pill
                >
              </li>
            }
            @if (s.path) {
              <li class="flex flex-wrap items-center gap-2">
                <mat-icon class="!h-5 !w-5 !text-xl text-gray-500">link</mat-icon>
                <a class="underline" [href]="s.path" target="_blank" rel="noopener"
                  >{{ origin }}{{ s.path }}</a
                >
              </li>
            }
          </ul>
        </section>

        @for (d of s.domains; track d.hostname) {
          @if (d.status !== 'active') {
            <section class="rounded-xl bg-amber-50 p-5 text-sm text-amber-950 shadow-sm">
              <h2 class="mb-1 text-base font-semibold">{{ d.hostname }}: det här återstår</h2>
              @if (d.error) {
                <p class="mb-2 text-red-800">{{ d.error }}</p>
              }
              @if (d.autoDns) {
                <p class="mb-2">
                  DNS-posterna är skapade åt er. Det kan ta några minuter innan certifikatet är
                  utfärdat; tryck på Kontrollera.
                </p>
              } @else {
                <p class="mb-2">
                  Skapa de här posterna hos den som har domänens DNS. Det kan ta en stund innan de
                  gäller; tryck sedan på Kontrollera.
                </p>
                <div class="overflow-x-auto">
                  <table class="w-full text-left">
                    <thead class="text-xs text-amber-800 uppercase">
                      <tr>
                        <th class="pr-4">Typ</th>
                        <th class="pr-4">Namn</th>
                        <th>Värde</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (r of d.records; track r.type + r.name) {
                        <tr>
                          <td class="pr-4 font-mono">{{ r.type }}</td>
                          <td class="pr-4 font-mono break-all">{{ r.name }}</td>
                          <td class="font-mono break-all">{{ r.value }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
              <div class="mt-3 flex gap-2">
                <button
                  mat-stroked-button
                  type="button"
                  (click)="check(d.hostname)"
                  [disabled]="busy()"
                >
                  <mat-icon>refresh</mat-icon> Kontrollera
                </button>
              </div>
            </section>
          }
        }

        <form [formGroup]="form" class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-3 text-base font-semibold">Texten på sidan</h2>
          <mat-form-field class="w-full">
            <mat-label>Rubrik (tom = företagets namn)</mat-label>
            <input matInput formControlName="title" maxlength="80" />
          </mat-form-field>
          <mat-form-field class="w-full">
            <mat-label>Välkomsttext (valfri)</mat-label>
            <textarea matInput rows="3" maxlength="600" formControlName="intro"></textarea>
          </mat-form-field>
          <mat-slide-toggle formControlName="hideRegNo"
            >Dölj registreringsnummer på sidan</mat-slide-toggle
          >
          <p class="mt-1 text-xs text-gray-500">
            Regnumret tas bort från annonserna. Bilderna ändras inte, så ett synligt nummer på en
            bild ligger kvar.
          </p>
          @if (error(); as e) {
            <p class="mt-2 text-sm text-red-700">{{ e }}</p>
          }
        </form>

        <form [formGroup]="look" class="flex flex-col gap-5 rounded-xl bg-white p-5 shadow-sm">
          <div>
            <h2 class="mb-1 text-base font-semibold">Utseende</h2>
            <p class="mb-3 text-sm text-gray-600">
              Samma uppbyggnad för alla; ni väljer färger, rubrik och text.
            </p>
            <div class="flex flex-wrap items-center gap-6">
              <mat-radio-group formControlName="theme" class="flex gap-4">
                <mat-radio-button value="dark">Mörk</mat-radio-button>
                <mat-radio-button value="light">Ljus</mat-radio-button>
              </mat-radio-group>
              <label class="flex items-center gap-2 text-sm"
                >Accentfärg
                <input type="color" formControlName="accent" class="h-9 w-12 cursor-pointer" />
              </label>
            </div>
            <div class="mt-3">
              <ng-container
                *ngTemplateOutlet="
                  picture;
                  context: {
                    label: 'Logotyp',
                    ctrl: look.controls.logoUrl,
                    key: 'logo',
                    keep: true,
                  }
                "
              />
            </div>
          </div>

          <div>
            <h2 class="mb-3 text-base font-semibold">Toppen av sidan</h2>
            <mat-form-field class="w-full">
              <mat-label>Liten rubrik (tom = "Vårt lager · 12 bilar")</mat-label>
              <input matInput formControlName="eyebrow" maxlength="60" />
            </mat-form-field>
            <mat-form-field class="w-full">
              <mat-label>Rubrik (tom = "Begagnade bilar i staden")</mat-label>
              <input matInput formControlName="headline" maxlength="100" />
            </mat-form-field>
            <mat-form-field class="w-full">
              <mat-label>Ord i rubriken som får accentfärg</mat-label>
              <input matInput formControlName="emphasis" maxlength="60" placeholder="med garanti" />
            </mat-form-field>
            <mat-form-field class="w-full">
              <mat-label>Text under rubriken</mat-label>
              <textarea matInput rows="3" maxlength="400" formControlName="text"></textarea>
            </mat-form-field>
            <ng-container
              *ngTemplateOutlet="
                picture;
                context: {
                  label: 'Bakgrundsbild',
                  ctrl: look.controls.imageUrl,
                  key: 'hero',
                  keep: false,
                }
              "
            />
          </div>

          <div>
            <h2 class="mb-3 text-base font-semibold">Öppettider och sidor</h2>
            <mat-form-field class="w-full">
              <mat-label>Öppettider (en rad per rad)</mat-label>
              <textarea
                matInput
                rows="3"
                formControlName="hours"
                placeholder="Mån–fre 09–18&#10;Lör 10–14"
              ></textarea>
            </mat-form-field>
            <p class="mb-2 text-xs text-gray-500">
              En sida visas på webbplatsen bara om den har text. Tomma sidor döljs.
            </p>
            @for (g of pages; track g.key) {
              <div class="mb-3 rounded-lg border border-gray-200 p-3" [formGroupName]="g.key">
                <mat-form-field class="w-full">
                  <mat-label>{{ g.label }}: rubrik</mat-label>
                  <input matInput formControlName="title" maxlength="80" />
                </mat-form-field>
                <mat-form-field class="w-full">
                  <mat-label>{{ g.label }}: text (blankrad = nytt stycke)</mat-label>
                  <textarea matInput rows="4" maxlength="4000" formControlName="body"></textarea>
                </mat-form-field>
              </div>
            }
          </div>

          <div>
            <h2 class="mb-3 text-base font-semibold">Vanliga frågor</h2>
            <div formArrayName="faq" class="flex flex-col gap-3">
              @for (q of faq.controls; track q; let i = $index) {
                <div [formGroupName]="i" class="rounded-lg border border-gray-200 p-3">
                  <mat-form-field class="w-full">
                    <mat-label>Fråga</mat-label>
                    <input matInput formControlName="q" maxlength="160" />
                  </mat-form-field>
                  <mat-form-field class="w-full">
                    <mat-label>Svar</mat-label>
                    <textarea matInput rows="2" maxlength="1200" formControlName="a"></textarea>
                  </mat-form-field>
                  <button mat-button type="button" class="!text-red-700" (click)="removeFaq(i)">
                    Ta bort
                  </button>
                </div>
              }
            </div>
            <button mat-stroked-button type="button" class="mt-2" (click)="addFaq()">
              <mat-icon>add</mat-icon> Lägg till fråga
            </button>
          </div>
          @if (lookError(); as e) {
            <p class="text-sm text-red-700">{{ e }}</p>
          }
        </form>

        @if (operator) {
          <section class="rounded-xl border border-dashed border-gray-300 bg-white p-5">
            <h2 class="mb-1 text-base font-semibold">Catso: adress och domäner</h2>
            <p class="mb-3 text-sm text-gray-600">
              Syns bara för plattformens operatörer och gäller bolaget du är i.
            </p>
            <form [formGroup]="admin" class="flex flex-col gap-3">
              <mat-slide-toggle formControlName="enabled">Påslagen</mat-slide-toggle>
              <label class="flex flex-col gap-0.5 text-xs text-gray-500"
                >Adress på catso.io
                <span class="flex items-center gap-2">
                  <span class="text-sm text-gray-500">{{ origin }}/bilhandel/</span>
                  <input
                    formControlName="slug"
                    maxlength="60"
                    placeholder="dackmaster"
                    class="h-10 min-w-0 flex-1 px-2 text-sm text-gray-900 field"
                  />
                </span>
              </label>
              <div>
                <button
                  mat-stroked-button
                  type="button"
                  (click)="saveAdmin()"
                  [disabled]="busy() || admin.pristine"
                >
                  Spara adress
                </button>
              </div>
            </form>
            <h3 class="sec mt-5">SEO och spårning</h3>
            <form [formGroup]="seo" class="flex flex-col gap-1">
              <mat-form-field class="w-full">
                <mat-label>Sidtitel (tom = "Begagnade bilar i staden | Namn", max 70)</mat-label>
                <input matInput formControlName="title" maxlength="70" />
              </mat-form-field>
              <mat-form-field class="w-full">
                <mat-label>Beskrivning i sökresultat (max 170)</mat-label>
                <textarea
                  matInput
                  rows="2"
                  maxlength="170"
                  formControlName="description"
                ></textarea>
              </mat-form-field>
              <mat-form-field class="w-full">
                <mat-label>Stad (tom = staden i Fakturauppgifter)</mat-label>
                <input matInput formControlName="city" maxlength="60" />
              </mat-form-field>
              <ng-container
                *ngTemplateOutlet="
                  picture;
                  context: {
                    label: 'Delningsbild (tom = första bilen)',
                    ctrl: seo.controls.ogImage,
                    key: 'og',
                    keep: false,
                  }
                "
              />
              <mat-form-field class="w-full">
                <mat-label>Google Analytics-id (G-…)</mat-label>
                <input matInput formControlName="gaId" maxlength="20" />
              </mat-form-field>
              <div>
                <button
                  mat-stroked-button
                  type="button"
                  (click)="saveSeo()"
                  [disabled]="busy() || seo.pristine"
                >
                  Spara SEO
                </button>
              </div>
            </form>
            <h3 class="sec mt-5">Domäner</h3>
            <div class="flex items-center gap-2">
              <input
                [formControl]="newDomain"
                placeholder="dackmaster.se"
                autocomplete="off"
                (keydown.enter)="addDomain()"
                class="h-10 min-w-0 flex-1 px-2 text-sm text-gray-900 field"
              />
              <button
                mat-flat-button
                color="primary"
                type="button"
                (click)="addDomain()"
                [disabled]="busy() || newDomain.value.trim().length < 4"
              >
                Koppla domän
              </button>
            </div>
            @for (d of s.domains; track d.hostname) {
              <div class="mt-2 flex items-center gap-2 text-sm">
                <span class="flex-1">{{ d.hostname }}</span>
                <button
                  mat-button
                  type="button"
                  class="!text-red-700"
                  (click)="removeDomain(d.hostname)"
                >
                  Ta bort
                </button>
              </div>
            }
            @if (adminError(); as e) {
              <p class="mt-2 text-sm text-red-700">{{ e }}</p>
            }
          </section>
        }
      }
      <ng-template #picture let-label="label" let-ctrl="ctrl" let-key="key" let-keep="keep">
        <div class="flex items-center gap-3">
          <div
            class="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-lg bg-gray-100 text-gray-400"
          >
            @if (src(ctrl.value); as u) {
              <img [src]="u" alt="" class="h-full w-full object-contain" />
            } @else {
              <mat-icon>image</mat-icon>
            }
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium">{{ label }}</div>
            <div class="mt-1 flex flex-wrap gap-2">
              <button
                mat-stroked-button
                type="button"
                (click)="file.click()"
                [disabled]="uploading() === key"
              >
                <mat-icon>upload</mat-icon>
                {{ uploading() === key ? 'Laddar upp…' : ctrl.value ? 'Byt bild' : 'Ladda upp' }}
              </button>
              @if (ctrl.value) {
                <button mat-button type="button" (click)="clear(ctrl)">Ta bort</button>
              }
            </div>
            <input
              #file
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="hidden"
              (change)="upload($event, ctrl, key, keep)"
            />
          </div>
        </div>
      </ng-template>
    </app-card-page>
  `,
})
export class SitePage implements OnInit, HasUnsaved {
  private readonly api = inject(SiteApi);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  readonly operator = inject(Auth).isSuperAdmin();

  readonly origin = globalThis.location?.origin ?? '';
  readonly statusText = STATUS_TEXT;
  readonly site = signal<SiteSettings | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly adminError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({ title: '', intro: '', hideRegNo: false });
  readonly admin = this.fb.nonNullable.group({ enabled: false, slug: '' });

  readonly pages = [
    { key: 'financing', label: 'Finansiering' },
    { key: 'tradeIn', label: 'Sälj och byt in' },
    { key: 'about', label: 'Om oss' },
  ] as const;
  readonly look = this.fb.nonNullable.group({
    theme: 'dark' as 'dark' | 'light',
    accent: '#e63b2e',
    logoUrl: '',
    eyebrow: '',
    headline: '',
    emphasis: '',
    text: '',
    imageUrl: '',
    hours: '',
    financing: this.fb.nonNullable.group({ title: '', body: '' }),
    tradeIn: this.fb.nonNullable.group({ title: '', body: '' }),
    about: this.fb.nonNullable.group({ title: '', body: '' }),
    faq: this.fb.nonNullable.array([this.faqGroup()]),
  });
  readonly seo = this.fb.nonNullable.group({
    title: '',
    description: '',
    city: '',
    ogImage: '',
    gaId: '',
  });
  readonly lookError = signal<string | null>(null);
  readonly uploading = signal<string | null>(null);

  /** En uppladdad bild ligger på backenden (adressen börjar med /), annars är det en egen adress. */
  src(v: string | null): string {
    return v ? (v.startsWith('/') ? environment.apiUrl + v : v) : '';
  }

  /** Laddar upp valt foto och lägger adressen i fältet; sparas med Spara. En logga behåller sitt format (genomskinlighet). */
  async upload(ev: Event, ctrl: AbstractControl, key: string, keep: boolean) {
    const input = ev.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;
    this.uploading.set(key);
    this.lookError.set(null);
    const file = keep ? picked : await shrinkImage(picked);
    this.api.uploadImage(file).subscribe({
      next: (r) => {
        ctrl.setValue(r.url);
        ctrl.markAsDirty();
        this.uploading.set(null);
      },
      error: (e: ApiError) => {
        this.uploading.set(null);
        this.lookError.set(e.error?.error?.message ?? 'Det gick inte att ladda upp bilden.');
      },
    });
  }

  clear(ctrl: AbstractControl) {
    ctrl.setValue('');
    ctrl.markAsDirty();
  }
  get faq() {
    return this.look.controls.faq as FormArray;
  }
  private faqGroup(q = '', a = '') {
    return this.fb.nonNullable.group({ q, a });
  }
  addFaq() {
    this.faq.push(this.faqGroup());
    this.look.markAsDirty();
  }
  removeFaq(i: number) {
    this.faq.removeAt(i);
    this.look.markAsDirty();
  }
  readonly newDomain = this.fb.nonNullable.control('');

  ngOnInit() {
    this.api.get().subscribe((s) => this.load(s));
  }

  hasUnsaved() {
    return this.form.dirty || this.look.dirty;
  }

  private load(s: SiteSettings, keepText = false) {
    this.site.set(s);
    if (!keepText)
      this.form.reset({ title: s.title ?? '', intro: s.intro ?? '', hideRegNo: s.hideRegNo });
    this.admin.reset({ enabled: s.enabled, slug: s.slug ?? '' });
    const p = s.page;
    this.seo.reset({
      title: p.seo.title ?? '',
      description: p.seo.description ?? '',
      city: p.seo.city ?? '',
      ogImage: p.seo.ogImage ?? '',
      gaId: p.analytics.gaId ?? '',
    });
    if (keepText) return;
    this.faq.clear();
    for (const f of p.faq.length ? p.faq : [{ q: '', a: '' }])
      this.faq.push(this.faqGroup(f.q, f.a));
    this.look.reset({
      theme: p.theme,
      accent: p.accent,
      logoUrl: p.logoUrl ?? '',
      eyebrow: p.hero.eyebrow ?? '',
      headline: p.hero.headline ?? '',
      emphasis: p.hero.emphasis ?? '',
      text: p.hero.text ?? '',
      imageUrl: p.hero.imageUrl ?? '',
      hours: p.hours.join('\n'),
      financing: { title: p.financing?.title ?? '', body: p.financing?.body ?? '' },
      tradeIn: { title: p.tradeIn?.title ?? '', body: p.tradeIn?.body ?? '' },
      about: { title: p.about?.title ?? '', body: p.about?.body ?? '' },
      faq: p.faq.length ? p.faq : [{ q: '', a: '' }],
    });
  }

  private pageBody() {
    const v = this.look.getRawValue();
    const t = (x: string) => x.trim() || null;
    const info = (g: { title: string; body: string }) =>
      g.title.trim() || g.body.trim() ? { title: g.title.trim(), body: g.body.trim() } : null;
    return {
      theme: v.theme,
      accent: v.accent,
      logoUrl: t(v.logoUrl),
      hero: {
        eyebrow: t(v.eyebrow),
        headline: t(v.headline),
        emphasis: t(v.emphasis),
        text: t(v.text),
        imageUrl: t(v.imageUrl),
      },
      hours: v.hours
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      financing: info(v.financing),
      tradeIn: info(v.tradeIn),
      about: info(v.about),
      faq: v.faq.filter((f) => f.q.trim() && f.a.trim()),
    };
  }

  /** Operatörens fält: SEO och spårning. */
  saveSeo() {
    const v = this.seo.getRawValue();
    const t = (x: string) => x.trim() || null;
    this.run(
      this.api.save({
        page: {
          seo: {
            title: t(v.title),
            description: t(v.description),
            city: t(v.city),
            ogImage: t(v.ogImage),
          },
          analytics: { gaId: t(v.gaId) },
        },
      }),
    );
  }

  save() {
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.lookError.set(null);
    this.api
      .save({
        title: v.title.trim() || null,
        intro: v.intro.trim() || null,
        hideRegNo: v.hideRegNo,
        page: this.pageBody(),
      })
      .subscribe({
        next: (s) => {
          this.busy.set(false);
          this.load(s);
          this.snack.open('Sparat', undefined, { duration: 2000 });
        },
        error: (e: ApiError) => {
          this.busy.set(false);
          const msg = e.error?.error?.message ?? 'Det gick inte att spara.';
          this.error.set(msg);
          this.lookError.set(msg);
        },
      });
  }

  /** Körs av operatören: adress och på/av. */
  saveAdmin() {
    const v = this.admin.getRawValue();
    this.run(this.api.save({ enabled: v.enabled, slug: v.slug.trim() || null }), (e) =>
      e.status === 409 ? 'Den adressen används redan. Välj en annan.' : null,
    );
  }

  addDomain() {
    const host = this.newDomain.value.trim();
    if (host.length < 4) return;
    this.run(
      this.api.addDomain(host),
      (e) => (e.status === 409 ? 'Den domänen är redan kopplad till en annan webbplats.' : null),
      () => this.newDomain.reset(''),
    );
  }

  check(hostname: string) {
    this.run(this.api.checkDomain(hostname));
  }

  removeDomain(hostname: string) {
    this.run(this.api.removeDomain(hostname));
  }

  private run(
    call: ReturnType<SiteApi['get']>,
    explain: (e: ApiError) => string | null = () => null,
    done?: () => void,
  ) {
    this.busy.set(true);
    this.adminError.set(null);
    call.subscribe({
      next: (s) => {
        this.busy.set(false);
        // Texten ägaren skriver (och inte sparat) ska inte skrivas över av en domänkoll.
        this.load(s, this.form.dirty || this.look.dirty);
        done?.();
      },
      error: (e: ApiError) => {
        this.busy.set(false);
        this.adminError.set(explain(e) ?? e.error?.error?.message ?? 'Det gick inte.');
      },
    });
  }
}
