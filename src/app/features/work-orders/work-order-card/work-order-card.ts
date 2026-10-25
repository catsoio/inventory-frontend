import { ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ensureValid } from '../../../shared/form-guard';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { InventoryApi } from '../../../core/api/inventory-api';
import { QuoteApi } from '../../../core/api/quote-api';
import { SalesCardApi } from '../../../core/api/sales-card-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import {
  AnswerMethod,
  APPROVAL_METHOD_LABELS,
  Article,
  Customer,
  JobApproval,
  Resource,
  SalesCardItem,
  ServiceType,
  WORK_ORDER_STATUS_LABELS,
  WorkOrderDetail,
  WorkOrderInput,
  WorkOrderJob,
  WorkOrderLineType,
  WorkOrderStatus,
} from '../../../core/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Confirm } from '../../../shared/confirm';
import { LinkResolver } from '../../../shared/customer-vehicle-picker/link-resolver';
import { Subject, debounceTime, switchMap } from 'rxjs';
import type { PickerValue } from '../../../shared/customer-vehicle-picker/customer-vehicle-picker';
import { dateInput, dateIso } from '../../storage/storage-format';
import { Auth } from '../../../core/auth/auth';
import { Pricing } from '../../../core/pricing';
import {
  STANDARD_VAT,
  inMode,
  netOf,
  rowAmounts,
  rowGross,
  totalsOf,
  vatIn,
  vatLabel,
  vatOn,
  type PriceGroup,
  type PricedRow,
} from '../../../shared/vat';
import { QuickArticleDialog } from '../quick-article-dialog/quick-article-dialog';

const ore = (kr: number | null | undefined) =>
  kr == null || (kr as unknown) === '' || Number.isNaN(kr) ? null : Math.round(Number(kr) * 100);
const kr = (o: number | null | undefined) => (o == null ? null : o / 100);

/** En rad som den står i formuläret: priser i kronor i orderns prisläge. */
interface LineValue {
  id: string | null;
  articleId: string | null;
  toOrder: boolean;
  stockBooked: boolean;
  type: WorkOrderLineType;
  description: string;
  quantity: number;
  instruction: string;
  done: boolean;
  jobId: string | null;
  code: string;
  unitPrice: number | null;
  discountPercent: number;
  vatRate: number;
  noCharge: boolean;
  minutes: number | null;
  system: boolean;
}

interface JobValue {
  id: string;
  title: string;
  instruction: string;
  limit: number | null;
  fixedPrice: number | null;
}

/**
 * Arbetsordern. Två arbetssätt (Inställningar → Prissättning): ett pris för hela ordern med
 * rader som checklista (däck och service), eller jobb per kundanmärkning med prissatta rader,
 * delsummor, förbrukningsmaterial och kostnadsförslag (bilverkstad). Arbetsbladet till
 * mekanikern har aldrig priser, och kunden ser aldrig timmar: arbete har ett pris per åtgärd.
 */
