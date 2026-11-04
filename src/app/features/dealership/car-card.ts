import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { CarApi, SiteApi } from '../../core/api/car-api';
import { shrinkImage } from '../../core/image-resize';
import { CarListing, LISTING_STATUS_LABELS, ListingStatus, SiteSettings } from '../../core/models';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';

type ApiError = { status?: number; error?: { error?: { message?: string } } };

/**
 * Kortet för en bil till salu. En ny bil skapas av ett registreringsnummer: registret fyller i
 * märke, modell, år, drivmedel, växellåda, effekt och besiktning, och säljaren lägger till pris,
 * text och bilder. En bil visas på webbplatsen när den har status Till salu (eller Reserverad).
 */
@Component({
  selector: 'app-car-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/dealership"
      listLabel="Bilhandel"
      newTitle="Ny bil"
      [title]="card()?.heading ?? ''"
      [code]="card()?.regNo ?? null"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          <button
            mat-icon-button
            class="!text-red-700"
            aria-label="Ta bort"
            matTooltip="Ta bort annonsen"
            (click)="remove()"
          >
            <mat-icon>delete_outline</mat-icon>
          </button>
          @if (publicUrl(); as url) {
            <a mat-stroked-button [href]="url" target="_blank" rel="noopener">
              <mat-icon>open_in_new</mat-icon> Visa annonsen
            </a>
          }
          @if (c.status === 'draft') {
            <button mat-stroked-button type="button" (click)="publish()" [disabled]="busy()">
              Publicera
            </button>
          }
          <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
            Spara
          </button>
        }
      </div>

      @if (!card()) {
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="text-base font-semibold">Registreringsnummer</h2>
          <p class="mt-1 mb-3 text-sm text-gray-600">
            Skriv bilens regnummer så hämtar vi märke, modell, år, drivmedel, växellåda, effekt och
            besiktning ur fordonsregistret. Pris, text och bilder lägger du till sedan.
          </p>
          <div class="flex items-start gap-3">
            <input
              [formControl]="regNo"
              maxlength="12"
              placeholder="ABC123"
              autocomplete="off"
              (keydown.enter)="create()"
              class="h-11 w-44 px-3 text-lg font-semibold tracking-widest uppercase field"
            />
            <button
              mat-flat-button
              color="primary"
              type="button"
              (click)="create()"
              [disabled]="busy() || regNo.value.trim().length < 2"
            >
              Hämta bilen
            </button>
          </div>
          @if (error(); as e) {
            <p class="mt-3 text-sm text-red-700">{{ e }}</p>
          }
        </section>
      } @else {
        @if (card(); as c) {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <h2 class="flex-1 text-base font-semibold">Bilder</h2>
              <button mat-stroked-button type="button" (click)="files.click()" [disabled]="busy()">
                <mat-icon>add_photo_alternate</mat-icon> Lägg till bilder
              </button>
              <input
                #files
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                class="hidden"
                (change)="upload(files)"
              />
            </div>
            <p class="mb-3 text-sm text-gray-600">
              Den första bilden är omslag i listan. Foton från mobilen krymps automatiskt.
            </p>
            @if (uploading(); as u) {
              <p class="mb-2 text-sm text-gray-600">Laddar upp {{ u }}…</p>
            }
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              @for (url of c.imageUrls; track url; let i = $index) {
                <div class="group relative overflow-hidden rounded-lg border border-gray-200">
                  <img [src]="media(url)" alt="" class="aspect-[4/3] w-full object-cover" />
                  @if (i === 0) {
                    <span
                      class="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white"
                      >Omslag</span
                    >
                  }
                  <div class="flex justify-between bg-white px-1 py-0.5">
                    <button
                      mat-icon-button
                      type="button"
                      (click)="moveImage(i, -1)"
                      [disabled]="i === 0 || busy()"
                      aria-label="Flytta bak"
                    >
                      <mat-icon>chevron_left</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      type="button"
                      (click)="removeImage(i)"
                      [disabled]="busy()"
                      aria-label="Ta bort bilden"
                    >
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      type="button"
                      (click)="moveImage(i, 1)"
                      [disabled]="i === c.images.length - 1 || busy()"
                      aria-label="Flytta fram"
                    >
                      <mat-icon>chevron_right</mat-icon>
                    </button>
                  </div>
                </div>
              } @empty {
                <p class="col-span-full text-sm text-gray-500">
                  Inga bilder än. En bil behöver minst en bild för att kunna publiceras.
                </p>
              }
            </div>
          </section>

          <form [formGroup]="form" class="flex flex-col gap-4">
            <section class="rounded-xl bg-white p-5 shadow-sm">
              <div class="mb-3 flex flex-wrap items-center gap-2">
                <h2 class="flex-1 text-base font-semibold">Bilen</h2>
                <button
                  mat-stroked-button
                  type="button"
                  (click)="refresh()"
                  [disabled]="busy()"
                  matTooltip="Läser registret igen. Pris, text och bilder behålls."
                >
                  <mat-icon>sync</mat-icon> Uppdatera från registret
                </button>
              </div>
              <div class="grid gap-x-4 sm:grid-cols-3">
                <mat-form-field>
                  <mat-label>Märke</mat-label>
                  <input matInput formControlName="make" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Modell</mat-label>
                  <input matInput formControlName="model" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Variant (t.ex. 2.0 TDI Business)</mat-label>
                  <input matInput formControlName="variant" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Årsmodell</mat-label>
                  <input matInput type="number" formControlName="year" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Miltal (mil)</mat-label>
                  <input matInput type="number" min="0" formControlName="mil" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Färg</mat-label>
                  <input matInput formControlName="color" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Drivmedel</mat-label>
                  <input matInput formControlName="fuel" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Växellåda</mat-label>
                  <input matInput formControlName="gearbox" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Effekt (hk)</mat-label>
                  <input matInput type="number" min="0" formControlName="powerHp" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Kaross</mat-label>
                  <input matInput formControlName="bodyText" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Besiktas senast</mat-label>
                  <input matInput type="date" formControlName="inspectionDue" />
                </mat-form-field>
              </div>
            </section>

            <section class="rounded-xl bg-white p-5 shadow-sm">
              <h2 class="mb-3 text-base font-semibold">Annonsen</h2>
              <div class="grid gap-x-4 sm:grid-cols-[1fr_14rem_12rem]">
                <mat-form-field>
                  <mat-label>Rubrik (tom = märke, modell och variant)</mat-label>
                  <input matInput formControlName="title" maxlength="100" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Pris (kr, inkl. moms)</mat-label>
                  <input matInput type="number" min="0" formControlName="priceKr" />
                  <mat-hint>Tomt = pris på förfrågan</mat-hint>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Status</mat-label>
                  <mat-select formControlName="status">
                    @for (s of statuses; track s.value) {
                      <mat-option [value]="s.value">{{ s.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </div>
              <mat-form-field class="w-full">
                <mat-label>Beskrivning</mat-label>
                <textarea
                  matInput
                  rows="6"
                  maxlength="5000"
                  formControlName="description"
                ></textarea>
              </mat-form-field>
              <mat-form-field class="w-full">
                <mat-label>Utrustning (en per rad)</mat-label>
                <textarea matInput rows="5" formControlName="equipment"></textarea>
              </mat-form-field>
              @if (error(); as e) {
                <p class="text-sm text-red-700">{{ e }}</p>
              }
            </section>
          </form>

          @if (c.inquiries.length) {
            <section class="rounded-xl bg-white p-5 shadow-sm">
              <h2 class="mb-3 text-base font-semibold">Frågor från intresserade</h2>
              <div class="flex flex-col divide-y divide-gray-100">
                @for (q of inquiriesNewestFirst(); track q.at) {
                  <div class="py-3 text-sm">
                    <div class="flex flex-wrap items-baseline gap-x-3">
                      <b>{{ q.name }}</b>
                      <a class="text-[var(--color-brand)] underline" [href]="'tel:' + q.phone">{{
                        q.phone
                      }}</a>
                      @if (q.email) {
                        <a class="underline" [href]="'mailto:' + q.email">{{ q.email }}</a>
                      }
                      <span class="text-xs text-gray-500">{{
                        q.at | date: 'yyyy-MM-dd HH:mm'
                      }}</span>
                    </div>
                    @if (q.message) {
                      <p class="mt-1 text-gray-700">{{ q.message }}</p>
                    }
                  </div>
                }
              </div>
            </section>
          }
        }
      }
    </app-card-page>
  `,
})
export class CarCard implements OnInit {
  private readonly api = inject(CarApi);
  private readonly siteApi = inject(SiteApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly card = signal<CarListing | null>(null);
  readonly site = signal<SiteSettings | null>(null);
  readonly busy = signal(false);
  readonly uploading = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly statuses = (Object.entries(LISTING_STATUS_LABELS) as [ListingStatus, string][]).map(
    ([value, label]) => ({ value, label }),
  );
  readonly regNo = this.fb.nonNullable.control('');
  readonly media = (path: string | null) => (path ? environment.apiUrl + path : '');

  readonly form = this.fb.nonNullable.group({
    make: '',
    model: '',
    variant: '',
    year: null as number | null,
    mil: null as number | null,
    color: '',
    fuel: '',
    gearbox: '',
    powerHp: null as number | null,
    bodyText: '',
    inspectionDue: '',
    title: '',
    priceKr: null as number | null,
    status: 'draft' as ListingStatus,
    description: '',
    equipment: '',
  });

  readonly inquiriesNewestFirst = computed(() =>
    [...(this.card()?.inquiries ?? [])].sort((a, b) => b.at.localeCompare(a.at)),
  );

  /** Annonsens adress för den som vill se den: plattformens adress, annars en aktiv egen domän. */
  readonly publicUrl = computed(() => {
    const c = this.card();
    const s = this.site();
    if (!c || !s?.enabled) return null;
    const domain = s.domains.find((d) => d.status === 'active');
    if (domain) return `https://${domain.hostname}/bil/${c.id}`;
    return s.slug ? `${globalThis.location?.origin ?? ''}/bilhandel/${s.slug}/bil/${c.id}` : null;
  });

  ngOnInit() {
    this.siteApi.get().subscribe((s) => this.site.set(s));
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.api.get(id).subscribe((c) => this.show(c));
  }

  hasUnsaved() {
    return this.form.dirty;
  }

  private show(c: CarListing) {
    this.card.set(c);
    this.form.reset({
      make: c.make ?? '',
      model: c.model ?? '',
      variant: c.variant ?? '',
      year: c.year,
      mil: c.mileageKm == null ? null : Math.round(c.mileageKm / 10),
      color: c.color ?? '',
      fuel: c.fuel ?? '',
      gearbox: c.gearbox ?? '',
      powerHp: c.powerHp,
      bodyText: c.bodyText ?? '',
      inspectionDue: c.inspectionDue ?? '',
      title: c.title ?? '',
      priceKr: c.price == null ? null : c.price / 100,
      status: c.status,
      description: c.description ?? '',
      equipment: c.equipment.join('\n'),
    });
  }

  private fail(e: ApiError, fallback: string) {
    this.busy.set(false);
    this.error.set(e.error?.error?.message ?? fallback);
  }

  create() {
    const regNo = this.regNo.value.trim();
    if (regNo.length < 2) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.create(regNo).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.router.navigate(['/dealership', c.id], { replaceUrl: true });
      },
      error: (e: ApiError) =>
        this.fail(
          e,
          e.status === 409 ? 'Den bilen ligger redan bland era bilar.' : 'Det gick inte att skapa.',
        ),
    });
  }

  private body() {
    const v = this.form.getRawValue();
    const text = (s: string | null) => s?.trim() || null;
    const num = (n: unknown) => (n === null || n === '' || n === undefined ? null : Number(n));
    const kr = num(v.priceKr);
    const mil = num(v.mil);
    return {
      make: text(v.make),
      model: text(v.model),
      variant: text(v.variant),
      year: num(v.year),
      mileageKm: mil === null ? null : Math.round(mil * 10),
      color: text(v.color),
      fuel: text(v.fuel),
      gearbox: text(v.gearbox),
      powerHp: num(v.powerHp),
      bodyText: text(v.bodyText),
      inspectionDue: v.inspectionDue || null,
      title: text(v.title),
      price: kr === null ? null : Math.round(kr * 100),
      status: v.status,
      description: text(v.description),
      equipment: (v.equipment ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  save(status?: ListingStatus) {
    const c = this.card();
    if (!c) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.update(c.id, { ...this.body(), ...(status ? { status } : {}) }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.show(r);
        this.snack.open('Sparat', undefined, { duration: 2000 });
      },
      error: (e: ApiError) => this.fail(e, 'Det gick inte att spara.'),
    });
  }

  publish() {
    this.save('active');
  }

  refresh() {
    const c = this.card();
    if (!c) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.refresh(c.id).subscribe({
      next: (r) => {
        this.busy.set(false);
        // Bara registrets fält byts: det man skrivit i formuläret är kvar.
        const facts = {
          make: r.make ?? '',
          model: r.model ?? '',
          year: r.year,
          mil: r.mileageKm == null ? null : Math.round(r.mileageKm / 10),
          color: r.color ?? '',
          fuel: r.fuel ?? '',
          gearbox: r.gearbox ?? '',
          powerHp: r.powerHp,
          bodyText: r.bodyText ?? '',
          inspectionDue: r.inspectionDue ?? '',
        };
        this.form.patchValue(facts);
        this.form.markAsDirty();
        this.snack.open('Uppgifterna är hämtade. Spara för att behålla dem.', undefined, {
          duration: 3000,
        });
      },
      error: (e: ApiError) => this.fail(e, 'Registret kunde inte läsas just nu.'),
    });
  }

  /** Laddar upp valda foton ett i taget (krympta), och visar dem efter hand. */
  async upload(input: HTMLInputElement) {
    const c = this.card();
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!c || !files.length) return;
    this.busy.set(true);
    this.error.set(null);
    let cur = c;
    for (const [i, f] of files.entries()) {
      this.uploading.set(`${i + 1} av ${files.length}`);
      try {
        const small = await shrinkImage(f);
        cur = await new Promise<CarListing>((resolve, reject) =>
          this.api.addImage(cur.id, small).subscribe({ next: resolve, error: reject }),
        );
        this.patchImages(cur);
      } catch (e) {
        this.error.set(
          (e as ApiError).error?.error?.message ??
            `${f.name}: bilden måste vara JPEG, PNG eller WebP.`,
        );
        break;
      }
    }
    this.uploading.set(null);
    this.busy.set(false);
  }

  /** Bilderna sparas direkt och rör inte det som står i formuläret. */
  private patchImages(r: CarListing) {
    this.card.update((c) => (c ? { ...c, images: r.images, imageUrls: r.imageUrls } : c));
  }

  private saveImages(images: string[]) {
    const c = this.card();
    if (!c) return;
    this.busy.set(true);
    this.api.update(c.id, { images }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.patchImages(r);
      },
      error: (e: ApiError) => this.fail(e, 'Det gick inte att ändra bilderna.'),
    });
  }

  moveImage(i: number, step: -1 | 1) {
    const imgs = [...(this.card()?.images ?? [])];
    const j = i + step;
    if (j < 0 || j >= imgs.length) return;
    [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
    this.saveImages(imgs);
  }

  removeImage(i: number) {
    this.saveImages((this.card()?.images ?? []).filter((_, k) => k !== i));
  }

  remove() {
    const c = this.card()!;
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Ta bort ${c.heading}?`,
          message: 'Annonsen och dess bilder tas bort. Det går inte att ångra.',
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) =>
          ok &&
          this.api.remove(c.id).subscribe(() => {
            this.form.markAsPristine();
            this.router.navigate(['/dealership']);
          }),
      );
  }
}
