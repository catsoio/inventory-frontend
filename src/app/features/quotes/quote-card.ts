import { ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, switchMap } from 'rxjs';
import { InventoryApi } from '../../core/api/inventory-api';
import { QuoteApi } from '../../core/api/quote-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import { Auth } from '../../core/auth/auth';
import { appLocale } from '../../core/i18n/locale';
import {
  AnswerMethod,
  APPROVAL_METHOD_LABELS,
  Article,
  Customer,
  QUOTE_STATUS_LABELS,
  QuoteDetail,
  QuoteInput,
  QuoteJob,
  QuoteShownStatus,
  ServiceType,
  WorkOrderLineType,
} from '../../core/models';
import { Pricing } from '../../core/pricing';
import { QuoteSendDialog, type QuoteSendData } from './quote-send-dialog';
import { Confirm } from '../../shared/confirm';
import { LinkResolver } from '../../shared/customer-vehicle-picker/link-resolver';
import type { PickerValue } from '../../shared/customer-vehicle-picker/customer-vehicle-picker';
import { ensureValid } from '../../shared/form-guard';
import {
  STANDARD_VAT,
  inMode,
  rowAmounts,
  rowGross,
  totalsOf,
  type PricedRow,
} from '../../shared/vat';

const ore = (kr: number | null | undefined) =>
  kr == null || (kr as unknown) === '' || Number.isNaN(kr) ? null : Math.round(Number(kr) * 100);
const kr = (o: number | null | undefined) => (o == null ? null : o / 100);

/** En rad som den står i formuläret: priser i kronor. */
interface LineValue {
  id: string | null;
  jobId: string | null;
  type: WorkOrderLineType;
  description: string;
  articleId: string | null;
  code: string;
  quantity: number;
  unitPrice: number | null;
  discountPercent: number;
  vatRate: number;
  system: boolean;
}

const TONES: Record<QuoteShownStatus, 'gray' | 'amber' | 'green' | 'red'> = {
  draft: 'gray',
  given: 'amber',
  approved: 'green',
  declined: 'red',
  expired: 'gray',
};

/**
 * Kostnadsförslaget: säljdokumentet före arbetet. Ett jobb per kundanmärkning med ett pris för
 * arbetet och delar under. Förslaget lämnas till kunden, besvaras ja eller nej, och ett ja blir
 * en intern arbetsorder. Kunden ser aldrig timmar: arbete har ett pris.
 */