@Component({
  selector: 'app-work-order-card',
  standalone: false,
  template: `
    <app-card-page
      [wide]="true"
      listLink="/workorders"
      listLabel="Arbetsorder"
      newTitle="Ny arbetsorder"
      [title]="card() ? card()!.regNo + ' · ' + card()!.customerName : ''"
      [code]="card()?.code ?? null"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          @if (admin && !c.locked) {
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
          @if (c.invoice; as inv) {
            <a mat-stroked-button [routerLink]="['/finance/invoices', c.id]">
              <mat-icon>receipt_long</mat-icon> Faktura {{ inv.code }}
            </a>
          } @else if (salesCard(); as sc) {
            <a mat-stroked-button [routerLink]="['/sales', sc.id]">
              <mat-icon>receipt_long</mat-icon> {{ sc.code }}
              <app-pill [tone]="sc.status === 'draft' ? 'gray' : sc.paidAt ? 'green' : 'amber'">
                {{ sc.status === 'draft' ? 'Utkast' : sc.paidAt ? 'Betald' : 'Obetald' }}
              </app-pill>
            </a>
          } @else {
            <button
              mat-stroked-button
              type="button"
              [disabled]="form.dirty || busy() || c.status !== 'done'"
              [matTooltip]="
                form.dirty
                  ? 'Spara först'
                  : c.status !== 'done'
                    ? 'Sätt ordern till Klar först'
                    : 'Skapa säljkort av ordern'
              "
              (click)="createSalesCard()"
            >
              <mat-icon>receipt_long</mat-icon> Skapa säljkort
            </button>
          }
          <a
            mat-stroked-button
            [routerLink]="['/workorders', c.id, 'print']"
            [disabled]="form.dirty"
            [matTooltip]="form.dirty ? 'Spara först' : ''"
          >
            <mat-icon>print</mat-icon> Skriv ut<span class="max-md:hidden">&nbsp;arbetsblad</span>
          </a>
        }
        @if (!locked()) {
          <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
            Spara
          </button>
        }
      </div>

      @if (locked()) {
        <p class="mb-4 flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          <mat-icon class="shrink-0">lock</mat-icon>
          <span>
            <b>
              Fakturerad{{
                (card()?.invoice?.code ?? salesCard()?.invoiceCode)
                  ? ' som ' + (card()?.invoice?.code ?? salesCard()?.invoiceCode)
                  : ''
              }}.
            </b>
            Ordern är låst: den kan inte ändras, öppnas igen eller tas bort (en bokförd faktura får
            inte ändras i efterhand).
          </span>
        </p>
      }

      @if (card()?.hasMissing && card()!.status !== 'done') {
        <p
          class="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          <span><b>Del saknas.</b> Någon rad måste beställas innan jobbet kan bli klart.</span>
          @if (card()!.status !== 'waiting_parts' && !locked()) {
            <button mat-stroked-button type="button" (click)="waitForParts()">
              Sätt Väntar på del
            </button>
          }
        </p>
      }

      @if (card()?.overQuote) {
        <p class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          <b>Över kostnadsförslaget.</b> Priset är mer än {{ card()!.quote!.tolerancePercent }} %
          över förslaget ({{ card()!.quote!.total | kr }}). Kunden måste godkänna det högre priset.
        </p>
      }

      <form [formGroup]="form" class="grid gap-4 xl:grid-cols-2">
        <section
          class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white p-5 shadow-sm xl:col-span-2"
        >
          <h2 class="text-base font-semibold">Status</h2>
          <mat-button-toggle-group formControlName="status" hideSingleSelectionIndicator>
            @for (s of statuses; track s[0]) {
              <mat-button-toggle [value]="s[0]">{{ s[1] }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
        </section>

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
          <h2 class="mb-2 text-base font-semibold sm:col-span-6">Arbetsblad</h2>
          <app-date-field
            class="sm:col-span-3"
            label="Start"
            icon="event"
            error="Ange datum"
            formControlName="receivedAt"
          />
          <app-date-field
            class="sm:col-span-3"
            label="Klar senast"
            icon="event_available"
            [error]="form.errors?.['pickup'] ? 'Före startdatumet' : ''"
            formControlName="pickupAt"
          />
          <mat-form-field class="sm:col-span-3">
            <mat-label>Mekaniker</mat-label>
            <mat-select formControlName="resourceId">
              <mat-option value="">Ingen vald</mat-option>
              @for (r of mechanics(); track r.id) {
                <mat-option [value]="r.id">{{ r.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="sm:col-span-3">
            <mat-label>Lyft / plats</mat-label>
            <mat-select formControlName="placeId">
              <mat-option value="">Ingen vald</mat-option>
              @for (r of places(); track r.id) {
                <mat-option [value]="r.id">{{ r.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="sm:col-span-2">
            <mat-label>Mätarställning (km)</mat-label>
            <input matInput type="number" inputmode="numeric" min="0" formControlName="mileage" />
            @if (pricing.value().requireMileage) {
              <mat-hint>Krävs innan ordern blir klar</mat-hint>
            }
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
            @if (linesMode()) {
              <button mat-stroked-button type="button" [disabled]="locked()" (click)="addJob()">
                <mat-icon>add</mat-icon> Lägg till jobb
              </button>
            } @else {
              <button mat-stroked-button type="button" [disabled]="locked()" (click)="addLine()">
                <mat-icon>add</mat-icon> Lägg till rad
              </button>
            }
          </div>

          @if (card()?.stockMissing; as n) {
            <p class="mb-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {{ n }} {{ n === 1 ? 'del' : 'delar' }} kunde inte tas ur lagret (saknas eller är
              arkiverad). Justera lagret och spara om ordern.
            </p>
          }

          @if (linesMode()) {
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
                <input
                  formControlName="instruction"
                  autocomplete="off"
                  placeholder="Instruktion till mekanikern (valfritt)"
                  class="mt-2 h-9 w-full px-3 text-sm field"
                />
                @if (w) {
                  <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <mat-checkbox
                      [checked]="w.value.done"
                      [disabled]="locked()"
                      (change)="flip(w, 'done')"
                    >
                      Klar
                    </mat-checkbox>
                    <mat-checkbox
                      [checked]="w.value.toOrder"
                      [disabled]="locked()"
                      (change)="flip(w, 'toOrder')"
                    >
                      Del saknas, ska beställas
                    </mat-checkbox>
                    <mat-checkbox
                      [checked]="w.value.noCharge"
                      [disabled]="locked()"
                      (change)="flip(w, 'noCharge')"
                    >
                      Debiteras ej (garanti)
                    </mat-checkbox>
                  </div>
                }

                @if (rowsOf(job.value.id).length) {
                  <div class="mt-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
                    Delar
                  </div>
                }
                <div class="flex flex-col">
                  @for (r of rowsOf(job.value.id); track r.row) {
                    <ng-container
                      *ngTemplateOutlet="
                        rowTpl;
                        context: { $implicit: r.row, i: r.i, fixed: false }
                      "
                    />
                  }
                </div>

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
            }

            @if (rowsOf(null).length || live().fee > 0) {
              <div class="mt-3 rounded-xl border border-dashed border-gray-200 p-3">
                <div class="mb-1 text-sm font-medium text-gray-600">Övrigt på ordern</div>
                @for (r of rowsOf(null); track r.row) {
                  <ng-container
                    *ngTemplateOutlet="rowTpl; context: { $implicit: r.row, i: r.i, fixed: false }"
                  />
                }
                @if (live().fee > 0) {
                  <div class="flex items-center gap-2 py-2 text-sm">
                    <span class="flex-1">{{ pricing.value().consumablesText }}</span>
                    <span class="text-xs text-gray-500"
                      >{{ pricing.value().consumablesPercent }} % av arbetet</span
                    >
                    <span class="w-28 text-right tabular-nums">{{ live().fee | kr }}</span>
                  </div>
                }
              </div>
            }
            @if (!jobs.length && !rowsOf(null).length) {
              <p class="text-sm text-gray-500">
                Inga jobb än. Lägg till ett jobb, t.ex. Byta olja.
              </p>
            }
          } @else {
            <div class="flex flex-col">
              @for (r of rowsOfAll(); track r.row) {
                <ng-container
                  *ngTemplateOutlet="rowTpl; context: { $implicit: r.row, i: r.i, fixed: false }"
                />
              } @empty {
                <p class="text-sm text-gray-500">
                  Inga rader än. Lägg till vad som ska göras med knappen ovan.
                </p>
              }
            </div>
          }
        </section>

        @if (linesMode()) {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <div class="flex flex-wrap items-start gap-4">
              <div class="min-w-56 flex-1">
                <h2 class="mb-2 text-base font-semibold">Summa</h2>
                <p class="text-sm text-gray-500">Alla priser är inkl. moms.</p>
                @if (orderPrice() != null) {
                  <p class="mt-3 text-sm text-gray-700">
                    Fast pris för hela ordern: <b>{{ orderPrice()! | kr }}</b>
                    <button
                      mat-button
                      type="button"
                      [disabled]="locked()"
                      (click)="clearOrderPrice()"
                    >
                      Ta bort
                    </button>
                  </p>
                }
              </div>
              <div class="ml-auto w-full max-w-sm text-sm">
                @if (live().totals.discount !== 0) {
                  <div class="flex justify-between py-0.5 text-gray-600">
                    <span>Före rabatt</span><span>{{ live().totals.gross | kr }}</span>
                  </div>
                  <div class="flex justify-between py-0.5 text-green-700">
                    <span>Rabatt och fasta priser</span
                    ><span>−{{ live().totals.discount | kr }}</span>
                  </div>
                }
                <div class="flex justify-between py-0.5 text-gray-600">
                  <span>Summa exkl. moms</span><span>{{ live().totals.net | kr }}</span>
                </div>
                @for (b of live().totals.byRate; track b.rate) {
                  <div class="flex justify-between py-0.5 text-gray-600">
                    <span>Moms {{ b.rate }} %</span><span>{{ b.vat | kr }}</span>
                  </div>
                }
                @if (live().totals.rounding) {
                  <div class="flex justify-between py-0.5 text-gray-600">
                    <span>Öresutjämning</span><span>{{ live().totals.rounding! | kr }}</span>
                  </div>
                }
                <div class="mt-1 flex justify-between gap-6 border-t pt-1 text-lg font-semibold">
                  <span>Att betala</span><span>{{ live().totals.total | kr }}</span>
                </div>
              </div>
            </div>
          </section>

          @if (card(); as c) {
            @if (c.quote) {
              <section class="rounded-xl bg-white p-5 shadow-sm">
                <h2 class="mb-2 text-base font-semibold">Kostnadsförslag</h2>
                <p class="mb-3 text-sm">
                  Lämnat {{ c.quote.givenAt | date: 'yyyy-MM-dd' }}:
                  <b>{{ c.quote.total | kr }}</b> inkl. moms, giltigt till
                  {{ c.quote.validUntil | date: 'yyyy-MM-dd' }}, får avvika
                  {{ c.quote.tolerancePercent }} %.
                </p>
                @if (c.quote.approval; as a) {
                  <p class="mb-3">
                    <app-pill [tone]="a.status === 'approved' ? 'green' : 'red'">
                      {{ a.status === 'approved' ? 'Kunden har godkänt' : 'Kunden sa nej' }}
                      · {{ a.at | date: 'd/M HH:mm' }}
                      @if (a.method) {
                        · {{ methodLabels[a.method] }}
                      }
                    </app-pill>
                  </p>
                } @else {
                  <p class="mb-3"><app-pill tone="amber">Väntar på kundens svar</app-pill></p>
                }
                <button mat-stroked-button type="button" [disabled]="busy()" (click)="openQuote()">
                  <mat-icon>request_quote</mat-icon> Öppna kostnadsförslag
                </button>
              </section>
            }
          }
        } @else {
          <section class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-6">
            <h2 class="mb-1 text-base font-semibold sm:col-span-6">Pris</h2>
            <p class="mb-3 text-sm text-gray-600 sm:col-span-6">
              Överenskommet med kunden. Står inte på arbetsbladet.
            </p>
            <mat-form-field class="sm:col-span-2">
              <mat-label>Pris för jobbet (kr)</mat-label>
              <input matInput type="number" inputmode="decimal" min="0" formControlName="price" />
              <mat-hint>{{ inclHint(form.controls.price.value) }}</mat-hint>
            </mat-form-field>
            <mat-form-field class="sm:col-span-4">
              <mat-label>Notering om priset</mat-label>
              <input
                matInput
                formControlName="priceNote"
                placeholder="t.ex. 8000 om vi köper delen, 5000 om kunden köper"
              />
            </mat-form-field>
          </section>
        }
      </form>

      <!-- En rad: i jobbläget med kod, pris och rabatt; annars som checklista. -->
      <ng-template #rowTpl let-row let-i="i" let-fixed="fixed">
        <div
          [formGroup]="row"
          class="mt-2 flex flex-col gap-2 rounded-xl border border-transparent p-3"
          [class.bg-white]="!row.value.toOrder && !row.value.done"
          [class.border-amber-300]="row.value.toOrder"
          [class.bg-amber-50]="row.value.toOrder"
          [class.bg-green-50]="row.value.done && !row.value.toOrder"
        >
          <div class="flex flex-wrap items-end gap-2">
            <div class="relative min-w-48 flex-1">
              <mat-icon class="pointer-events-none absolute top-2 left-2 text-gray-400"
                >search</mat-icon
              >
              <input
                formControlName="description"
                [matAutocomplete]="auto"
                (input)="edited(row)"
                (focus)="typed(row)"
                autocomplete="off"
                [placeholder]="
                  linesMode()
                    ? 'Sök del i lagret…'
                    : 'Sök artikel i lagret, eller skriv vad som ska göras…'
                "
                class="h-10 w-full pr-3 pl-10 field"
              />
              <mat-autocomplete
                #auto="matAutocomplete"
                (optionSelected)="picked(row, $event.option.value)"
              >
                @for (o of suggestions(row); track o.key) {
                  <mat-option [value]="o.key">
                    {{ o.label }}
                    <span class="ml-2 text-xs text-gray-500">{{ o.hint }}</span>
                  </mat-option>
                }
                @if (row.value.description && !row.value.articleId) {
                  <mat-option
                    [value]="'n:' + row.value.description"
                    class="!font-medium !text-brand"
                  >
                    + Ny artikel "{{ row.value.description }}"
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
            @if (linesMode()) {
              <label class="flex shrink-0 flex-col gap-0.5 text-xs text-gray-500">
                À-pris
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  formControlName="unitPrice"
                  (focus)="$any($event.target).select()"
                  aria-label="À-pris"
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
                class="flex h-10 w-28 items-center justify-end shrink-0 text-sm tabular-nums"
                [class.text-gray-400]="fixed || row.value.noCharge"
                [matTooltip]="fixed ? 'Jobbet har fast pris; kunden ser raden utan pris' : ''"
              >
                @if (row.value.noCharge) {
                  Debiteras ej
                } @else {
                  {{ live().amounts[i] ?? 0 | kr }}
                }
              </span>
            }
            <button
              mat-icon-button
              type="button"
              class="shrink-0"
              [disabled]="locked()"
              (click)="removeLine(i)"
              aria-label="Ta bort raden"
            >
              <mat-icon>delete_outline</mat-icon>
            </button>
          </div>
          @if (!linesMode()) {
            <input
              formControlName="instruction"
              autocomplete="off"
              placeholder="Instruktion till mekanikern (valfritt), t.ex. originaldelar"
              class="h-9 w-full px-3 text-sm field"
            />
          }
          <div class="flex flex-wrap items-center gap-2 text-sm">
            @if (!linesMode()) {
              <mat-checkbox
                [checked]="row.value.done"
                [disabled]="locked()"
                (change)="flip(row, 'done')"
              >
                Klar
              </mat-checkbox>
            }
            <mat-checkbox
              [checked]="row.value.toOrder"
              [disabled]="locked()"
              (change)="flip(row, 'toOrder')"
            >
              Del saknas, ska beställas
            </mat-checkbox>
            @if (linesMode()) {
              <mat-checkbox
                [checked]="row.value.noCharge"
                [disabled]="locked()"
                (change)="flip(row, 'noCharge')"
              >
                Debiteras ej (garanti)
              </mat-checkbox>
            }
            @if (row.value.articleId) {
              <span class="text-xs text-gray-500">
                {{ row.value.stockBooked ? 'Uttagen ur lagret' : stockHint() }}
              </span>
            }
          </div>
        </div>
      </ng-template>
    </app-card-page>
  `,
})
export class WorkOrderCard implements OnInit {
  private readonly auth = inject(Auth);
  /** Bara ägare får ta bort och se efterkalkylen. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  readonly pricing = inject(Pricing);
  private readonly api = inject(WorkOrderApi);
  private readonly salesApi = inject(SalesCardApi);
  private readonly quotes = inject(QuoteApi);
  private readonly links = inject(LinkResolver);
  private readonly workshop = inject(WorkshopApi);
  private readonly inventory = inject(InventoryApi);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(Confirm);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly statuses: [WorkOrderStatus, string][] = [
    ['open', 'Öppen'],
    ['in_progress', 'Pågår'],
    ['waiting_parts', 'Pausad'],
    ['done', 'Klar'],
  ];
  readonly methods = Object.entries(APPROVAL_METHOD_LABELS) as [
    NonNullable<JobApproval['method']>,
    string,
  ][];
  readonly methodLabels = APPROVAL_METHOD_LABELS;
  readonly vatLabel = vatLabel;
  /** Säljkortet som fakturerar ordern, om det finns. */
  readonly salesCard = signal<SalesCardItem | null>(null);
  readonly busy = signal(false);
  readonly card = signal<WorkOrderDetail | null>(null);
  readonly resources = signal<Resource[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  /** Kunden på ordern, för kundtyp och kundrabatt. */
  readonly customer = signal<Customer | null>(null);
  readonly mechanics = computed(() => this.resources().filter((r) => r.kind === 'mechanic'));
  readonly places = computed(() => this.resources().filter((r) => r.kind !== 'mechanic'));
  /** Orderns prisläge: inkl. moms (standard) eller exkl. moms. */
  readonly incl = signal(true);
  /** Valt för hand, så att kundbyte inte ändrar det. */
  private inclChosen = false;
  readonly locked = computed(() => !!this.card()?.locked);
  /** Jobb med prissatta rader: inställningen, eller en order som redan har jobb eller priser. */
  readonly linesMode = computed(() => {
    const c = this.card();
    return (
      this.pricing.value().priceEntry === 'lines' ||
      !!c?.jobs?.length ||
      !!c?.lines.some((l) => l.unitPrice != null && !l.system)
    );
  });
  private readonly partResults = signal<Article[]>([]);
  private readonly partSearch = new Subject<string>();
  /** Räknas om när något i formuläret ändras, så att summan följer med. */
  private readonly version = signal(0);

  readonly jobs = this.fb.array<FormGroup>([]);
  readonly lines = this.fb.array<FormGroup>([]);
  readonly form = this.fb.nonNullable.group(
    {
      link: [null as PickerValue | null, Validators.required],
      resourceId: [''],
      placeId: [''],
      status: ['open' as WorkOrderStatus],
      receivedAt: [dateInput(new Date().toISOString()), Validators.required],
      pickupAt: [''],
      price: [null as number | null, Validators.min(0)],
      priceNote: [''],
      performed: [''],
      warranty: [''],
      remarks: [''],
      notes: [''],
      mileage: [null as number | null, Validators.min(0)],
      yourReference: [''],
      ourReference: [''],
      jobs: this.jobs,
      lines: this.lines,
    },
    {
      validators: (g) => {
        const v = g.getRawValue() as {
          receivedAt: string;
          pickupAt: string;
        };
        const errors: Record<string, boolean> = {};
        if (v.receivedAt && v.pickupAt && v.pickupAt < v.receivedAt) errors['pickup'] = true;
        return Object.keys(errors).length ? errors : null;
      },
    },
  );

  /** Ett fast pris för hela ordern, öre, eller null. */
  readonly orderPrice = computed(() => {
    this.version();
    return ore(this.form.controls.price.value);
  });

  /**
   * Priset medan man skriver, med samma motor som backend: radernas rabatt, jobbens fasta
   * priser, ett fast pris för hela ordern och förbrukningsmaterialet på arbetet.
   */
  readonly live = computed(() => {
    this.version();
    const lines = this.lines.getRawValue() as LineValue[];
    const jobs = this.jobs.getRawValue() as JobValue[];
    const incl = this.incl();
    const s = this.pricing.value();
    const priced = (l: LineValue): PricedRow => ({
      quantity: Number(l.quantity) || 0,
      unitPrice: ore(l.unitPrice) ?? 0,
      discountPercent: Number(l.discountPercent) || 0,
      vatRate: l.vatRate,
      group: l.jobId,
    });
    const charged = lines.map((l, i) => ({ l, i })).filter(({ l }) => !l.noCharge && !l.system);
    let rows: PricedRow[] = charged.map(({ l }) => priced(l));
    // Förbrukningsmaterial: en andel av arbetet efter radernas rabatt, med tak.
    const labour = charged
      .filter(({ l }) => l.type === 'labour')
      .reduce((sum, { l }) => sum + rowGross(priced(l)), 0);
    let fee = s.consumablesPercent ? Math.round((labour * s.consumablesPercent) / 100) : 0;
    if (s.consumablesMax != null) fee = Math.min(fee, s.consumablesMax);
    if (fee > 0) rows.push({ quantity: 1, unitPrice: fee, vatRate: STANDARD_VAT, group: null });
    let groups: PriceGroup[] = jobs
      .filter((j) => ore(j.fixedPrice) != null)
      .map((j) => ({ id: j.id, fixedPrice: ore(j.fixedPrice) }));
    const price = ore(this.form.controls.price.value);
    let index = charged.map(({ i }) => i);
    if (price != null) {
      if (rows.some((r) => rowGross(r) > 0)) {
        rows = rows.map((r) => ({ ...r, group: '__order' }));
        groups = [{ id: '__order', fixedPrice: price }];
      } else {
        rows = [{ quantity: 1, unitPrice: price }];
        groups = [];
        index = [];
      }
    }
    const list = rowAmounts(rows, null, groups);
    const amounts: Record<number, number> = {};
    index.forEach((i, k) => (amounts[i] = list[k]));
    const jobTotals: Record<string, number> = {};
    charged.forEach(({ l, i }) => {
      if (l.jobId) jobTotals[l.jobId] = (jobTotals[l.jobId] ?? 0) + (amounts[i] ?? 0);
    });
    return {
      amounts,
      jobTotals,
      fee,
      totals: totalsOf(rows, null, {
        pricesIncludeVat: incl,
        roundToKrona: this.card()?.roundToKrona ?? s.roundToKrona,
        groups,
      }),
    };
  });

  readonly discountHint = computed(() => {
    const c = this.customer();
    if (!c || !this.linesMode()) return '';
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
    // Aktiva mekaniker, och den som redan står på ordern även om hen arkiverats.
    this.workshop.resources(true).subscribe((r) => this.resources.set(r.filter((x) => x.active)));
    this.workshop.serviceTypes().subscribe((l) => this.serviceTypes.set(l));
    if (this.id) this.load();
    else this.form.patchValue({ ourReference: this.auth.user()?.name ?? '' }, { emitEvent: false });
  }

  private loadCustomer(customerId: string | undefined) {
    if (!customerId) {
      this.customer.set(null);
      return;
    }
    if (this.customer()?.id === customerId) return;
    this.workshop.customer(customerId).subscribe((c) => {
      this.customer.set(c);
      // En ny order prissätts efter kundtypen (Prissättning), om man inte valt själv.
      if (!this.id && !this.inclChosen) {
        this.incl.set(this.pricing.includeVatFor(c.type === 'company'));
      }
    });
  }

  private newJob(init?: Partial<WorkOrderJob>) {
    const job = this.fb.group({
      id: [init?.id ?? crypto.randomUUID()],
      title: [init?.title ?? '', Validators.required],
      instruction: [init?.instruction ?? ''],
      limit: [kr(init?.limit ?? null), Validators.min(0)],
      fixedPrice: [kr(init?.fixedPrice ?? null), Validators.min(0)],
    });
    // Jobbets arbetsrad bär jobbets text, så att dokumenten visar den.
    job.controls.title.valueChanges.subscribe((t) =>
      this.work(job.value.id as string)?.patchValue({ description: t }, { emitEvent: false }),
    );
    return job;
  }

  /**
   * Jobbets egen rad: själva arbetet med pris, rabatt och markeringar. Delarna är övriga rader
   * under jobbet. Raden finns alltid för varje jobb, men syns inte som en egen rad.
   */
  work(jobId: string): FormGroup | null {
    return (
      this.lines.controls.find(
        (l) => l.value.jobId === jobId && l.value.type === 'labour' && !l.value.system,
      ) ?? null
    );
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

  /** Ser till att varje jobb har sin arbetsrad (äldre order och nya jobb). */
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

  private newLine(init: Partial<LineValue> & { type: WorkOrderLineType }) {
    return this.fb.nonNullable.group({
      id: [init.id ?? (null as string | null)],
      articleId: [init.articleId ?? (null as string | null)],
      toOrder: [init.toOrder ?? false],
      stockBooked: [init.stockBooked ?? false],
      type: [init.type],
      description: [init.description ?? '', Validators.required],
      quantity: [init.quantity ?? 1, [Validators.required, Validators.min(0.01)]],
      instruction: [init.instruction ?? ''],
      done: [init.done ?? false],
      jobId: [init.jobId ?? (null as string | null)],
      code: [init.code ?? ''],
      unitPrice: [init.unitPrice ?? (null as number | null), Validators.min(0)],
      discountPercent: [init.discountPercent ?? 0, [Validators.min(0), Validators.max(100)]],
      vatRate: [init.vatRate ?? STANDARD_VAT],
      noCharge: [init.noCharge ?? false],
      minutes: [init.minutes ?? (null as number | null), Validators.min(0)],
      system: [init.system ?? false],
    });
  }

  /** Raderna under ett jobb (eller utan jobb), med sitt index i formuläret. */
  rowsOf(jobId: string | null) {
    const work = jobId ? this.work(jobId) : null;
    return this.rowsOfAll().filter(
      ({ row }) => (row.value.jobId ?? null) === jobId && row !== work,
    );
  }

  /** Alla rader utom systemets (förbrukningsmaterialet visas räknat, inte som rad). */
  rowsOfAll() {
    this.version();
    return this.lines.controls.map((row, i) => ({ row, i })).filter(({ row }) => !row.value.system);
  }

  hasFixed(v: unknown) {
    return v != null && v !== '';
  }

  approvalOf(jobId: string) {
    return this.card()?.jobs?.find((j) => j.id === jobId)?.approval ?? null;
  }

  /** Jobbet finns sparat, så kundens svar kan registreras. */
  savedJob(jobId: string) {
    return !!this.card()?.jobs?.some((j) => j.id === jobId);
  }

  stockHint() {
    return this.pricing.value().stockOut === 'sales_card_posted'
      ? 'Lagerartikel, tas ur lagret när säljkortet bokförs'
      : 'Lagerartikel, tas ur lagret när ordern är klar';
  }

  hours(min: number) {
    return min ? `(${Math.round((min / 60) * 100) / 100} h)` : '';
  }

  /** Förslag på raden: lagerartiklar. */
  suggestions(_row: FormGroup): { key: string; label: string; hint: string }[] {
    this.version();
    return this.partResults().map((a) => ({
      key: 'a:' + a.id,
      label: a.label,
      hint: `${a.sku ?? ''} · ${a.quantity} i lager`,
    }));
  }

  /** Skriver man om raden är den inte längre kopplad till en lagerartikel. */
  edited(row: FormGroup) {
    row.patchValue({ articleId: null });
    this.typed(row);
  }

  typed(row: FormGroup) {
    const v = row.getRawValue() as { description: string };
    this.partSearch.next(v.description ?? '');
  }

  picked(row: FormGroup, key: string) {
    if (key.startsWith('n:')) {
      row.patchValue({ description: key.slice(2), articleId: null });
      this.createArticle(row);
      return;
    }
    const a = this.partResults().find((x) => x.id === key.slice(2));
    if (a) this.linkArticle(row, a);
    this.form.markAsDirty();
  }

  /** Kopplar raden till artikeln: kod, pris i orderns prisläge och kundens rabatt på delar. */
  private linkArticle(row: FormGroup, a: Article) {
    const v = row.getRawValue() as LineValue;
    row.patchValue({
      description: a.label,
      articleId: a.id,
      type: 'part',
      code: v.code || a.sku || '',
      unitPrice: v.unitPrice ?? kr(inMode(a.sellPrice, this.incl())),
      discountPercent: v.discountPercent || this.customer()?.partsDiscount || 0,
    });
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
    const rows = this.rowsOf(id).length;
    const run = () => {
      for (let i = this.lines.length - 1; i >= 0; i--) {
        if (this.lines.at(i).value.jobId === id) this.lines.removeAt(i);
      }
      this.jobs.removeAt(j);
      this.form.markAsDirty();
      this.settle();
    };
    if (!rows) {
      run();
      return;
    }
    this.confirm
      .ask({
        title: 'Ta bort jobbet?',
        message: `Jobbet och dess ${rows} ${rows === 1 ? 'rad' : 'rader'} tas bort när du sparar.`,
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => ok && run());
  }

  addLine(jobId: string | null = null) {
    this.lines.push(this.newLine({ type: 'other', jobId }));
    this.form.markAsDirty();
    this.settle();
  }

  addLabour(jobId: string) {
    this.lines.push(
      this.newLine({
        type: 'labour',
        jobId,
        discountPercent: this.customer()?.labourDiscount ?? 0,
      }),
    );
    this.form.markAsDirty();
    this.settle();
  }

  addPart(jobId: string) {
    this.lines.push(
      this.newLine({ type: 'part', jobId, discountPercent: this.customer()?.partsDiscount ?? 0 }),
    );
    this.form.markAsDirty();
    this.settle();
  }

  /**
   * Fyller jobbet från en åtgärd: namnet och priset till jobbet, och mallens delar och avgifter
   * som rader under det. Redan ifyllt pris skrivs inte över.
   */
  addTemplate(jobId: string, s: ServiceType) {
    const incl = this.incl();
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
      if (work.value.minutes == null)
        work.patchValue({ minutes: labour?.minutes ?? s.durationMinutes });
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
          minutes: t.minutes,
        }),
      );
    }
    this.form.markAsDirty();
    this.settle();
  }

