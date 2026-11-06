import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { CarApi, SiteApi } from '../../core/api/car-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import { Auth } from '../../core/auth/auth';
import { shrinkImage } from '../../core/image-resize';
import {
  BLOCKET_STATE_LABELS,
  BlocketAdState,
  BlocketStatus,
  CarCost,
  CarListing,
  LISTING_STATUS_LABELS,
  ListingStatus,
  SiteSettings,
  VatScheme,
} from '../../core/models';
import { today } from '../../core/service-pricing';
import { CarBooks, carEconomy } from '../../shared/car-economy';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { VAT_OPTIONS } from '../../shared/vat';

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
      [listLink]="listLink()"
      listLabel="Bilar"
      [wide]="true"
      newTitle="Ny bil"
      [title]="card()?.heading ?? ''"
      [code]="card()?.regNo ?? null"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          @if (!c.soldCardId) {
            <button
              mat-icon-button
              class="!text-red-700"
              aria-label="Ta bort"
              matTooltip="Ta bort annonsen"
              (click)="remove()"
            >
              <mat-icon>delete_outline</mat-icon>
            </button>
          }
          @if (publicUrl(); as url) {
            <a mat-stroked-button [href]="url" target="_blank" rel="noopener">
              <mat-icon>open_in_new</mat-icon> Visa annonsen
            </a>
          }
          @if (c.status === 'draft') {
            <button mat-stroked-button type="button" (click)="publish()" [disabled]="busy()">
              Lägg ut till salu
            </button>
          }
          @if (!c.soldCardId) {
            <a mat-stroked-button routerLink="/sales/new" [queryParams]="{ carId: c.id }">
              <mat-icon>point_of_sale</mat-icon> Sälj bilen
            </a>
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
          @if (c.soldCardId) {
            <app-callout
              tone="info"
              [fixes]="[
                { label: 'Öppna säljkortet', icon: 'open_in_new', link: ['/sales', c.soldCardId] },
              ]"
            >
              Bilen är såld och bokförd. Pris, inköp, kostnader och status är låsta. Återöppna
              säljkortet om något ska ändras.
            </app-callout>
          }
          <form [formGroup]="form" class="grid items-start gap-4 lg:grid-cols-5">
            <section class="rounded-xl bg-white p-5 shadow-sm lg:col-span-3 lg:col-start-1">
              <div class="mb-3 flex flex-wrap items-center gap-2">
                <h2 class="flex-1 text-base font-semibold">Bilen</h2>
                <button
                  mat-stroked-button
                  type="button"
                  (click)="refresh()"
                  [disabled]="busy()"
                  matTooltip="Läser registret igen."
                >
                  <mat-icon>sync</mat-icon> Uppdatera från registret
                </button>
              </div>
              @if (factsMissing()) {
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
                    <mat-label>Årsmodell</mat-label>
                    <input matInput type="number" formControlName="year" />
                  </mat-form-field>
                </div>
              } @else {
                <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  @for (f of facts(); track f.label) {
                    <div>
                      <dt class="text-xs text-gray-500">{{ f.label }}</dt>
                      <dd class="font-medium">{{ f.value }}</dd>
                    </div>
                  }
                </dl>
              }
            </section>

            <section class="rounded-xl bg-white p-5 shadow-sm lg:col-span-3 lg:col-start-1">
              <h2 class="mb-3 text-base font-semibold">Annonsen</h2>
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <div class="flex-1 text-sm font-medium">Bilder</div>
                <button
                  mat-stroked-button
                  type="button"
                  (click)="files.click()"
                  [disabled]="busy()"
                >
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
              @if (uploading(); as u) {
                <p class="mb-2 text-sm text-gray-600">Laddar upp {{ u }}…</p>
              }
              <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
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
                    Inga bilder än. Minst en bild behövs för att lägga ut bilen.
                  </p>
                }
              </div>
              <div class="grid gap-x-4 sm:grid-cols-2">
                <mat-form-field class="sm:col-span-2">
                  <mat-label>Rubrik</mat-label>
                  <input matInput formControlName="title" maxlength="100" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Pris (kr, tomt = på förfrågan)</mat-label>
                  <input matInput type="number" min="0" formControlName="priceKr" />
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
              <div class="mb-1 flex items-center">
                <div class="flex-1 text-sm font-medium">Beskrivning</div>
                <button mat-button type="button" (click)="rewriteDescription()">
                  <mat-icon>auto_fix_high</mat-icon> Skriv om från bilens uppgifter
                </button>
              </div>
              <mat-form-field class="w-full">
                <textarea
                  matInput
                  rows="4"
                  maxlength="5000"
                  formControlName="description"
                  aria-label="Beskrivning"
                ></textarea>
              </mat-form-field>
              <div class="mb-1 text-sm font-medium">Utrustning</div>
              <div class="flex flex-wrap items-center gap-2">
                @for (e of equipmentList(); track e; let i = $index) {
                  <span
                    class="inline-flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pr-0.5 pl-3 text-sm"
                  >
                    {{ e }}
                    <button
                      mat-icon-button
                      type="button"
                      class="!h-7 !w-7 !p-0"
                      [attr.aria-label]="'Ta bort ' + e"
                      (click)="removeEquipment(i)"
                    >
                      <mat-icon class="!text-base">close</mat-icon>
                    </button>
                  </span>
                }
                <input
                  #eq
                  class="h-9 min-w-48 flex-1 px-3 text-sm field"
                  placeholder="Lägg till, tryck Enter"
                  maxlength="80"
                  (keydown.enter)="$event.preventDefault(); addEquipment(eq)"
                  (blur)="addEquipment(eq)"
                />
              </div>
              @if (error(); as e) {
                <p class="text-sm text-red-700">{{ e }}</p>
              }
            </section>

            <section class="rounded-xl bg-white p-5 shadow-sm lg:col-span-3 lg:col-start-1">
              <div class="mb-1 flex flex-wrap items-center gap-3">
                <h2 class="flex-1 text-base font-semibold">Blocket</h2>
                @if (c.blocket.state !== 'off') {
                  <app-pill [tone]="blocketTone(c.blocket.state)">{{
                    blocketLabel(c.blocket.state)
                  }}</app-pill>
                }
              </div>
              <p class="mb-3 text-sm text-gray-600">{{ blocketHint() }}</p>
              @if (c.blocket.message) {
                <p class="mb-3 text-sm" [class.text-red-700]="c.blocket.state === 'error'">
                  {{ c.blocket.message }}
                </p>
              }
              <div class="flex flex-wrap items-center gap-2">
                @if (!c.blocket.enabled) {
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="setBlocket(true)"
                    [disabled]="busy() || form.dirty"
                  >
                    <mat-icon>campaign</mat-icon> Lägg ut på Blocket
                  </button>
                } @else {
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="setBlocket(false)"
                    [disabled]="busy() || form.dirty"
                  >
                    Ta bort från Blocket
                  </button>
                  @if (c.blocket.state === 'error') {
                    <button
                      mat-stroked-button
                      type="button"
                      (click)="setBlocket(true)"
                      [disabled]="busy() || form.dirty"
                    >
                      Försök igen
                    </button>
                  }
                }
                @if (blocketMissing()) {
                  <button mat-button type="button" (click)="openConnections()">
                    Anslut Blocket
                  </button>
                }
                @if (form.dirty) {
                  <span class="text-xs text-gray-500">Spara ändringarna först.</span>
                }
              </div>
            </section>

            <section
              class="rounded-xl bg-white p-5 shadow-sm lg:col-span-2 lg:col-start-4 lg:row-span-2 lg:row-start-1"
            >
              <h2 class="mb-3 text-base font-semibold">Ekonomi</h2>

              <div class="sec">Inköp</div>
              <mat-form-field class="w-full">
                <mat-label>Köpt av</mat-label>
                <mat-select formControlName="purchaseVat">
                  <mat-option [value]="0">Privatperson</mat-option>
                  <mat-option [value]="25">Företag (moms på fakturan)</mat-option>
                </mat-select>
              </mat-form-field>
              <div class="grid gap-x-3 sm:grid-cols-2">
                <mat-form-field>
                  <mat-label>Inköpspris (kr)</mat-label>
                  <input matInput type="number" min="0" formControlName="purchaseKr" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Inköpsdatum</mat-label>
                  <input matInput type="date" formControlName="purchaseDate" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Säljarens namn</mat-label>
                  <input matInput formControlName="seller" maxlength="120" autocomplete="off" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Person-/org.nr</mat-label>
                  <input matInput formControlName="sellerId" maxlength="30" autocomplete="off" />
                </mat-form-field>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                @for (d of card()?.purchaseDocuments ?? []; track d; let i = $index) {
                  <span
                    class="inline-flex items-center gap-1 rounded-full border border-gray-300 py-0.5 pr-0.5 pl-3 text-sm"
                  >
                    <button type="button" class="underline" (click)="openDocument(d)">
                      {{ documentLabel(d, i) }}
                    </button>
                    <button
                      mat-icon-button
                      type="button"
                      class="!h-7 !w-7 !p-0"
                      [attr.aria-label]="'Ta bort ' + documentLabel(d, i)"
                      (click)="removeDocument(d, i)"
                    >
                      <mat-icon class="!text-base">close</mat-icon>
                    </button>
                  </span>
                }
                <input
                  #docInput
                  type="file"
                  class="hidden"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  multiple
                  (change)="uploadDocuments(docInput)"
                />
                <button
                  mat-stroked-button
                  type="button"
                  [disabled]="busy()"
                  (click)="docInput.click()"
                >
                  <mat-icon>upload_file</mat-icon> Köpebrev
                </button>
              </div>

              <div class="sec pt-5">Kostnader</div>
              <div formArrayName="costs">
                @for (g of costRows.controls; track g; let i = $index) {
                  <div
                    [formGroupName]="i"
                    class="grid items-start gap-x-2 grid-cols-[minmax(0,1fr)_6rem_auto] border-b border-gray-100 pb-1 mb-2"
                  >
                    <mat-form-field subscriptSizing="dynamic" class="col-span-3 mb-2">
                      <mat-label>Vad</mat-label>
                      <input matInput formControlName="label" maxlength="80" autocomplete="off" />
                    </mat-form-field>
                    <mat-form-field subscriptSizing="dynamic" class="mb-1">
                      <mat-label>Belopp (kr)</mat-label>
                      <input matInput type="number" min="0" formControlName="amountKr" />
                    </mat-form-field>
                    <mat-form-field subscriptSizing="dynamic" class="mb-1">
                      <mat-label>Moms</mat-label>
                      <mat-select formControlName="vatRate">
                        @for (r of costVatRates; track r) {
                          <mat-option [value]="r">{{ r }} %</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    <button
                      mat-icon-button
                      type="button"
                      (click)="removeCost(i)"
                      aria-label="Ta bort kostnaden"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                }
              </div>
              <button
                mat-stroked-button
                type="button"
                (click)="addCost()"
                [disabled]="!!card()?.soldCardId"
              >
                <mat-icon>add</mat-icon> Lägg till
              </button>

              @if (form.controls.status.value === 'sold') {
                <div class="sec pt-5">Såld</div>
                <div class="grid gap-x-3 sm:grid-cols-2">
                  <mat-form-field>
                    <mat-label>Såld för (kr)</mat-label>
                    <input matInput type="number" min="0" formControlName="soldKr" />
                  </mat-form-field>
                  <mat-form-field>
                    <mat-label>Såld den</mat-label>
                    <input matInput type="date" formControlName="soldAt" />
                  </mat-form-field>
                </div>
              }

              <div class="sec pt-5">Resultat</div>
              @if (live(); as e) {
                @if (e.salePrice === null || e.totalCost === null) {
                  <p class="text-sm text-gray-600">
                    Fyll i pris och inköpspris för att se vinsten.
                  </p>
                } @else {
                  <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                    <dt>{{ e.basis === 'sold' ? 'Såld för' : 'Pris' }}</dt>
                    <dd class="text-right tabular-nums">{{ e.salePrice | kr }}</dd>
                    <dt class="text-gray-600">Inköp</dt>
                    <dd class="text-right tabular-nums text-gray-600">
                      −{{ paid().purchase | kr }}
                    </dd>
                    <dt class="text-gray-600">Kostnader</dt>
                    <dd class="text-right tabular-nums text-gray-600">−{{ paid().costs | kr }}</dd>
                    <dt class="text-gray-600">
                      {{ (e.vatToPay ?? 0) < 0 ? 'Moms tillbaka' : 'Moms' }}
                    </dt>
                    <dd class="text-right tabular-nums text-gray-600">
                      {{ (e.vatToPay ?? 0) < 0 ? '+' : '−' }}{{ abs(e.vatToPay) | kr }}
                    </dd>
                    <dt class="border-t border-gray-200 pt-1.5 text-base font-semibold">Vinst</dt>
                    <dd
                      class="border-t border-gray-200 pt-1.5 text-right text-base font-semibold tabular-nums"
                      [class.text-red-700]="(e.profit ?? 0) < 0"
                      [class.text-green-700]="(e.profit ?? 0) >= 0"
                    >
                      {{ e.profit | kr }}
                    </dd>
                  </dl>
                }
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
  private readonly workshop = inject(WorkshopApi);
  private readonly auth = inject(Auth);

  readonly card = signal<CarListing | null>(null);
  /** Blocket-anslutningen; bara ägaren får läsa den, så för övriga är den okänd. */
  readonly blocketConnection = signal<BlocketStatus | null>(null);
  private blocketTimer: ReturnType<typeof setInterval> | null = null;
  readonly site = signal<SiteSettings | null>(null);
  readonly busy = signal(false);
  readonly uploading = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly statuses = (Object.entries(LISTING_STATUS_LABELS) as [ListingStatus, string][]).map(
    ([value, label]) => ({ value, label }),
  );
  readonly regNo = this.fb.nonNullable.control('');
  readonly media = (path: string | null) => (path ? environment.apiUrl + path : '');

  readonly costRows = this.fb.array<FormGroup>([]);
  readonly costVatRates = VAT_OPTIONS;
  /** Sant medan formuläret fylls från servern, så att fältens följdregler inte skriver över det. */
  private resetting = false;

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
    purchaseKr: null as number | null,
    purchaseVat: 0,
    purchaseDate: '',
    seller: '',
    sellerId: '',
    vatScheme: 'margin' as VatScheme,
    soldKr: null as number | null,
    soldAt: '',
    costs: this.costRows as FormArray,
  });

  private readonly values = toSignal(this.form.valueChanges, { initialValue: null });

  /** Vad bilen ger, räknat på det som står i formuläret just nu. */
  readonly live = computed(() => {
    this.values();
    return carEconomy(this.books());
  });
  /** Vad som betalats ut för bilen och på den, med moms som på fakturorna. */
  readonly paid = computed(() => {
    this.values();
    const b = this.books();
    return {
      purchase: b.purchase?.price ?? 0,
      costs: b.costs.reduce((sum, c) => sum + c.amount, 0),
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopWatchingBlocket());
    // Momsen vid försäljning följer av inköpet: utan moms på köpet gäller vinstmarginalbeskattning
    // (VMB), med moms på köpet gäller vanlig moms. Användaren väljer inget av det.
    this.form.controls.purchaseVat.valueChanges.pipe(takeUntilDestroyed()).subscribe((rate) => {
      if (!this.resetting) {
        this.form.controls.vatScheme.setValue(Number(rate) > 0 ? 'standard' : 'margin');
      }
    });
    this.form.controls.status.valueChanges.pipe(takeUntilDestroyed()).subscribe((status) => {
      if (this.resetting || status !== 'sold') return;
      const f = this.form.controls;
      if (f.soldKr.value == null) f.soldKr.setValue(f.priceKr.value);
      if (!f.soldAt.value) f.soldAt.setValue(today());
    });
  }

  /** Tillbaka till fliken bilen hör till: Inköpta, Till salu eller Sålda. */
  readonly listLink = computed(() => {
    const st = this.card()?.status;
    return st === 'draft'
      ? '/dealership/cars/purchases'
      : st === 'sold'
        ? '/dealership/cars/sold'
        : '/dealership/cars';
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
    if (this.auth.isAdmin())
      this.workshop.blocket().subscribe((s) => this.blocketConnection.set(s));
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.api.get(id).subscribe((c) => this.show(c));
  }

  hasUnsaved() {
    return this.form.dirty;
  }

  private show(c: CarListing) {
    this.card.set(c);
    this.resetting = true;
    this.costRows.clear();
    c.costs.forEach((x) => this.costRows.push(this.costGroup(x)));
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
      title: c.title ?? c.heading,
      priceKr: c.price == null ? null : c.price / 100,
      status: c.status,
      description: c.description ?? this.autoDescription(c),
      equipment: c.equipment.join('\n'),
      purchaseKr: c.purchase ? c.purchase.price / 100 : null,
      purchaseVat: c.purchase?.vatRate ?? 0,
      purchaseDate: c.purchase?.date ?? '',
      seller: c.purchase?.seller ?? '',
      sellerId: c.purchase?.sellerId ?? '',
      vatScheme: c.vatScheme,
      soldKr: c.soldPrice == null ? null : c.soldPrice / 100,
      soldAt: c.soldAt ?? '',
      costs: c.costs.map((x) => ({
        id: x.id,
        label: x.label,
        amountKr: x.amount / 100,
        vatRate: x.vatRate,
      })),
    });
    this.lockMoney(!!c.soldCardId);
    this.resetting = false;
    this.watchBlocket();
  }

  readonly blocketLabel = (state: BlocketAdState) => BLOCKET_STATE_LABELS[state];
  readonly blocketTone = (state: BlocketAdState) =>
    ({
      live: 'green',
      pending: 'blue',
      hidden: 'amber',
      error: 'red',
      removed: 'gray',
      off: 'gray',
    })[state] as 'green' | 'blue' | 'amber' | 'red' | 'gray';

  /** Ägaren ser att Blocket inte är anslutet och kan gå dit; för personalen vet vi inte. */
  readonly blocketMissing = computed(() => {
    const s = this.blocketConnection();
    return s !== null && !s.connected;
  });

  /** Vad som händer med bilen på Blocket just nu, i en mening. */
  readonly blocketHint = computed(() => {
    const c = this.card();
    if (!c) return '';
    const b = c.blocket;
    if (!b.enabled) {
      return 'Bilen läggs ut på Blocket och Bytbil medan den är till salu och tas ner när den är såld.';
    }
    if (c.status === 'draft') return 'Bilen skickas till Blocket när den har status Till salu.';
    if (c.status === 'sold') return 'Annonsen är nedtagen från Blocket eftersom bilen är såld.';
    if (this.blocketConnection()?.connected && this.blocketConnection()?.live === false) {
      return 'Provläge: annonsen skickas dold och syns bara i Blockets adminpanel. Slå på publicering under Inställningar, Anslutningar.';
    }
    return b.blocketAdId
      ? `Annonsen ändras på Blocket när du sparar bilen. Annons-id ${b.blocketAdId}.`
      : 'Annonsen ändras på Blocket när du sparar bilen.';
  });

  setBlocket(enabled: boolean) {
    const c = this.card();
    if (!c) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.setBlocket(c.id, enabled).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.takeBlocket(r);
      },
      error: (e: ApiError) => this.fail(e, 'Det gick inte att ändra Blocket.'),
    });
  }

  openConnections() {
    void import('../settings/settings').then((m) => m.openSettings(this.dialog, 'anslutningar'));
  }

  /** Bara annonsens status byts: det som står osparat i formuläret ska vara kvar. */
  private takeBlocket(r: CarListing) {
    this.card.update((x) => (x ? { ...x, blocket: r.blocket } : x));
    this.watchBlocket();
  }

  /** Blocket behandlar en annons efteråt, så medan den är på gång läser vi av den var fjärde sekund. */
  private watchBlocket() {
    this.stopWatchingBlocket();
    if (this.card()?.blocket.state !== 'pending') return;
    let tries = 0;
    this.blocketTimer = setInterval(() => {
      const c = this.card();
      if (!c || ++tries > 20) return this.stopWatchingBlocket();
      this.api.refreshBlocket(c.id).subscribe({
        next: (r) => {
          this.card.update((x) => (x ? { ...x, blocket: r.blocket } : x));
          if (r.blocket.state !== 'pending') this.stopWatchingBlocket();
        },
        error: () => this.stopWatchingBlocket(),
      });
    }, 4000);
  }

  private stopWatchingBlocket() {
    if (this.blocketTimer) clearInterval(this.blocketTimer);
    this.blocketTimer = null;
  }

  /** En bil såld på ett bokfört säljkort har låsta pengar: fälten är avstängda och skickas inte med. */
  private lockMoney(locked: boolean) {
    const f = this.form.controls;
    const money = [
      f.priceKr,
      f.status,
      f.purchaseKr,
      f.purchaseVat,
      f.purchaseDate,
      f.seller,
      f.sellerId,
      f.vatScheme,
      f.soldKr,
      f.soldAt,
      this.costRows,
    ];
    for (const c of money) {
      if (locked) c.disable({ emitEvent: false });
      else c.enable({ emitEvent: false });
    }
  }

  private costGroup(c?: CarCost) {
    return this.fb.nonNullable.group({
      id: c?.id ?? crypto.randomUUID(),
      label: c?.label ?? '',
      amountKr: c ? c.amount / 100 : (null as number | null),
      vatRate: c?.vatRate ?? 25,
    });
  }

  addCost() {
    this.costRows.push(this.costGroup());
    this.form.markAsDirty();
  }

  removeCost(i: number) {
    this.costRows.removeAt(i);
    this.form.markAsDirty();
  }

  /** Bilens uppgifter som små rader på kortet; fälten visas bara när registret inte kunde läsas. */
  readonly facts = computed(() => {
    const c = this.card();
    if (!c) return [];
    const rows: { label: string; value: string }[] = [
      { label: 'Märke och modell', value: [c.make, c.model].filter(Boolean).join(' ') || '–' },
      { label: 'Årsmodell', value: c.year ? `${c.year}` : '–' },
      {
        label: 'Miltal',
        value:
          c.mileageKm == null ? '–' : `${Math.round(c.mileageKm / 10).toLocaleString('sv-SE')} mil`,
      },
      { label: 'Drivmedel', value: c.fuel ?? '–' },
      { label: 'Växellåda', value: c.gearbox ?? '–' },
      { label: 'Effekt', value: c.powerHp ? `${c.powerHp} hk` : '–' },
      { label: 'Kaross', value: c.bodyText ?? '–' },
      { label: 'Färg', value: c.color ?? '–' },
      { label: 'Besiktas senast', value: c.inspectionDue ?? '–' },
    ];
    return rows;
  });
  readonly factsMissing = computed(() => {
    const c = this.card();
    return !!c && !c.make && !c.model;
  });

  readonly equipmentList = computed(() => {
    this.values();
    return (this.form.controls.equipment.value ?? '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
  });

  addEquipment(input: HTMLInputElement) {
    const t = input.value.trim();
    input.value = '';
    if (!t || this.equipmentList().includes(t)) return;
    this.form.controls.equipment.setValue([...this.equipmentList(), t].join('\n'));
    this.form.markAsDirty();
  }

  removeEquipment(i: number) {
    this.form.controls.equipment.setValue(
      this.equipmentList()
        .filter((_, k) => k !== i)
        .join('\n'),
    );
    this.form.markAsDirty();
  }

  /** En första beskrivning ur bilens uppgifter, som säljaren sedan kan ändra. */
  private autoDescription(c: CarListing): string {
    const mil =
      c.mileageKm == null
        ? ''
        : ` med ${Math.round(c.mileageKm / 10).toLocaleString('sv-SE')} mil på mätaren`;
    const first = `${c.heading}${c.year ? `, årsmodell ${c.year}` : ''}${mil}.`;
    const specs = [
      c.fuel?.toLowerCase(),
      c.gearbox?.toLowerCase(),
      c.powerHp ? `${c.powerHp} hk` : null,
      c.fourWheelDrive ? 'fyrhjulsdrift' : null,
    ].filter(Boolean);
    const second = specs.length
      ? ` ${specs.join(', ').replace(/^./, (x) => x.toUpperCase())}.`
      : '';
    const third = c.inspectionDue ? ` Besiktigad till ${c.inspectionDue}.` : '';
    return first + second + third;
  }

  rewriteDescription() {
    const c = this.card();
    if (!c) return;
    this.form.controls.description.setValue(this.autoDescription(c));
    this.form.markAsDirty();
  }

  abs(n: number | null) {
    return Math.abs(n ?? 0);
  }

  private ore(n: unknown) {
    return n === null || n === '' || n === undefined ? null : Math.round(Number(n) * 100);
  }

  /** Kostnadsraderna som är ifyllda; `incomplete` = en rad har bara det ena av text och belopp. */
  private costsOf() {
    const rows = this.form.getRawValue().costs as {
      id: string;
      label: string;
      amountKr: number | null;
      vatRate: number;
    }[];
    const costs: CarCost[] = [];
    let incomplete = false;
    for (const r of rows) {
      const label = (r.label ?? '').trim();
      const amount = this.ore(r.amountKr);
      if (!label && amount === null) continue;
      if (!label || amount === null) incomplete = true;
      else costs.push({ id: r.id, label, amount, vatRate: Number(r.vatRate) });
    }
    return { costs, incomplete };
  }

  private books(): CarBooks {
    const v = this.form.getRawValue();
    const purchasePrice = this.ore(v.purchaseKr);
    return {
      price: this.ore(v.priceKr),
      soldPrice: this.ore(v.soldKr),
      status: v.status,
      purchase:
        purchasePrice === null
          ? null
          : {
              price: purchasePrice,
              vatRate: Number(v.purchaseVat),
              date: v.purchaseDate || null,
              seller: v.seller.trim() || null,
              sellerId: v.sellerId.trim() || null,
            },
      costs: this.costsOf().costs,
      vatScheme: v.vatScheme,
    };
  }

  /** Det som står i böckerna men inte går att spara som det är, annars null. */
  private booksProblem(): string | null {
    const v = this.form.getRawValue();
    if (this.costsOf().incomplete) return 'Varje kostnad behöver både text och belopp.';
    const hasSeller = v.seller.trim() || v.sellerId.trim();
    if (this.ore(v.purchaseKr) === null && (hasSeller || v.purchaseDate)) {
      return 'Fyll i inköpspriset, eller töm säljare och datum.';
    }
    if (
      v.status === 'sold' &&
      v.vatScheme === 'margin' &&
      this.ore(v.purchaseKr) !== null &&
      (!v.seller.trim() || !v.sellerId.trim())
    ) {
      return 'Fyll i vem ni köpte bilen av, med namn och person- eller organisationsnummer, innan bilen markeras som såld.';
    }
    return null;
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
        this.router.navigate(['/dealership/cars', c.id], { replaceUrl: true });
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
    const books = this.books();
    const body = {
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
      purchase: books.purchase,
      costs: books.costs,
      vatScheme: v.vatScheme,
      soldPrice: books.soldPrice,
      soldAt: v.soldAt || null,
    };
    if (!this.card()?.soldCardId) return body;
    // Sold on a posted card: only the ad's text and the car's facts may change.
    const { price, status, purchase, costs, vatScheme, soldPrice, soldAt, ...open } = body;
    void [price, status, purchase, costs, vatScheme, soldPrice, soldAt];
    return open;
  }

  save(status?: ListingStatus) {
    const c = this.card();
    if (!c) return;
    const problem = this.booksProblem();
    if (problem) {
      this.error.set(problem);
      return;
    }
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

  documentLabel(name: string, i: number) {
    return `Bilaga ${i + 1} · ${name.endsWith('.pdf') ? 'PDF' : 'bild'}`;
  }

  /** Laddar upp valda köpehandlingar (foton krympta) på bilen. De sparas direkt, som bilderna. */
  async uploadDocuments(input: HTMLInputElement) {
    const c = this.card();
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!c || !files.length) return;
    this.busy.set(true);
    this.error.set(null);
    for (const f of files) {
      try {
        const file = await shrinkImage(f);
        const r = await new Promise<CarListing>((resolve, reject) =>
          this.api.addDocument(c.id, file).subscribe({ next: resolve, error: reject }),
        );
        this.card.update((cur) => (cur ? { ...cur, purchaseDocuments: r.purchaseDocuments } : cur));
      } catch (e) {
        this.error.set(
          (e as ApiError).error?.error?.message ?? `${f.name}: filen måste vara PDF eller en bild.`,
        );
        break;
      }
    }
    this.busy.set(false);
  }

  /** Filen kräver inloggning, så den hämtas och öppnas som en tillfällig länk i en ny flik. */
  openDocument(name: string) {
    const c = this.card();
    if (!c) return;
    const tab = window.open('', '_blank');
    this.api.document(c.id, name).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        tab?.close();
        this.error.set('Det gick inte att öppna filen.');
      },
    });
  }

  removeDocument(name: string, i: number) {
    const c = this.card();
    if (!c) return;
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Ta bort ${this.documentLabel(name, i)}?`,
          message: 'Filen tas bort från bilen. Det går inte att ångra.',
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) =>
          ok &&
          this.api.removeDocument(c.id, name).subscribe({
            next: (r) =>
              this.card.update((cur) =>
                cur ? { ...cur, purchaseDocuments: r.purchaseDocuments } : cur,
              ),
            error: () => this.error.set('Det gick inte att ta bort filen.'),
          }),
      );
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
            this.router.navigate(['/dealership/cars']);
          }),
      );
  }
}