@Component({
  selector: 'app-quote-card',
  standalone: false,
  template: `
    <app-card-page
      [wide]="true"
      listLink="/quotes"
      listLabel="Offert"
      newTitle="Ny offert"
      [title]="card() ? card()!.regNo + ' · ' + card()!.customerName : ''"
      [code]="card()?.code ?? null"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          @if (admin && !c.workOrderId) {
            <button
              mat-icon-button
              class="!text-red-700"
              aria-label="Ta bort"
              matTooltip="Ta bort"
              (click)="remove()"
            >
              <mat-icon>delete_outline</mat-icon>
            </button>
          }
          <a
            mat-icon-button
            [routerLink]="['/quotes', c.id, 'print']"
            [disabled]="form.dirty"
            [matTooltip]="form.dirty ? 'Spara först' : 'Skriv ut förslaget'"
            aria-label="Skriv ut förslaget"
          >
            <mat-icon>print</mat-icon>
          </a>
          @if (c.workOrderId) {
            <a mat-stroked-button [routerLink]="['/workorders', c.workOrderId]">
              <mat-icon>handyman</mat-icon> Öppna arbetsorder
            </a>
          } @else if (c.status === 'approved') {
            <button
              mat-flat-button
              color="primary"
              [disabled]="form.dirty || busy()"
              (click)="makeOrder()"
            >
              <mat-icon>handyman</mat-icon> Skapa arbetsorder
            </button>
          } @else if (c.status !== 'declined') {
            <button
              mat-flat-button
              color="primary"
              [disabled]="form.dirty || busy()"
              [matTooltip]="form.dirty ? 'Spara först' : ''"
              (click)="openSend()"
            >
              <mat-icon>send</mat-icon>
              {{ c.sends.length ? 'Skicka igen' : 'Skicka till kund' }}
            </button>
          }
          @if (!c.workOrderId && c.status !== 'approved') {
            <button
              mat-icon-button
              type="button"
              [matMenuTriggerFor]="more"
              [disabled]="busy()"
              aria-label="Fler val"
              matTooltip="Fler val"
            >
              <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #more="matMenu">
              <button mat-menu-item type="button" [disabled]="form.dirty" (click)="copyLink()">
                <mat-icon>link</mat-icon> Kopiera länk
              </button>
              <button mat-menu-item type="button" [disabled]="form.dirty" (click)="give()">
                <mat-icon>outgoing_mail</mat-icon>
                {{ c.givenAt ? 'Lämna på nytt (utan att skicka)' : 'Markera som lämnat' }}
              </button>
              @if (c.shared) {
                <button mat-menu-item type="button" (click)="closeLink()">
                  <mat-icon>link_off</mat-icon> Stäng kundens länk
                </button>
              }
            </mat-menu>
          }
        }
        @if (!locked()) {
          <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
            Spara
          </button>
        }
      </div>

      @if (locked()) {
        <p class="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          <b>Arbetsorder gjord.</b> Förslaget är låst: det är det kunden sa ja till.
        </p>
      }

      <form [formGroup]="form" class="grid gap-4 xl:grid-cols-2">
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Kund och bil</h2>
          <app-customer-vehicle-picker formControlName="link" />
          @if (discountHint(); as d) {
            <p class="mt-1 text-sm text-gray-600">{{ d }}</p>
          }
          <mat-form-field class="mt-3 block w-full">
            <mat-label>Kundanmärkning</mat-label>
            <textarea
              matInput
              rows="2"
              formControlName="remarks"
              placeholder="t.ex. Oljebyte, sensor funkar inte"
            ></textarea>
          </mat-form-field>
        </section>

        <section class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-6">
          <h2 class="mb-2 flex items-center gap-2 text-base font-semibold sm:col-span-6">
            Offert
            @if (card(); as c) {
              <app-pill [tone]="tones[c.shownStatus]">{{ statusLabels[c.shownStatus] }}</app-pill>
            }
          </h2>
          @if (card(); as c) {
            <div class="mb-3 text-sm text-gray-600 sm:col-span-6">
              @if (c.givenAt) {
                Lämnat {{ day(c.givenAt) }}, giltigt till {{ day(c.validUntil) }}. Slutpriset får
                avvika högst {{ c.tolerancePercent }} % från {{ c.givenTotal ?? c.total | kr }}.
              } @else {
                Inte lämnat än. Skicka det till kunden med SMS eller e-post, eller skriv ut det och
                markera det som lämnat.
              }
            </div>
            @if (c.sends.length || c.viewedAt) {
              <ul class="mb-3 space-y-1 text-sm sm:col-span-6">
                @for (x of c.sends; track x.at + x.to) {
                  <li class="flex items-center gap-2">
                    <mat-icon class="!h-5 !w-5 !text-[18px] text-gray-500">{{
                      x.channel === 'sms' ? 'sms' : 'mail'
                    }}</mat-icon>
                    Skickat {{ x.channel === 'sms' ? 'som SMS' : 'som e-post' }} till {{ x.to }},
                    {{ when(x.at) }}
                  </li>
                }
                @if (c.viewedAt) {
                  <li class="flex items-center gap-2 text-emerald-800">
                    <mat-icon class="!h-5 !w-5 !text-[18px]">visibility</mat-icon>
                    Kunden öppnade länken {{ when(c.viewedAt) }}
                  </li>
                } @else if (c.shared && c.sends.length) {
                  <li class="flex items-center gap-2 text-gray-500">
                    <mat-icon class="!h-5 !w-5 !text-[18px]">visibility_off</mat-icon>
                    Kunden har inte öppnat länken än
                  </li>
                }
              </ul>
            }
            @if (c.givenAt && !c.workOrderId) {
              <div class="mb-3 flex flex-wrap items-center gap-2 sm:col-span-6">
                @if (c.approval; as a) {
                  <span class="text-sm">
                    <b>{{ a.status === 'approved' ? 'Kunden sa ja' : 'Kunden sa nej' }}</b>
                    {{ a.method === 'link' ? 'via länken' : '' }} {{ when(a.at) }}
                    {{ a.method && a.method !== 'link' ? '(' + methodLabels[a.method] + ')' : '' }}
                    @if (a.note) {
                      <span class="block text-gray-600">{{ a.note }}</span>
                    }
                  </span>
                  <button mat-button type="button" [disabled]="busy()" (click)="answer(null)">
                    Ångra svaret
                  </button>
                } @else {
                  <button
                    mat-stroked-button
                    type="button"
                    [matMenuTriggerFor]="yes"
                    [disabled]="busy() || form.dirty"
                  >
                    <mat-icon>thumb_up</mat-icon> Kunden sa ja
                  </button>
                  <mat-menu #yes="matMenu">
                    @for (m of answerMethods; track m[0]) {
                      <button mat-menu-item type="button" (click)="answer('approved', m[0])">
                        {{ m[1] }}
                      </button>
                    }
                  </mat-menu>
                  <button
                    mat-stroked-button
                    type="button"
                    [disabled]="busy() || form.dirty"
                    (click)="answer('declined')"
                  >
                    <mat-icon>thumb_down</mat-icon> Kunden sa nej
                  </button>
                }
              </div>
            }
          }
          <mat-form-field class="sm:col-span-2">
            <mat-label>Mätarställning (km)</mat-label>
            <input matInput type="number" inputmode="numeric" min="0" formControlName="mileage" />
          </mat-form-field>
          <mat-form-field class="sm:col-span-2">
            <mat-label>Er referens</mat-label>
            <input matInput formControlName="yourReference" />
          </mat-form-field>
          <mat-form-field class="sm:col-span-2">
            <mat-label>Vår referens</mat-label>
            <input matInput formControlName="ourReference" />
          </mat-form-field>
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm xl:col-span-2">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <h2 class="flex-1 text-base font-semibold">Vad ska göras</h2>
            <button mat-stroked-button type="button" [disabled]="locked()" (click)="addJob()">
              <mat-icon>add</mat-icon> Lägg till jobb
            </button>
          </div>

          @for (job of jobs.controls; track job; let j = $index) {
            @let w = work(job.value.id);
            <div [formGroup]="job" class="mt-3 rounded-xl bg-gray-50 p-3">
              <div class="flex flex-wrap items-end gap-2">
                <mat-form-field class="min-w-48 flex-1" subscriptSizing="dynamic">
                  <mat-label>Vad ska göras</mat-label>
                  <input
                    matInput
                    formControlName="title"
                    autocomplete="off"
                    placeholder="Sök åtgärd eller skriv, t.ex. Byta olja"
                    [matAutocomplete]="svcAuto"
                  />
                  <mat-autocomplete
                    #svcAuto="matAutocomplete"
                    (optionSelected)="addTemplate(job.value.id, $event.option.value)"
                    [displayWith]="serviceName"
                  >
                    @for (s of serviceMatches(job.value.title); track s.id) {
                      <mat-option [value]="s">
                        {{ s.name }}
                        @if (s.priceFrom !== null) {
                          <span class="ml-2 text-xs text-gray-500">{{ s.priceFrom | kr }}</span>
                        }
                      </mat-option>
                    }
                  </mat-autocomplete>
                </mat-form-field>
                @if (w) {
                  <div [formGroup]="w" class="contents">
                    <label class="flex shrink-0 flex-col gap-0.5 text-xs text-gray-500">
                      Pris
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        formControlName="unitPrice"
                        (focus)="$any($event.target).select()"
                        class="h-10 w-28 px-2 text-right text-gray-900 field"
                      />
                    </label>
                    <label class="flex shrink-0 flex-col gap-0.5 text-xs text-gray-500">
                      Rabatt %
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        formControlName="discountPercent"
                        (focus)="$any($event.target).select()"
                        class="h-10 w-16 px-2 text-right text-gray-900 field"
                      />
                    </label>
                  </div>
                }
                <button
                  mat-icon-button
                  type="button"
                  [disabled]="locked()"
                  (click)="removeJob(j)"
                  aria-label="Ta bort jobbet"
                >
                  <mat-icon>delete_outline</mat-icon>
                </button>
              </div>

              @if (partsOf(job.value.id).length) {
                <div class="mt-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
                  Delar
                </div>
              }
              @for (r of partsOf(job.value.id); track r.row) {
                <div
                  [formGroup]="r.row"
                  class="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-white p-3"
                >
                  <div class="relative min-w-48 flex-1">
                    <mat-icon class="pointer-events-none absolute top-2 left-2 text-gray-400"
                      >search</mat-icon
                    >
                    <input
                      formControlName="description"
                      [matAutocomplete]="auto"
                      (input)="edited(r.row)"
                      (focus)="typed(r.row)"
                      autocomplete="off"
                      placeholder="Sök del i lagret…"
                      class="h-10 w-full pr-3 pl-10 field"
                    />
                    <mat-autocomplete
                      #auto="matAutocomplete"
                      (optionSelected)="picked(r.row, $event.option.value)"
                    >
                      @for (a of partResults(); track a.id) {
                        <mat-option [value]="a.id">
                          {{ a.label }}
                          <span class="ml-2 text-xs text-gray-500"
                            >{{ a.sku ?? '' }} · {{ a.quantity }} i lager</span
                          >
                        </mat-option>
                      }
                    </mat-autocomplete>
                  </div>
                  <label class="flex shrink-0 flex-col gap-0.5 text-xs text-gray-500">
                    Antal
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      formControlName="quantity"
                      class="h-10 w-16 px-2 text-center text-gray-900 field"
                    />
                  </label>
                  <label class="flex shrink-0 flex-col gap-0.5 text-xs text-gray-500">
                    À-pris
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      formControlName="unitPrice"
                      (focus)="$any($event.target).select()"
                      class="h-10 w-28 px-2 text-right text-gray-900 field"
                    />
                  </label>
                  <label class="flex shrink-0 flex-col gap-0.5 text-xs text-gray-500">
                    Rabatt %
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      formControlName="discountPercent"
                      (focus)="$any($event.target).select()"
                      class="h-10 w-16 px-2 text-right text-gray-900 field"
                    />
                  </label>
                  <span
                    class="flex h-10 w-28 shrink-0 items-center justify-end text-sm tabular-nums"
                  >
                    {{ live().amounts[r.i] ?? 0 | kr }}
                  </span>
                  <button
                    mat-icon-button
                    type="button"
                    [disabled]="locked()"
                    (click)="removeLine(r.i)"
                    aria-label="Ta bort raden"
                  >
                    <mat-icon>delete_outline</mat-icon>
                  </button>
                </div>
              }

              <div class="mt-2 flex flex-wrap items-center gap-2">
                <button
                  mat-button
                  type="button"
                  [disabled]="locked()"
                  (click)="addPart(job.value.id)"
                >
                  <mat-icon>inventory_2</mat-icon> Lägg till del
                </button>
                <span class="flex-1"></span>
                <span class="text-sm font-semibold tabular-nums">
                  {{ live().jobTotals[job.value.id] ?? 0 | kr }}
                </span>
              </div>
            </div>
          } @empty {
            <p class="mt-2 text-sm text-gray-500">
              Inga jobb än. Lägg till ett jobb, sök en åtgärd eller skriv vad som ska göras.
            </p>
          }
          @if (live().fee > 0) {
            <div
              class="mt-3 flex items-center rounded-xl border border-dashed border-gray-200 p-3 text-sm"
            >
              <span class="flex-1 text-gray-600">{{ pricing.value().consumablesText }}</span>
              <span class="tabular-nums">{{ live().fee | kr }}</span>
            </div>
          }
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm xl:col-span-2">
          <div class="grid max-w-md grid-cols-2 gap-y-1 text-sm xl:ml-auto">
            <span class="text-gray-600">Före rabatt</span>
            <span class="text-right tabular-nums">{{ live().totals.gross | kr }}</span>
            @if (live().totals.discount) {
              <span class="text-green-700">Rabatt</span>
              <span class="text-right text-green-700 tabular-nums"
                >−{{ live().totals.discount | kr }}</span
              >
            }
            <span class="text-gray-600">Summa exkl. moms</span>
            <span class="text-right tabular-nums">{{ live().totals.net | kr }}</span>
            <span class="text-gray-600">Moms</span>
            <span class="text-right tabular-nums">{{ live().totals.vat | kr }}</span>
            @if (live().totals.rounding) {
              <span class="text-gray-600">Öresutjämning</span>
              <span class="text-right tabular-nums">{{ live().totals.rounding! | kr }}</span>
            }
            <span class="border-t pt-1 text-base font-semibold">Att betala</span>
            <span class="border-t pt-1 text-right text-base font-semibold tabular-nums">{{
              live().totals.total | kr
            }}</span>
          </div>
          <p class="mt-2 text-sm text-gray-600 xl:text-right">Alla priser är inkl. moms.</p>
        </section>
      </form>
    </app-card-page>
  `,
})
export class QuoteCard implements OnInit {
  private readonly auth = inject(Auth);
  /** Bara ägare får ta bort. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  readonly pricing = inject(Pricing);
  private readonly api = inject(QuoteApi);
  private readonly links = inject(LinkResolver);
  private readonly workshop = inject(WorkshopApi);
  private readonly inventory = inject(InventoryApi);
  private readonly confirm = inject(Confirm);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly id = this.route.snapshot.paramMap.get('id');

  readonly tones = TONES;
  readonly statusLabels = QUOTE_STATUS_LABELS;
  readonly methodLabels = APPROVAL_METHOD_LABELS;
  /** Hur svaret kom (länk sätts av kundens egen sida, inte här). */
  readonly answerMethods = (
    Object.entries(APPROVAL_METHOD_LABELS) as [AnswerMethod | 'link', string][]
  ).filter(([m]) => m !== 'link') as [AnswerMethod, string][];