  /**
   * Byter orderns prisläge och räknar om priserna så att kunden betalar detsamma:
   * inkl. → exkl. tar bort momsen, exkl. → inkl. lägger på den.
   */
  switchVat(toIncl: boolean) {
    if (toIncl === this.incl()) return;
    this.inclChosen = true;
    const conv = (k: number | null | undefined, rate = STANDARD_VAT) => {
      const o = ore(k);
      if (o == null) return null;
      return kr(toIncl ? o + vatOn(o, rate) : netOf(o, rate));
    };
    for (const row of this.lines.controls) {
      const v = row.getRawValue() as LineValue;
      row.patchValue({ unitPrice: conv(v.unitPrice, v.vatRate) });
    }
    for (const job of this.jobs.controls) {
      job.patchValue({ limit: conv(job.value.limit), fixedPrice: conv(job.value.fixedPrice) });
    }
    this.form.patchValue({ price: conv(this.form.controls.price.value) });
    this.incl.set(toIncl);
    this.form.markAsDirty();
  }

  clearOrderPrice() {
    this.form.patchValue({ price: null });
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

  removeLine(i: number) {
    this.lines.removeAt(i);
    this.form.markAsDirty();
    this.settle();
  }

  /** Slår på/av en av radens markeringar (klar, saknas, debiteras ej). */
  flip(row: FormGroup, key: 'done' | 'toOrder' | 'noCharge') {
    row.patchValue({ [key]: !row.value[key] });
    this.form.markAsDirty();
  }

  /** Skapar en lagerartikel för en del som inte finns och kopplar raden till den. */
  createArticle(row: FormGroup) {
    const name = (row.getRawValue() as { description: string }).description;
    this.dialog
      .open(QuickArticleDialog, { data: { name }, width: '420px' })
      .afterClosed()
      .subscribe((a: Article | undefined) => {
        if (!a) return;
        this.linkArticle(row, a);
        this.form.markAsDirty();
        this.snack.open('Artikeln skapad och kopplad', undefined, { duration: 2000 });
      });
  }

  /** Sätter ordern till Väntar på del och sparar. */
  waitForParts() {
    this.form.patchValue({ status: 'waiting_parts' });
    this.form.markAsDirty();
    this.save();
  }

  /** "varav moms 199 kr" under ett pris inkl. moms, "+ moms 249 kr" under ett exkl. moms. */
  inclHint(amountKr: number | null | undefined): string {
    if (amountKr == null || Number.isNaN(amountKr) || amountKr === 0) return '';
    const o = Math.round(amountKr * 100);
    return this.incl()
      ? `varav moms ${(vatIn(o) / 100).toLocaleString('sv-SE')} kr`
      : `+ moms ${(vatOn(o) / 100).toLocaleString('sv-SE')} kr`;
  }

  private load() {
    this.api.get(this.id!).subscribe((o) => {
      this.card.set(o);
      this.incl.set(o.pricesIncludeVat ?? true);
      this.jobs.clear();
      for (const j of o.jobs ?? []) this.jobs.push(this.newJob(j));
      this.lines.clear();
      for (const l of o.lines) {
        this.lines.push(
          this.newLine({
            id: l.id,
            articleId: l.articleId,
            toOrder: l.toOrder,
            stockBooked: l.stockBooked,
            type: l.type,
            description: l.description,
            quantity: l.quantity,
            instruction: l.instruction ?? '',
            done: l.done,
            jobId: l.jobId ?? null,
            code: l.code ?? '',
            unitPrice: kr(l.unitPrice),
            discountPercent: l.discountPercent ?? 0,
            vatRate: l.vatRate ?? STANDARD_VAT,
            noCharge: l.noCharge ?? false,
            minutes: l.minutes ?? null,
            system: l.system ?? false,
          }),
        );
      }
      // Rader som pekar på ett jobb som saknas får tillbaka sitt jobb, så inget döljs.
      const known = new Set(this.jobs.controls.map((j) => j.value.id as string));
      for (const l of this.lines.controls) {
        const jid = l.value.jobId as string | null;
        if (!jid || known.has(jid)) continue;
        known.add(jid);
        const first = this.work(jid) ?? l;
        this.jobs.push(this.newJob({ id: jid, title: first.value.description as string }));
      }
      for (const job of this.jobs.controls) this.ensureWork(job);
      // patchValue, inte reset: reset skulle nollställa jobbens och radernas fält (id, text).
      this.form.patchValue({
        link: { customerId: o.customerId, vehicleId: o.vehicleId },
        resourceId: o.resourceId ?? '',
        placeId: o.placeId ?? '',
        status: o.status,
        receivedAt: dateInput(o.receivedAt),
        pickupAt: dateInput(o.pickupAt),
        price: kr(o.price),
        priceNote: o.priceNote ?? '',
        performed: o.performed ?? '',
        warranty: o.warranty ?? '',
        remarks: o.remarks ?? '',
        notes: o.notes ?? '',
        mileage: o.mileage ?? null,
        yourReference: o.yourReference ?? '',
        ourReference: o.ourReference ?? '',
      } as never);
      this.form.markAsPristine();
      this.form.markAsUntouched();
      // En fakturerad order är låst.
      if (o.locked) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
      this.salesApi
        .list({ workOrderId: o.id, limit: 1 })
        .subscribe((p) => this.salesCard.set(p.items[0] ?? null));
      // Raderna byggs om efter varje laddning (även efter spara): samma extra rendering som vid +.
      this.settle();
    });
  }

  /** Sidoguarden (unsavedGuard): finns det osparade ändringar? */
  hasUnsaved() {
    return this.form.dirty;
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;

    const v = this.form.getRawValue();
    const num = (n: unknown) => (n == null || n === '' ? null : Math.round(Number(n)));
    // Förbrukningsmaterialet är systemets rad; backend räknar om det.
    const lines = (this.lines.getRawValue() as LineValue[]).filter((l) => !l.system);
    const body: WorkOrderInput = {
      customerId: '',
      vehicleId: '',
      resourceId: v.resourceId || null,
      placeId: v.placeId || null,
      status: v.status,
      receivedAt: dateIso(v.receivedAt),
      pickupAt: v.pickupAt ? dateIso(v.pickupAt) : null,
      price: ore(v.price),
      priceNote: v.priceNote || null,
      performed: v.performed || null,
      warranty: v.warranty || null,
      remarks: v.remarks || null,
      notes: v.notes || null,
      pricesIncludeVat: this.incl(),
      mileage: num(v.mileage),
      yourReference: v.yourReference || null,
      ourReference: v.ourReference || null,
      jobs: (this.jobs.getRawValue() as JobValue[]).map((j) => ({
        id: j.id,
        title: j.title,
        instruction: j.instruction || null,
        limit: ore(j.limit),
        fixedPrice: ore(j.fixedPrice),
      })),
      lines: lines.map((l) => ({
        id: l.id ?? undefined,
        articleId: l.articleId,
        toOrder: l.toOrder,
        // Typen följer artikeln: kopplad till lagret = del; en del utan artikel blir fri rad.
        type: (l.articleId ? 'part' : l.type === 'part' ? 'other' : l.type) as WorkOrderLineType,
        description: l.description,
        quantity: l.quantity,
        instruction: l.instruction || null,
        done: l.done,
        jobId: l.jobId,
        code: l.code || null,
        unitPrice: ore(l.unitPrice),
        discountPercent: Number(l.discountPercent) || 0,
        vatRate: l.vatRate,
        noCharge: l.noCharge,
        minutes: num(l.minutes),
      })),
    };
    // En klar order utan "utfört" får texten från jobben eller raderna, redigerbar innan kvittot.
    if (body.status === 'done' && !body.performed) {
      const titles = (body.jobs ?? []).map((j) => j.title).filter(Boolean);
      body.performed = (
        titles.length ? titles : body.lines.filter((l) => l.description).map((l) => l.description)
      ).join(', ');
    }
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
        next: (o) => {
          this.busy.set(false);
          this.snack.open('Sparat', undefined, { duration: 2000 });
          this.form.markAsPristine();
          if (this.id) this.load();
          else this.router.navigate(['/workorders', o.id]);
        },
        error: () => this.busy.set(false),
      });
  }

  /** Öppnar kostnadsförslaget; en äldre order flyttar först sitt förslag till ett eget dokument. */
  openQuote() {
    const c = this.card();
    if (!c) return;
    if (c.quoteId) {
      this.router.navigate(['/quotes', c.quoteId]);
      return;
    }
    this.busy.set(true);
    this.quotes.fromWorkOrder(c.id).subscribe({
      next: (q) => {
        this.busy.set(false);
        this.router.navigate(['/quotes', q.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  /** Registrerar kundens svar på ett jobb. */
  answer(jobId: string, status: 'approved' | 'declined' | null, method?: AnswerMethod) {
    this.api.setApproval(this.id!, jobId, { status, method }).subscribe(() => this.load());
  }

  /** Skapar säljkortet för ordern (eller öppnar det som finns) och går dit. */
  createSalesCard() {
    this.busy.set(true);
    this.salesApi.create({ workOrderId: this.id! }).subscribe({
      next: (c) => {
        this.busy.set(false);
        void this.router.navigate(['/sales', c.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    const o = this.card()!;
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Ta bort ${o.code}?`,
          message: 'Arbetsordern och alla dess rader tas bort. Det går inte att ångra.',
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) =>
          ok &&
          this.api.remove(o.id).subscribe(() => {
            this.form.markAsPristine();
            this.router.navigate(['/workorders']);
          }),
      );
  }
}