  readonly busy = signal(false);
  readonly card = signal<QuoteDetail | null>(null);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly customer = signal<Customer | null>(null);
  readonly locked = computed(() => !!this.card()?.workOrderId);
  readonly partResults = signal<Article[]>([]);
  private readonly partSearch = new Subject<string>();
  /** Räknas om när något i formuläret ändras, så att summan följer med. */
  private readonly version = signal(0);

  readonly jobs = this.fb.array<FormGroup>([]);
  readonly lines = this.fb.array<FormGroup>([]);
  readonly form = this.fb.nonNullable.group({
    link: [null as PickerValue | null, Validators.required],
    remarks: [''],
    mileage: [null as number | null, Validators.min(0)],
    yourReference: [''],
    ourReference: [''],
    jobs: this.jobs,
    lines: this.lines,
  });

  /** Priset medan man skriver, med samma motor som backend. */
  readonly live = computed(() => {
    this.version();
    const lines = this.lines.getRawValue() as LineValue[];
    const s = this.pricing.value();
    const priced = (l: LineValue): PricedRow => ({
      quantity: Number(l.quantity) || 0,
      unitPrice: ore(l.unitPrice) ?? 0,
      discountPercent: Number(l.discountPercent) || 0,
      vatRate: l.vatRate,
      group: l.jobId,
    });
    const charged = lines.map((l, i) => ({ l, i })).filter(({ l }) => !l.system);
    const rows: PricedRow[] = charged.map(({ l }) => priced(l));
    // Förbrukningsmaterial: en andel av arbetet efter radernas rabatt, med tak.
    const labour = charged
      .filter(({ l }) => l.type === 'labour')
      .reduce((sum, { l }) => sum + rowGross(priced(l)), 0);
    let fee = s.consumablesPercent ? Math.round((labour * s.consumablesPercent) / 100) : 0;
    if (s.consumablesMax != null) fee = Math.min(fee, s.consumablesMax);
    if (fee > 0) rows.push({ quantity: 1, unitPrice: fee, vatRate: STANDARD_VAT, group: null });
    const list = rowAmounts(rows, null, []);
    const amounts: Record<number, number> = {};
    charged.forEach(({ i }, k) => (amounts[i] = list[k]));
    const jobTotals: Record<string, number> = {};
    charged.forEach(({ l, i }) => {
      if (l.jobId) jobTotals[l.jobId] = (jobTotals[l.jobId] ?? 0) + (amounts[i] ?? 0);
    });
    return {
      amounts,
      jobTotals,
      fee,
      totals: totalsOf(rows, null, {
        pricesIncludeVat: this.card()?.pricesIncludeVat ?? true,
        roundToKrona: this.card()?.roundToKrona ?? s.roundToKrona,
        groups: [],
      }),
    };
  });

  readonly discountHint = computed(() => {
    const c = this.customer();
    if (!c) return '';
    const parts = [
      c.labourDiscount ? `${c.labourDiscount} % på arbete` : '',
      c.partsDiscount ? `${c.partsDiscount} % på delar` : '',
    ].filter(Boolean);
    return parts.length ? `Kundrabatt ${parts.join(', ')}: förifylls på nya rader.` : '';
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.version.update((n) => n + 1));
    this.form.controls.link.valueChanges.subscribe((v) => this.loadCustomer(v?.customerId));
    this.partSearch
      .pipe(
        debounceTime(200),
        switchMap((q) => this.inventory.articles({ q, limit: 8 })),
      )
      .subscribe((p) => this.partResults.set(p.items));
  }

  ngOnInit() {
    this.workshop.serviceTypes().subscribe((l) => this.serviceTypes.set(l));
    if (this.id) {
      this.load();
      return;
    }
    this.form.patchValue({ ourReference: this.auth.user()?.name ?? '' }, { emitEvent: false });
    // Länkar från kund- och bilkorten fyller i vem det gäller.
    const q = this.route.snapshot.queryParamMap;
    const customerId = q.get('customerId');
    const vehicleId = q.get('vehicleId');
    if (customerId || vehicleId) {
      this.form.controls.link.setValue({
        customerId: customerId ?? '',
        vehicleId: vehicleId ?? '',
      });
    }
  }

  day(iso: string | null | undefined) {
    return iso ? new Date(iso).toLocaleDateString(appLocale()) : '–';
  }

  private loadCustomer(customerId: string | undefined) {
    if (!customerId) {
      this.customer.set(null);
      return;
    }
    if (this.customer()?.id === customerId) return;
    this.workshop.customer(customerId).subscribe((c) => this.customer.set(c));
  }

  private newJob(init?: Partial<QuoteJob>) {
    const job = this.fb.group({
      id: [init?.id ?? crypto.randomUUID()],
      title: [init?.title ?? '', Validators.required],
    });
    // Jobbets arbetsrad bär jobbets text, så att dokumenten visar den.
    job.controls.title.valueChanges.subscribe((t) =>
      this.work(job.value.id as string)?.patchValue({ description: t }, { emitEvent: false }),
    );
    return job;
  }

  private newLine(init: Partial<LineValue> & { type: WorkOrderLineType }) {
    return this.fb.nonNullable.group({
      id: [init.id ?? (null as string | null)],
      articleId: [init.articleId ?? (null as string | null)],
      type: [init.type],
      description: [init.description ?? ''],
      quantity: [init.quantity ?? 1],
      jobId: [init.jobId ?? (null as string | null)],
      code: [init.code ?? ''],
      unitPrice: [init.unitPrice ?? (null as number | null)],
      discountPercent: [init.discountPercent ?? 0],
      vatRate: [init.vatRate ?? STANDARD_VAT],
      system: [init.system ?? false],
    });
  }

  /** Jobbets egen rad: själva arbetet med pris och rabatt. Delarna är övriga rader under jobbet. */
  work(jobId: string): FormGroup | null {
    return (
      this.lines.controls.find(
        (l) => l.value.jobId === jobId && l.value.type === 'labour' && !l.value.system,
      ) ?? null
    );
  }

  /** Ser till att varje jobb har sin arbetsrad. */
  private ensureWork(job: FormGroup) {
    const id = job.value.id as string;
    if (this.work(id)) return;
    this.lines.push(
      this.newLine({
        type: 'labour',
        jobId: id,
        description: (job.value.title as string) ?? '',
        discountPercent: this.customer()?.labourDiscount ?? 0,
      }),
    );
  }

  /** Jobbets delar (alla rader utom arbetsraden och systemets rad), med sitt index i `lines`. */
  partsOf(jobId: string) {
    const work = this.work(jobId);
    return this.lines.controls
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => row.value.jobId === jobId && row !== work && !row.value.system);
  }

  /** Åtgärder som matchar det som skrivits i jobbets namn (alla när fältet är tomt). */
  serviceMatches(text: string | null) {
    const q = (typeof text === 'string' ? text : '').trim().toLowerCase();
    return this.serviceTypes()
      .filter((t) => t.active && (!q || t.name.toLowerCase().includes(q)))
      .slice(0, 8);
  }

  readonly serviceName = (v: ServiceType | string | null) =>
    typeof v === 'string' ? v : (v?.name ?? '');

  /** Fyller jobbet från en åtgärd: namn och pris, och mallens delar och avgifter som rader. */
  addTemplate(jobId: string, s: ServiceType) {
    const incl = this.card()?.pricesIncludeVat ?? true;
    const c = this.customer();
    const job = this.jobs.controls.find((g) => g.value.id === jobId);
    const work = this.work(jobId);
    const labour = s.lines?.find((t) => t.type === 'labour');
    if (job) job.patchValue({ title: s.name });
    const price = labour?.unitPrice ?? s.priceFrom;
    if (work) {
      if (work.value.unitPrice == null && price != null) {
        work.patchValue({ unitPrice: kr(inMode(price, incl)) });
      }
      if (!work.value.code) work.patchValue({ code: labour?.code || s.opCode || s.code });
    }
    for (const t of (s.lines ?? []).filter((x) => x.type !== 'labour')) {
      const type: WorkOrderLineType = t.type === 'part' ? 'part' : 'fee';
      this.lines.push(
        this.newLine({
          type,
          jobId,
          code: t.code ?? '',
          description: t.description,
          articleId: t.articleId,
          quantity: t.quantity,
          unitPrice: t.unitPrice == null ? null : kr(inMode(t.unitPrice, incl)),
          discountPercent: (type === 'part' ? c?.partsDiscount : 0) ?? 0,
        }),
      );
    }
    this.form.markAsDirty();
    this.settle();
  }

  addJob() {
    const job = this.newJob();
    this.jobs.push(job);
    this.ensureWork(job);
    this.form.markAsDirty();
    this.settle();
  }

  removeJob(j: number) {
    const id = this.jobs.at(j).value.id as string;
    const run = () => {
      for (let i = this.lines.length - 1; i >= 0; i--) {
        if (this.lines.at(i).value.jobId === id) this.lines.removeAt(i);
      }
      this.jobs.removeAt(j);
      this.form.markAsDirty();
      this.settle();
    };
    const rows = this.partsOf(id).length;
    if (!rows) {
      run();
      return;
    }
    this.confirm
      .ask({
        title: 'Ta bort jobbet?',
        message: `Jobbet och dess ${rows} ${rows === 1 ? 'del' : 'delar'} tas bort när du sparar.`,
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => ok && run());
  }

  addPart(jobId: string) {
    this.lines.push(
      this.newLine({ type: 'part', jobId, discountPercent: this.customer()?.partsDiscount ?? 0 }),
    );
    this.form.markAsDirty();
    this.settle();
  }

  removeLine(i: number) {
    this.lines.removeAt(i);
    this.form.markAsDirty();
    this.settle();
  }

  /** Skriver man om raden är den inte längre kopplad till en lagerartikel. */
  edited(row: FormGroup) {
    row.patchValue({ articleId: null });
    this.typed(row);
  }

  typed(row: FormGroup) {
    this.partSearch.next((row.getRawValue() as { description: string }).description ?? '');
  }

  picked(row: FormGroup, articleId: string) {
    const a = this.partResults().find((x) => x.id === articleId);
    if (!a) return;
    const v = row.getRawValue() as LineValue;
    row.patchValue({
      description: a.label,
      articleId: a.id,
      type: 'part',
      code: v.code || a.sku || '',
      unitPrice: v.unitPrice ?? kr(inMode(a.sellPrice, this.card()?.pricesIncludeVat ?? true)),
      discountPercent: v.discountPercent || this.customer()?.partsDiscount || 0,
    });
    this.form.markAsDirty();
  }

  /**
   * Material-fälten på en ny rad får sin utformning först i en andra rendering; utan den
   * syns raden oformaterad tills man klickar i något (appen kör utan zone.js).
   */
  private settle() {
    this.version.update((n) => n + 1);
    this.cdr.detectChanges();
    setTimeout(() => this.cdr.detectChanges());
  }

  private load() {
    this.api.get(this.id!).subscribe((q) => {
      this.card.set(q);
      this.jobs.clear();
      for (const j of q.jobs) this.jobs.push(this.newJob(j));
      this.lines.clear();
      for (const l of q.lines) {
        this.lines.push(
          this.newLine({
            id: l.id,
            articleId: l.articleId,
            type: l.type,
            description: l.description,
            quantity: l.quantity,
            jobId: l.jobId,
            code: l.code ?? '',
            unitPrice: kr(l.unitPrice),
            discountPercent: l.discountPercent,
            vatRate: l.vatRate,
            system: l.system,
          }),
        );
      }
      for (const job of this.jobs.controls) this.ensureWork(job);
      this.form.patchValue({
        link: { customerId: q.customerId, vehicleId: q.vehicleId },
        remarks: q.remarks ?? '',
        mileage: q.mileage,
        yourReference: q.yourReference ?? '',
        ourReference: q.ourReference ?? '',
      } as never);
      this.form.markAsPristine();
      this.form.markAsUntouched();
      if (q.workOrderId) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
      this.settle();
    });
  }

  /** Sidoguarden (unsavedGuard): finns det osparade ändringar? */
  hasUnsaved() {
    return this.form.dirty;
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;
    const c = this.card();
    // Ett ändrat förslag är inte det kunden fick: det blir ett utkast igen.
    if (c && c.status !== 'draft') {
      this.confirm
        .ask({
          title: 'Ändra förslaget?',
          message:
            'Förslaget blir ett utkast igen och kundens svar tas bort. Lämna det på nytt efteråt.',
          confirmText: 'Ändra',
        })
        .subscribe((ok) => ok && this.doSave());
      return;
    }
    this.doSave();
  }

  private doSave() {
    const v = this.form.getRawValue();
    const num = (n: unknown) => (n == null || n === '' ? null : Math.round(Number(n)));
    const lines = (this.lines.getRawValue() as LineValue[]).filter((l) => !l.system);
    const body: QuoteInput = {
      customerId: '',
      vehicleId: '',
      remarks: v.remarks || null,
      mileage: num(v.mileage),
      yourReference: v.yourReference || null,
      ourReference: v.ourReference || null,
      jobs: (this.jobs.getRawValue() as { id: string; title: string }[]).map((j) => ({
        id: j.id,
        title: j.title,
      })),
      lines: lines.map((l) => ({
        id: l.id ?? undefined,
        jobId: l.jobId,
        // Typen följer artikeln: kopplad till lagret = del; en del utan artikel blir fri rad.
        type: (l.articleId ? 'part' : l.type === 'part' ? 'other' : l.type) as WorkOrderLineType,
        description: l.description,
        articleId: l.articleId,
        code: l.code || null,
        quantity: l.quantity,
        unitPrice: ore(l.unitPrice),
        discountPercent: Number(l.discountPercent) || 0,
        vatRate: l.vatRate,
      })),
    };
    this.busy.set(true);
    this.links
      .resolve(v.link!)
      .pipe(
        switchMap((link) => {
          const full = { ...body, ...link };
          return this.id ? this.api.update(this.id, full) : this.api.create(full);
        }),
      )
      .subscribe({
        next: (q) => {
          this.busy.set(false);
          this.snack.open('Sparat', undefined, { duration: 2000 });
          this.form.markAsPristine();
          if (this.id) this.load();
          else this.router.navigate(['/quotes', q.id]);
        },
        error: () => this.busy.set(false),
      });
  }

  give() {
    const c = this.card();
    if (!c) return;
    this.confirm
      .ask({
        title: c.givenAt ? 'Lämna förslaget på nytt?' : 'Markera förslaget som lämnat?',
        message: `Beloppet ${(this.live().totals.total / 100).toLocaleString(appLocale())} kr sparas med giltighet och tillåten avvikelse.`,
        confirmText: 'Markera lämnat',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.run(this.api.give(c.id), 'Förslaget är registrerat som lämnat');
      });
  }

  openSend() {
    const c = this.card();
    if (!c) return;
    const data: QuoteSendData = {
      id: c.id,
      code: c.code,
      customerName: c.customerName,
      regNo: c.regNo,
      phone: this.customer()?.phone ?? c.phone,
      email: this.customer()?.email ?? null,
      total: this.live().totals.total,
      resend: c.sends.length > 0,
    };
    this.dialog
      .open(QuoteSendDialog, { data, width: '560px', maxWidth: '100vw' })
      .afterClosed()
      .subscribe((sent: QuoteDetail | null | undefined) => {
        if (!sent) return;
        this.snack.open('Förslaget är skickat', undefined, { duration: 3000 });
        this.load();
      });
  }

  /** Länken kunden öppnar. Finns ingen än lämnas förslaget först. */
  copyLink() {
    const c = this.card();
    if (!c) return;
    const copy = (url: string) =>
      navigator.clipboard
        .writeText(url)
        .then(() => this.snack.open('Länken är kopierad', undefined, { duration: 2000 }))
        .catch(() => this.snack.open(url, 'OK'));
    if (c.shareUrl) {
      void copy(c.shareUrl);
      return;
    }
    this.busy.set(true);
    this.api.give(c.id).subscribe({
      next: (q) => {
        this.busy.set(false);
        this.load();
        if (q.shareUrl) void copy(q.shareUrl);
      },
      error: () => this.busy.set(false),
    });
  }

  closeLink() {
    const c = this.card();
    if (!c) return;
    this.confirm
      .ask({
        title: 'Stänga kundens länk?',
        message: 'Länken som skickats slutar fungera. Du kan skicka förslaget på nytt.',
        confirmText: 'Stäng länken',
        danger: true,
      })
      .subscribe((ok) => {
        if (ok) this.run(this.api.revokeLink(c.id), 'Länken är stängd');
      });
  }

  /** "28 okt 14:02" */
  when(iso: string | null | undefined) {
    return iso
      ? new Date(iso).toLocaleString(appLocale(), {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  }

  answer(status: 'approved' | 'declined' | null, method?: AnswerMethod) {
    const c = this.card();
    if (!c) return;
    this.run(
      this.api.setApproval(c.id, { status, method }),
      status === null ? 'Svaret är borttaget' : status === 'approved' ? 'Ja sparat' : 'Nej sparat',
    );
  }

  private run(call: ReturnType<QuoteApi['give']>, message: string) {
    this.busy.set(true);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open(message, undefined, { duration: 2000 });
        this.load();
      },
      error: () => this.busy.set(false),
    });
  }

  makeOrder() {
    const c = this.card();
    if (!c) return;
    this.busy.set(true);
    this.api.createWorkOrder(c.id).subscribe({
      next: (o) => {
        this.busy.set(false);
        this.snack.open('Arbetsordern är gjord', undefined, { duration: 2000 });
        this.router.navigate(['/workorders', o.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    const c = this.card();
    if (!c) return;
    this.confirm
      .ask({
        title: `Ta bort ${c.code}?`,
        message: 'Offerten tas bort. Det går inte att ångra.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.remove(c.id).subscribe(() => {
          this.form.markAsPristine();
          this.router.navigate(['/quotes']);
        });
      });
  }
}
