import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { addDays, format } from 'date-fns';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  of,
  switchMap,
} from 'rxjs';
import { InventoryApi } from '../../core/api/inventory-api';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { Auth } from '../../core/auth/auth';
import { StorageApi } from '../../core/api/storage-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import {
  Article,
  Customer,
  DocumentChoice,
  InvoiceKind,
  paidWith,
  PaymentMethod,
  paymentLabel,
  paymentOptions,
  SalesCardDetail,
  SalesCardInput,
  SalesLineType,
  SalesSection,
  SellerDetails,
  ServiceType,
  StorageDeposit,
} from '../../core/models';
import { Pricing } from '../../core/pricing';
import { HasUnsaved } from '../../core/unsaved-guard';
import { Confirm } from '../../shared/confirm';
import { Gap, invoiceGap, sellerGap } from '../../shared/invoice-gap';
import { openSettings } from '../settings/settings';
import { dueNote } from '../../shared/invoice-status';
import { type PickerValue } from '../../shared/customer-vehicle-picker/customer-vehicle-picker';
import { LinkResolver } from '../../shared/customer-vehicle-picker/link-resolver';
import {
  groupAmounts,
  inMode,
  netOf,
  rowAmounts,
  STANDARD_VAT,
  totalsOf,
  VAT_OPTIONS,
  vatLabel,
  vatOn,
} from '../../shared/vat';

/** En rad som den redigeras: priset i kronor i kortets prisläge. */
interface Row {
  key: string;
  id?: string;
  type: SalesLineType;
  code?: string | null;
  sectionId?: string | null;
  description: string;
  articleId?: string;
  depositId?: string;
  quantity: number;
  /** Kronor per styck, i kortets prisläge. */
  price: number;
  discountPercent: number;
  vatRate: number;
  /** Mest man kan sälja av en artikel (lagersaldot). */
  maxQty?: number;
}

let seq = 0;
const key = () => `r${++seq}`;
const ore = (kr: number) => Math.round((kr || 0) * 100);
/** Dagen som ÅÅÅÅ-MM-DD i datorns tid. */
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
/** Mitt på dagen: en dag som skickas till servern ska inte hamna på fel datum i en annan tidszon. */
const noonOf = (day: string) => new Date(`${day}T12:00:00`).toISOString();

/**
 * Säljkortet: en affär med kund, rader, rabatt, bokföring (kvitto eller faktura) och betalning,
 * som ett säljkort i ett affärssystem. Ett utkast kan ändras fritt; bokförs kortet minskar
 * lagret och dokumentet får sitt nummer, och därefter går bara betalningen att ändra.
 */
@Component({
  selector: 'app-sales-card',
  standalone: false,
  template: `
    <app-card-page
      [wide]="true"
      listLink="/sales"
      listLabel="Försäljning"
      newTitle="Ny försäljning"
      [title]="title()"
      [code]="card()?.code ?? null"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          @if (c.status === 'draft' && !c.reservedDocumentCode) {
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
          @if (c.status === 'posted') {
            @if (isOwner) {
              <button
                mat-stroked-button
                type="button"
                [disabled]="busy() || !!reopenBlocked(c)"
                [matTooltip]="reopenBlocked(c) || 'Tar tillbaka kortet till ett utkast'"
                (click)="reopen()"
              >
                <mat-icon>undo</mat-icon> Återöppna
              </button>
            }
            <a mat-stroked-button [routerLink]="['/sales', c.id, 'invoice']">
              <mat-icon>print</mat-icon> Visa / skriv ut
            </a>
          }
        }
        @if (!readOnly()) {
          <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
            Spara
          </button>
        }
      </div>

      @if (card()?.status === 'draft' && card()?.reservedDocumentCode) {
        <p class="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <b>Återöppnat.</b> Kortet var
          {{ card()!.reservedKind === 'invoice' ? 'en faktura' : 'ett kvitto' }},
          {{ card()!.reservedDocumentCode }}. Rätta det som är fel och bokför igen som
          {{ card()!.reservedKind === 'invoice' ? 'faktura' : 'kvitto' }}: samma nummer används på
          nytt. Kortet går inte att ta bort, eftersom numret redan är utfärdat.
        </p>
      }

      @if (card()?.status === 'posted') {
        <p class="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          <b
            >Bokfört som {{ card()!.kind === 'invoice' ? 'faktura' : 'kvitto' }}
            {{ card()!.documentCode }}.</b
          >
          Kortet är låst: rader, priser och rabatt kan inte ändras (ett utfärdat dokument får inte
          ändras i efterhand). Betalningen går att ändra.
        </p>
      }

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-2 text-base font-semibold">Kund och bil</h2>
        @if (readOnly()) {
          <div class="text-sm">
            @if (card()?.links?.customer; as cu) {
              <a class="text-brand" [routerLink]="['/customers', cu.id]">{{ cu.name }}</a>
              <span class="text-gray-500"> · {{ cu.code }}</span>
            } @else {
              Kontantkund
            }
            @if (card()?.links?.vehicle; as v) {
              · <a class="text-brand" [routerLink]="['/vehicles', v.id]">{{ v.regNo }}</a>
              {{ v.label }}
            }
          </div>
        } @else {
          <app-customer-vehicle-picker
            [formControl]="linkCtl"
            [optional]="true"
            customerLabel="Kund (tomt = kontantförsäljning)"
          />
        }
      </section>

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-3 text-base font-semibold">Rader</h2>

        @if (!readOnly()) {
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <div class="relative min-w-60 flex-1">
              <mat-icon class="pointer-events-none absolute top-2.5 left-3 text-gray-400"
                >search</mat-icon
              >
              <input
                type="search"
                [formControl]="search"
                (keydown.enter)="addFirst()"
                placeholder="Lägg till artikel: storlek, märke, artikelnummer…"
                class="h-11 w-full pr-3 pl-11 field"
              />
              @if (results().length) {
                <div
                  class="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-xl bg-white shadow-lg"
                >
                  @for (a of results(); track a.id) {
                    <button
                      type="button"
                      class="hover:bg-brand-soft flex w-full items-center justify-between gap-3 border-b px-4 py-2 text-left last:border-b-0"
                      (click)="addArticle(a)"
                    >
                      <span class="truncate">
                        <span class="font-medium">{{ a.sizeLabel }}</span> · {{ a.brand }}
                        {{ a.model }}
                      </span>
                      <span class="flex shrink-0 items-center gap-3 text-sm">
                        <span class="text-gray-600">{{ a.quantity }} st</span>
                        <span class="font-medium">{{ a.sellPrice | kr }}</span>
                      </span>
                    </button>
                  }
                </div>
              }
            </div>
            <button mat-stroked-button type="button" [matMenuTriggerFor]="serviceMenu">
              <mat-icon>build</mat-icon> Åtgärd
            </button>
            <button
              mat-stroked-button
              type="button"
              [matMenuTriggerFor]="hotelMenu"
              (menuOpened)="loadDeposits()"
            >
              <mat-icon>warehouse</mat-icon> Däckhotell
            </button>
            <button mat-stroked-button type="button" (click)="addLabour()">
              <mat-icon>schedule</mat-icon> Arbete
            </button>
            <button mat-stroked-button type="button" (click)="addFree()">
              <mat-icon>add</mat-icon> Fri rad
            </button>
          </div>
          <mat-menu #serviceMenu="matMenu">
            @for (s of serviceTypes(); track s.id) {
              <button mat-menu-item type="button" (click)="addService(s)">
                {{ s.name }}
                @if (s.priceFrom) {
                  <span class="ml-2 text-gray-500">{{ s.priceFrom | kr }}</span>
                }
              </button>
            } @empty {
              <span class="px-4 py-2 text-sm text-gray-500">Inga åtgärder inlagda</span>
            }
          </mat-menu>
          <mat-menu #hotelMenu="matMenu">
            @for (d of deposits(); track d.id) {
              <button mat-menu-item type="button" (click)="addDeposit(d)">
                {{ d.code }} · {{ d.vehicle.regNo }} · {{ d.fee | kr }}
              </button>
            } @empty {
              <span class="px-4 py-2 text-sm text-gray-500">
                {{ depositsHint() }}
              </span>
            }
          </mat-menu>
        }

        @if (rows().length) {
          <div class="overflow-x-auto">
            <table class="w-full min-w-[640px] text-left text-sm">
              <thead
                class="border-b border-gray-100 text-xs font-medium tracking-wide text-gray-500 uppercase"
              >
                <tr>
                  <th class="py-2">Beskrivning</th>
                  <th class="w-20 py-2 text-right">Antal</th>
                  <th class="w-32 py-2 text-right">À-pris</th>
                  <th class="w-24 py-2 text-right">Rabatt %</th>
                  <th class="w-28 py-2 text-right">Summa</th>
                  <th class="w-10 py-2"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (g of display(); track g.key) {
                  @for (it of g.items; track it.r.key) {
                    @let r = it.r;
                    @let i = it.i;
                    <tr class="align-top">
                      <td class="py-2 pr-2">
                        @if (readOnly() || r.type === 'storage') {
                          <div class="py-2">{{ r.description }}</div>
                        } @else {
                          <input
                            class="h-10 w-full px-2 field"
                            [value]="r.description"
                            (input)="edit(i, { description: $any($event.target).value })"
                          />
                        }
                        @if (
                          r.type === 'article' && r.maxQty !== undefined && r.quantity > r.maxQty
                        ) {
                          <div class="text-xs text-red-600">Bara {{ r.maxQty }} st i lager.</div>
                        }
                      </td>
                      <td class="py-2 pr-2 text-right">
                        @if (readOnly() || r.type === 'storage') {
                          <div class="py-2 tabular-nums">{{ r.quantity }}</div>
                        } @else {
                          <input
                            type="number"
                            min="0"
                            [step]="r.type === 'article' ? 1 : 0.25"
                            class="h-10 w-full px-2 text-right field"
                            [value]="r.quantity"
                            (focus)="$any($event.target).select()"
                            (input)="edit(i, { quantity: $any($event.target).valueAsNumber })"
                          />
                        }
                      </td>
                      <td class="py-2 pr-2 text-right">
                        @if (readOnly()) {
                          <div class="py-2 tabular-nums">{{ r.price * 100 | kr }}</div>
                        } @else {
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            class="h-10 w-full px-2 text-right field"
                            [value]="r.price"
                            (focus)="$any($event.target).select()"
                            (input)="edit(i, { price: $any($event.target).valueAsNumber })"
                          />
                        }
                      </td>
                      <td class="py-2 pr-2 text-right">
                        @if (readOnly()) {
                          <div class="py-2 tabular-nums">{{ r.discountPercent || '' }}</div>
                        } @else {
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            class="h-10 w-full px-2 text-right field"
                            [value]="r.discountPercent || ''"
                            (focus)="$any($event.target).select()"
                            (input)="
                              edit(i, { discountPercent: $any($event.target).valueAsNumber || 0 })
                            "
                          />
                        }
                      </td>
                      <td class="py-2 text-right tabular-nums">
                        <div class="py-2">{{ amounts()[i] | kr }}</div>
                      </td>
                      <td class="py-2 text-right">
                        @if (!readOnly()) {
                          <button
                            mat-icon-button
                            type="button"
                            (click)="removeRow(i)"
                            aria-label="Ta bort raden"
                          >
                            <mat-icon>close</mat-icon>
                          </button>
                        }
                      </td>
                    </tr>
                  }
                  @if (g.section; as sec) {
                    <tr class="bg-gray-50">
                      <td class="py-2 pl-2 font-semibold" colspan="3">Delsumma {{ sec.title }}</td>
                      <td class="py-2 pr-2 text-right text-xs text-gray-500" colspan="1">
                        @if (readOnly()) {
                          {{ sec.fixedPrice != null ? 'Fast pris' : '' }}
                        } @else {
                          <input
                            type="number"
                            min="0"
                            placeholder="Fast pris"
                            aria-label="Fast pris för jobbet"
                            class="h-9 w-full px-2 text-right field"
                            [value]="sec.fixedPrice != null ? sec.fixedPrice / 100 : ''"
                            (input)="setFixed(sec.id, $any($event.target).value)"
                          />
                        }
                      </td>
                      <td class="py-2 text-right font-semibold tabular-nums">
                        {{ sectionTotals()[sec.id] ?? 0 | kr }}
                      </td>
                      <td></td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            Inga rader än. Sök en artikel ovan, eller lägg till en åtgärd, ett däckhotell eller en
            fri rad.
          </p>
        }
      </section>

      <div class="grid items-start gap-4 lg:grid-cols-2">
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Rabatt på hela kortet</h2>
          @if (readOnly()) {
            <p class="text-sm">
              @if (card()?.discount; as d) {
                {{ d.type === 'percent' ? d.value + ' %' : (d.value | kr) }}
                @if (d.reason) {
                  <span class="text-gray-500"> · {{ d.reason }}</span>
                }
              } @else {
                Ingen rabatt.
              }
            </p>
          } @else {
            <div class="flex flex-wrap items-start gap-3">
              <mat-button-toggle-group
                hideSingleSelectionIndicator
                [value]="discType()"
                (change)="discType.set($event.value); touch()"
                aria-label="Typ av rabatt"
              >
                <mat-button-toggle value="percent">%</mat-button-toggle>
                <mat-button-toggle value="amount">kr</mat-button-toggle>
              </mat-button-toggle-group>
              <mat-form-field subscriptSizing="dynamic" class="w-36">
                <mat-label>{{ discType() === 'percent' ? 'Procent' : 'Kronor' }}</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  [value]="discValue() || ''"
                  (input)="discValue.set($any($event.target).valueAsNumber || 0); touch()"
                />
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic" class="min-w-52 flex-1">
                <mat-label>Anledning (syns inte på kvittot)</mat-label>
                <input
                  matInput
                  [value]="discReason()"
                  (input)="discReason.set($any($event.target).value); touch()"
                  placeholder="t.ex. 4 bilar på däckhotell"
                />
              </mat-form-field>
            </div>
          }
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="ml-auto max-w-sm text-sm">
            @if (totals().discount > 0) {
              <div class="flex justify-between py-0.5 text-gray-600">
                <span>Före rabatt</span><span>{{ totals().gross | kr }}</span>
              </div>
              <div class="flex justify-between py-0.5 text-green-700">
                <span>Rabatt</span><span>−{{ totals().discount | kr }}</span>
              </div>
            }
            <div class="flex justify-between py-0.5 text-gray-600">
              <span>Summa exkl. moms</span><span>{{ totals().net | kr }}</span>
            </div>
            @for (b of totals().byRate; track b.rate) {
              <div class="flex justify-between py-0.5 text-gray-600">
                <span>{{ incl() ? 'Varav moms' : 'Moms' }} {{ b.rate }} %</span
                ><span>{{ b.vat | kr }}</span>
              </div>
            }
            @if (totals().rounding) {
              <div class="flex justify-between py-0.5 text-gray-600">
                <span>Öresutjämning</span><span>{{ totals().rounding! | kr }}</span>
              </div>
            }
            <div class="mt-1 flex justify-between gap-6 border-t pt-1 text-lg font-semibold">
              <span>Att betala inkl. moms</span><span>{{ totals().total | kr }}</span>
            </div>
          </div>
        </section>
      </div>

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-2 text-base font-semibold">Text och anteckning</h2>
        <div class="grid gap-x-4 sm:grid-cols-2">
          <mat-form-field class="sm:col-span-2">
            <mat-label>Text under raderna på kvittot</mat-label>
            <textarea
              matInput
              rows="2"
              [disabled]="readOnly()"
              [value]="performed()"
              (input)="performed.set($any($event.target).value); touch()"
              placeholder="t.ex. Bytt däck och balanserat"
            ></textarea>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Garanti</mat-label>
            <input
              matInput
              [disabled]="readOnly()"
              [value]="warranty()"
              (input)="warranty.set($any($event.target).value); touch()"
            />
          </mat-form-field>
          <mat-form-field>
            <mat-label>Intern anteckning</mat-label>
            <input
              matInput
              [disabled]="readOnly()"
              [value]="note()"
              (input)="note.set($any($event.target).value); touch()"
            />
          </mat-form-field>
        </div>
      </section>

      @if (card(); as c) {
        @if (c.status === 'draft') {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-1 text-base font-semibold">Bokför</h2>
            <p class="mb-3 text-sm text-gray-600">
              Vad ska kunden få? Vid bokföring minskar lagret för artiklarna på raderna och
              dokumentet får sitt nummer i sin egen serie. Därefter går kortet inte att ändra, och
              ett kvitto kan inte göras om till en faktura. Tills dess kan du förhandsgranska
              utkastet.
            </p>
            <mat-radio-group
              class="mb-4 grid gap-3 sm:grid-cols-2"
              aria-label="Vad kunden får"
              [value]="kind()"
              [disabled]="!!c.reservedKind"
              (change)="docKind.set($event.value)"
            >
              <label class="choice" [class.is-on]="kind() === 'invoice'">
                <mat-radio-button value="invoice" class="font-medium">Faktura</mat-radio-button>
                <span class="choice-text"
                  >Kunden betalar senare, inom betalningsvillkoren. Får ett fakturanummer (FAK-) och
                  hamnar under Fakturor. Passar företag och större jobb.</span
                >
              </label>
              <label class="choice" [class.is-on]="kind() === 'receipt'">
                <mat-radio-button value="receipt" class="font-medium">Kvitto</mat-radio-button>
                <span class="choice-text"
                  >Kunden betalar nu. Får ett kvittonummer (KV-) och hamnar under Kvitton, inte
                  bland fakturorna.</span
                >
              </label>
            </mat-radio-group>
            @if (kind() === 'invoice') {
              <div class="flex flex-wrap items-start gap-3">
                <mat-form-field class="w-56" subscriptSizing="dynamic">
                  <mat-label>Betalningsvillkor (dagar)</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    max="365"
                    [value]="terms()"
                    (input)="termsDays.set($any($event.target).valueAsNumber)"
                  />
                  <mat-hint>Förfaller {{ dueDate() }}</mat-hint>
                </mat-form-field>
              </div>
            } @else {
              <mat-form-field class="w-56" subscriptSizing="dynamic">
                <mat-label>Betalsätt</mat-label>
                <mat-select
                  [value]="receiptMethod()"
                  (selectionChange)="receiptMethod.set($event.value)"
                >
                  @for (m of receiptMethods; track m[0]) {
                    <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <b>Kassaregister:</b> kontant-, kort- och Swish-försäljning till privatpersoner
                kräver ett certifierat kassaregister, om försäljningen över ett år överstiger fyra
                prisbasbelopp inkl. moms (236 800 kr för 2026). Det här systemet är inget
                kassaregister. Kontrollera med Skatteverket eller er revisor.
              </p>
            }
            @if (blocker(); as b) {
              <app-callout class="mt-3" [fixes]="b.fixes">{{ b.text }}</app-callout>
            }
            @if (dirty()) {
              <p class="mt-3 text-sm text-gray-500">Spara ändringarna först.</p>
            }
            <div class="mt-4 flex flex-wrap gap-2">
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="dirty() || busy() || !rows().length || !!blocker()"
                (click)="post()"
              >
                <mat-icon>receipt_long</mat-icon>
                {{ kind() === 'invoice' ? 'Bokför som faktura' : 'Bokför som kvitto' }}
              </button>
              <a
                mat-stroked-button
                [routerLink]="['/sales', c.id, 'invoice']"
                [queryParams]="choiceParams()"
                [class.pointer-events-none]="dirty() || !rows().length"
              >
                <mat-icon>visibility</mat-icon> Förhandsgranska utkast
              </a>
            </div>
          </section>
        } @else if (c.document; as inv) {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-2 text-base font-semibold">
              {{ inv.kind === 'invoice' ? 'Betalning av fakturan' : 'Betalning' }}
            </h2>
            @if (inv.kind === 'receipt') {
              <!-- Ett kvitto är betalt när det utfärdas: det finns ingenting att registrera efteråt. -->
              <div class="flex flex-wrap items-center gap-3">
                <app-pill tone="green"
                  >Betalt {{ inv.paidAt | date: 'yyyy-MM-dd' }}
                  @if (inv.paymentMethod) {
                    · {{ payLabel(inv.kind, inv.paymentMethod) }}
                  }
                </app-pill>
                <span class="text-sm text-gray-600"
                  >Ett kvitto är betalt när det utfärdas. Blev det fel: återöppna kortet.</span
                >
              </div>
            } @else {
              @if (inv.dueAt) {
                <p class="mb-3 text-sm text-gray-600">
                  Förfaller <b>{{ inv.dueAt | date: 'yyyy-MM-dd' }}</b>
                  @if (late(inv)) {
                    <span class="font-medium text-red-700"> · {{ late(inv) }}</span>
                  } @else if (!inv.paidAt) {
                    <span> · {{ dueNote(inv) }}</span>
                  }
                </p>
              }
              <div class="flex flex-wrap items-center gap-3">
                @if (inv.paidAt) {
                  <app-pill tone="green"
                    >Betald {{ inv.paidAt | date: 'yyyy-MM-dd' }}
                    @if (inv.paymentMethod) {
                      · {{ payLabel(inv.kind, inv.paymentMethod) }}
                    }
                  </app-pill>
                  <button mat-button type="button" (click)="setPaid(false)">Ångra betalning</button>
                } @else {
                  <mat-form-field subscriptSizing="dynamic" class="w-48">
                    <mat-label>Betalsätt</mat-label>
                    <mat-select
                      [value]="payMethod()"
                      (selectionChange)="payMethod.set($event.value)"
                    >
                      @for (m of payOptions(); track m[0]) {
                        <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <app-date-field
                    class="w-48"
                    label="Betaldatum"
                    subscript="dynamic"
                    [max]="today"
                    [formControl]="paidOn"
                  />
                  <button mat-flat-button color="primary" type="button" (click)="setPaid(true)">
                    Markera betald
                  </button>
                }
              </div>
            }
          </section>
        }

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Hör ihop med</h2>
          <div class="flex flex-wrap gap-2 text-sm">
            @if (c.links.customer; as cu) {
              <a mat-stroked-button [routerLink]="['/customers', cu.id]">
                <mat-icon>person</mat-icon> {{ cu.name }}
              </a>
            }
            @if (c.links.vehicle; as v) {
              <a mat-stroked-button [routerLink]="['/vehicles', v.id]">
                <mat-icon>directions_car</mat-icon> {{ v.regNo }}
              </a>
            }
            @if (c.links.workOrder; as w) {
              <a mat-stroked-button [routerLink]="['/workorders', w.id]">
                <mat-icon>handyman</mat-icon> {{ w.code }}
              </a>
            }
            @for (d of c.links.deposits; track d.id) {
              <a mat-stroked-button [routerLink]="['/storage', d.id]">
                <mat-icon>warehouse</mat-icon> {{ d.code }} · {{ d.regNo }}
              </a>
            }
            @if (
              !c.links.customer &&
              !c.links.vehicle &&
              !c.links.workOrder &&
              !c.links.deposits.length
            ) {
              <span class="text-gray-500">Kontantförsäljning utan kund.</span>
            }
          </div>
        </section>
      }
    </app-card-page>
  `,
})
export class SalesCardPage implements OnInit, HasUnsaved {
  private readonly api = inject(SalesCardApi);
  private readonly inventory = inject(InventoryApi);
  private readonly storage = inject(StorageApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly pricing = inject(Pricing);
  private readonly links = inject(LinkResolver);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(Auth);
  /** Bara ägaren återöppnar ett bokfört kort. */
  readonly isOwner = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly id = this.route.snapshot.paramMap.get('id');

  readonly payLabel = paymentLabel;
  readonly dueNote = dueNote;
  readonly receiptMethods = paymentOptions('receipt');
  readonly vatOptions = VAT_OPTIONS;
  readonly vatLabel = vatLabel;
  /** Kortets prisläge: inkl. moms (standard) eller exkl. moms. */
  readonly incl = signal(true);
  /** Valt för hand eller kommer från ett sparat kort, så kundbyte inte ändrar det. */
  private inclFixed = false;
  readonly sections = signal<SalesSection[]>([]);
  /** Kunden, för kundtyp och kundrabatt. */
  private readonly customer = signal<Customer | null>(null);

  readonly card = signal<SalesCardDetail | null>(null);
  readonly rows = signal<Row[]>([]);
  readonly linkCtl = new FormControl<PickerValue | null>(null);
  private readonly link = signal<PickerValue | null>(null);
  readonly discType = signal<'percent' | 'amount'>('percent');
  readonly discValue = signal(0);
  readonly discReason = signal('');
  readonly note = signal('');
  readonly performed = signal('');
  readonly warranty = signal('');
  readonly dirty = signal(false);
  readonly busy = signal(false);
  /** Hur kunden betalar. Gäller ett bokfört dokument: en faktura betalas oftast in på banken. */
  readonly payMethod = signal<PaymentMethod>('card');
  /** Dagen betalningen kom in (standard i dag); en faktura betalas ofta dagar efter att den bokfördes. */
  readonly today = ymd(new Date());
  readonly paidOn = new FormControl(ymd(new Date()), { nonNullable: true });
  readonly payOptions = computed(() => paymentOptions(this.card()?.kind ?? 'receipt'));

  /**
   * Vad kunden får när kortet bokförs: faktura (betalar senare) eller kvitto (betalar nu). Valt för
   * hand, annars följer det kunden: ett företag får faktura, alla andra kvitto. "Ny faktura" på
   * Fakturor börjar med faktura (`?kind=invoice`).
   */
  readonly docKind = signal<InvoiceKind | null>(null);
  readonly kind = computed<InvoiceKind>(
    () =>
      this.card()?.kind ??
      // Ett återöppnat kort är samma dokument igen: numret hör till dess serie.
      this.card()?.reservedKind ??
      this.docKind() ??
      (this.customer()?.type === 'company' ? 'invoice' : 'receipt'),
  );
  /** Betalningsvillkoren som verkstaden har ställt in (Företaget), tills man skriver egna dagar. */
  private readonly defaultTerms = signal(30);
  readonly termsDays = signal<number | null>(null);
  readonly terms = computed(() => {
    const t = this.termsDays();
    return t != null && Number.isFinite(t) && t >= 0
      ? Math.min(Math.round(t), 365)
      : this.defaultTerms();
  });
  readonly dueDate = computed(() => ymd(addDays(new Date(), this.terms())));
  readonly receiptMethod = signal<PaymentMethod>('card');

  /** Verkstadens egna uppgifter (Inställningar → Företaget): varje faktura och kvitto bär dem. */
  private readonly seller = signal<SellerDetails | null>(null);
  /** Valet som löser en faktura som inte går att skriva: ett kvitto kräver varken kund eller adress. */
  private readonly receiptFix = {
    label: 'Bokför som kvitto',
    icon: 'receipt',
    click: () => this.docKind.set('receipt'),
  };

  /**
   * Det som hindrar bokföring just nu, med en knapp dit det rättas. Först verkstadens egna uppgifter
   * (gäller faktura och kvitto), sedan en faktura som behöver en kund med adress.
   */
  readonly blocker = computed<Gap | null>(() => {
    const own = sellerGap(this.seller(), this.isOwner, () => this.openCompanySettings());
    if (own) return own;
    if (this.kind() !== 'invoice') return null;
    const l = this.link();
    if (!l?.customerId && !l?.pending?.customerId && !l?.pending?.customerName) {
      return {
        text: 'En faktura behöver en kund. Välj kund högst upp, eller bokför som kvitto.',
        fixes: [this.receiptFix],
      };
    }
    const gap = invoiceGap(this.customer());
    return gap && { ...gap, fixes: [...gap.fixes, this.receiptFix] };
  });

  /** Öppnar Inställningar → Företaget och läser om uppgifterna när man stänger. */
  private openCompanySettings() {
    void openSettings(this.dialog, 'foretag').then((ref) =>
      ref.afterClosed().subscribe(() => this.loadSeller()),
    );
  }

  private loadSeller() {
    this.inventory
      .seller()
      .pipe(catchError(() => of(null)))
      .subscribe((s) => {
        if (!s) return;
        this.seller.set(s);
        this.defaultTerms.set(s.paymentTermsDays);
      });
  }

  readonly search = new FormControl('', { nonNullable: true });
  readonly results = signal<Article[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly deposits = signal<StorageDeposit[]>([]);
  readonly depositsHint = signal('Välj en kund först för att se kundens däckhotell.');

  readonly readOnly = computed(() => this.card()?.status === 'posted');
  readonly title = computed(() => {
    const c = this.card();
    if (!c) return '';
    return [c.regNo, c.customerName ?? 'Kontantkund'].filter(Boolean).join(' · ');
  });

  private readonly priced = computed(() =>
    this.rows().map((r) => ({
      quantity: r.quantity || 0,
      unitPrice: ore(r.price),
      discountPercent: r.discountPercent || 0,
      vatRate: r.vatRate,
      group: r.sectionId ?? null,
    })),
  );
  private readonly groups = computed(() =>
    this.sections()
      .filter((x) => x.fixedPrice != null)
      .map((x) => ({ id: x.id, fixedPrice: x.fixedPrice })),
  );
  /** Raderna under sina jobb, sedan raderna utan jobb; med radens index. */
  readonly display = computed(() => {
    const items = this.rows().map((r, i) => ({ r, i }));
    const ids = new Set(this.sections().map((x) => x.id));
    return [
      ...this.sections().map((section) => ({
        key: section.id,
        section,
        items: items.filter((x) => x.r.sectionId === section.id),
      })),
      {
        key: '_',
        section: null,
        items: items.filter((x) => !x.r.sectionId || !ids.has(x.r.sectionId)),
      },
    ].filter((g) => g.items.length || g.section);
  });
  readonly sectionTotals = computed(() =>
    groupAmounts(this.priced(), rowAmounts(this.priced(), null, this.groups())),
  );
  private readonly discount = computed(() =>
    this.discValue() > 0
      ? {
          type: this.discType(),
          value: this.discType() === 'amount' ? ore(this.discValue()) : this.discValue(),
        }
      : null,
  );
  readonly amounts = computed(() => rowAmounts(this.priced(), this.discount(), this.groups()));
  /** Summan medan man skriver; efter bokföring gäller det som frystes. */
  readonly totals = computed(() =>
    this.readOnly() && this.card()?.document
      ? this.card()!.document!.totals
      : totalsOf(this.priced(), this.discount(), {
          pricesIncludeVat: this.incl(),
          roundToKrona: this.card()?.roundToKrona ?? this.pricing.value().roundToKrona,
          groups: this.groups(),
        }),
  );

  constructor() {
    this.search.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) =>
          q.trim() ? this.inventory.articles({ q: q.trim(), limit: 8, inStock: true }) : of(null),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((p) => this.results.set(p?.items ?? []));
    this.linkCtl.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.link.set(v);
      this.loadCustomer(v?.customerId);
      this.touch();
    });
  }

  ngOnInit() {
    this.workshop.serviceTypes().subscribe((l) => this.serviceTypes.set(l));
    this.loadSeller();
    // "Ny faktura" (och sidan efter första sparningen) bär valet i adressen.
    const kind = this.route.snapshot.queryParamMap.get('kind');
    if (kind === 'invoice' || kind === 'receipt') this.docKind.set(kind);
    if (this.id && this.id !== 'new') {
      this.load(this.id);
      return;
    }
    // Länkar från kund-, bil-, arbetsorder- och däckhotellskort fyller i vad det gäller.
    const q = this.route.snapshot.queryParamMap;
    const customerId = q.get('customerId');
    const vehicleId = q.get('vehicleId');
    if (customerId || vehicleId) {
      this.linkCtl.setValue({ customerId: customerId ?? '', vehicleId: vehicleId ?? '' });
    }
    // "Sälj" på en artikel öppnar ett nytt kort med artikeln på första raden.
    const articleId = q.get('articleId');
    if (articleId) {
      this.inventory.article(articleId).subscribe((a) => this.addArticle(a));
    }
    const depositId = q.get('depositId');
    if (depositId) {
      this.storage.deposit(depositId).subscribe((d) => {
        if (!customerId && d.customerId) {
          this.linkCtl.setValue({ customerId: d.customerId, vehicleId: d.vehicleId ?? '' });
        }
        this.addDeposit(d);
      });
    }
    this.dirty.set(false);
  }

  hasUnsaved() {
    return this.dirty();
  }

  /** Kundtypen styr ett nytt korts prisläge (Prissättning); kundens rabatt förifyller rader. */
  private loadCustomer(customerId: string | undefined) {
    if (!customerId) {
      this.customer.set(null);
      if (!this.inclFixed) this.setIncl(this.pricing.includeVatFor(false));
      return;
    }
    this.workshop.customer(customerId).subscribe((c) => {
      this.customer.set(c);
      if (!this.inclFixed) this.setIncl(this.pricing.includeVatFor(c.type === 'company'));
    });
  }

  /** Byter prisläge och räknar om radernas priser så att kunden betalar detsamma. */
  private setIncl(toIncl: boolean) {
    if (toIncl === this.incl()) return;
    const conv = (k: number, rate: number) => {
      const o = ore(k);
      return (toIncl ? o + vatOn(o, rate) : netOf(o, rate)) / 100;
    };
    this.rows.update((rs) => rs.map((r) => ({ ...r, price: conv(r.price, r.vatRate) })));
    this.sections.update((xs) =>
      xs.map((x) =>
        x.fixedPrice == null
          ? x
          : { ...x, fixedPrice: Math.round(conv(x.fixedPrice / 100, STANDARD_VAT) * 100) },
      ),
    );
    if (this.discType() === 'amount' && this.discValue()) {
      this.discValue.set(conv(this.discValue(), STANDARD_VAT));
    }
    this.incl.set(toIncl);
  }

  switchVat(toIncl: boolean) {
    this.inclFixed = true;
    this.setIncl(toIncl);
    this.touch();
  }

  /** Fast pris på ett jobb (kr i kortets prisläge); tomt = radernas egna priser. */
  setFixed(id: string, value: string) {
    const o = value === '' ? null : Math.round(Number(value) * 100);
    this.sections.update((xs) =>
      xs.map((x) => (x.id === id ? { ...x, fixedPrice: Number.isNaN(o) ? null : o } : x)),
    );
    this.touch();
  }

  touch() {
    this.dirty.set(true);
  }

  private load(id: string) {
    this.api.get(id).subscribe((c) => this.apply(c));
  }

  private apply(c: SalesCardDetail) {
    this.card.set(c);
    this.inclFixed = true;
    this.incl.set(c.pricesIncludeVat ?? true);
    this.sections.set(c.sections ?? []);
    this.rows.set(
      c.lines.map((l) => ({
        key: key(),
        id: l.id,
        type: l.type,
        code: l.code ?? null,
        sectionId: l.sectionId ?? null,
        description: l.description,
        articleId: l.articleId ?? undefined,
        depositId: l.depositId ?? undefined,
        quantity: l.quantity,
        price: l.unitPrice / 100,
        discountPercent: l.discountPercent,
        vatRate: l.vatRate,
      })),
    );
    this.linkCtl.setValue(
      c.customerId || c.vehicleId
        ? { customerId: c.customerId ?? '', vehicleId: c.vehicleId ?? '' }
        : null,
      { emitEvent: false },
    );
    this.link.set(this.linkCtl.value);
    if (c.customerId && this.customer()?.id !== c.customerId) this.loadCustomer(c.customerId);
    this.discType.set(c.discount?.type ?? 'percent');
    this.discValue.set(
      c.discount ? (c.discount.type === 'amount' ? c.discount.value / 100 : c.discount.value) : 0,
    );
    this.discReason.set(c.discount?.reason ?? '');
    this.note.set(c.note ?? '');
    this.performed.set(c.performed ?? '');
    this.warranty.set(c.document?.warranty ?? '');
    this.payMethod.set(c.document?.paymentMethod ?? (c.kind === 'invoice' ? 'invoice' : 'card'));
    this.dirty.set(false);
  }

  // --- rader ---

  edit(i: number, patch: Partial<Row>) {
    this.rows.update((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    this.touch();
  }

  removeRow(i: number) {
    this.rows.update((rs) => rs.filter((_, j) => j !== i));
    this.touch();
  }

  private push(r: Omit<Row, 'key'>) {
    this.rows.update((rs) => [...rs, { key: key(), ...r }]);
    this.touch();
  }

  addArticle(a: Article) {
    const i = this.rows().findIndex((r) => r.articleId === a.id);
    if (i >= 0) {
      this.edit(i, { quantity: this.rows()[i].quantity + 1 });
    } else {
      this.push({
        type: 'article',
        description: `${a.sizeLabel} ${a.brand ?? ''} ${a.model ?? ''}`.replace(/\s+/g, ' ').trim(),
        articleId: a.id,
        quantity: 1,
        code: a.sku,
        price: inMode(a.sellPrice, this.incl()) / 100,
        discountPercent: this.customer()?.partsDiscount ?? 0,
        vatRate: STANDARD_VAT,
        maxQty: a.quantity,
      });
    }
    this.search.setValue('', { emitEvent: false });
    this.results.set([]);
  }

  addFirst() {
    const [first] = this.results();
    if (first) this.addArticle(first);
  }

  addService(s: ServiceType) {
    this.push({
      type: 'service',
      code: s.opCode ?? null,
      description: s.name,
      quantity: 1,
      price: inMode(s.priceFrom ?? 0, this.incl()) / 100,
      discountPercent: this.customer()?.labourDiscount ?? 0,
      vatRate: STANDARD_VAT,
    });
  }

  /**
   * Arbetsrad: en åtgärd med ett pris. Kunden ser aldrig timmar eller timpris, så raden har
   * antal 1 och det pris arbetet kostar.
   */
  addLabour() {
    this.push({
      type: 'labour',
      description: 'Arbete',
      quantity: 1,
      price: 0,
      discountPercent: this.customer()?.labourDiscount ?? 0,
      vatRate: STANDARD_VAT,
    });
  }

  addFree() {
    this.push({
      type: 'service',
      description: '',
      quantity: 1,
      price: 0,
      discountPercent: 0,
      vatRate: STANDARD_VAT,
    });
  }

  addDeposit(d: StorageDeposit) {
    if (this.rows().some((r) => r.depositId === d.id)) return;
    this.push({
      type: 'storage',
      description: `Däckhotell ${d.vehicle.regNo}`,
      depositId: d.id,
      quantity: 1,
      price: inMode(d.fee, this.incl()) / 100,
      discountPercent: 0,
      vatRate: STANDARD_VAT,
    });
  }

  /** Kundens däck som ligger i hotellet och inte är betalda eller redan på kortet. */
  loadDeposits() {
    const customerId = this.link()?.customerId || this.card()?.customerId;
    if (!customerId) {
      this.deposits.set([]);
      this.depositsHint.set('Välj en kund först för att se kundens däckhotell.');
      return;
    }
    this.storage
      .deposits({ status: 'stored', paymentStatus: 'unpaid', limit: 100 })
      .subscribe((p) => {
        const taken = new Set(this.rows().map((r) => r.depositId));
        const list = p.items.filter((d) => d.customerId === customerId && !taken.has(d.id));
        this.deposits.set(list);
        this.depositsHint.set('Kunden har inga obetalda däckhotell att lägga till.');
      });
  }

  // --- spara och bokför ---

  private async body(): Promise<SalesCardInput> {
    const link = this.link();
    const resolved = link ? await firstValueFrom(this.links.resolve(link)) : null;
    return {
      customerId: resolved?.customerId || null,
      vehicleId: resolved?.vehicleId || null,
      pricesIncludeVat: this.incl(),
      sections: this.sections(),
      lines: this.rows().map((r) => ({
        id: r.id,
        type: r.type,
        code: r.code || null,
        sectionId: r.sectionId ?? null,
        description: r.description || undefined,
        articleId: r.articleId,
        depositId: r.depositId,
        quantity: r.quantity,
        unitPrice: ore(r.price),
        discountPercent: r.discountPercent || 0,
        vatRate: r.vatRate,
      })),
      discount: this.discount()
        ? { ...this.discount()!, reason: this.discReason().trim() || undefined }
        : null,
      note: this.note().trim(),
      performed: this.performed().trim(),
      warranty: this.warranty().trim(),
    };
  }

  async save(): Promise<boolean> {
    if (this.rows().some((r) => !(r.quantity > 0) || !(r.price >= 0))) {
      this.snack.open('Kontrollera antal och pris på raderna', 'OK', { duration: 4000 });
      return false;
    }
    this.busy.set(true);
    try {
      const body = await this.body();
      const c = this.card();
      const saved = c
        ? await firstValueFrom(this.api.update(c.id, body))
        : await firstValueFrom(this.api.create(body));
      this.apply(saved);
      this.snack.open(`${saved.code} sparades`, undefined, { duration: 2500 });
      if (!c) {
        await this.router.navigate(['/sales', saved.id], {
          replaceUrl: true,
          queryParams: this.docKind() ? { kind: this.docKind() } : {},
        });
      }
      return true;
    } catch {
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Valet som skickas med när kortet bokförs eller förhandsgranskas. */
  private choice(): DocumentChoice {
    return this.kind() === 'invoice'
      ? { kind: 'invoice', paymentTermsDays: this.terms() }
      : { kind: 'receipt', paymentMethod: this.receiptMethod() };
  }

  /** Samma val som adressparametrar, för förhandsgranskningen. */
  choiceParams() {
    return { ...this.choice() };
  }

  post() {
    const c = this.card();
    if (!c) return;
    const invoice = this.kind() === 'invoice';
    const gets = invoice
      ? `en faktura som förfaller ${this.dueDate()} (${this.terms()} dagar), i fakturaserien (FAK-)`
      : `ett kvitto, betalt ${paidWith('receipt', this.receiptMethod())}, i kvittoserien (KV-)`;
    this.confirm
      .ask({
        title: `Bokför ${c.code} som ${invoice ? 'faktura' : 'kvitto'}?`,
        message: `Kunden får ${gets}. Lagret minskas för artiklarna på raderna och dokumentet får sitt nummer. Därefter går varken kortet eller dokumentet att ändra.`,
        confirmText: 'Bokför',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.post(c.id, this.choice()).subscribe({
          next: (posted) => {
            this.apply(posted);
            this.busy.set(false);
            this.snack.open(`${posted.documentCode} är bokfört`, 'OK', { duration: 4000 });
          },
          error: () => this.busy.set(false),
        });
      });
  }

  /** "5 dagar sen" när en obetald faktura har passerat förfallodatumet. */
  late(inv: { kind: InvoiceKind; dueAt: string | null; paidAt: string | null }) {
    const n = dueNote(inv);
    return n.endsWith('sen') ? n : '';
  }

  /** Skälet till att kortet inte kan återöppnas just nu, annars tomt. */
  reopenBlocked(c: SalesCardDetail) {
    return c.document?.paidAt && c.document.kind === 'invoice'
      ? 'Fakturan är betald. Markera den obetald först.'
      : '';
  }

  /**
   * Återöppnar ett bokfört kort så att ett fel kan rättas. Ett kvitto var betalt på stället och går
   * tillbaka med affären; en betald faktura får ägaren först markera obetald, med flit.
   */
  reopen() {
    const c = this.card();
    if (!c?.document) return;
    const receipt = c.document.kind === 'receipt';
    this.confirm
      .ask({
        title: `Återöppna ${c.documentCode}?`,
        message:
          `Kortet blir ett utkast igen${receipt ? ' och betalningen på kvittot tas bort' : ''}. ` +
          `Delar som lämnade lagret läggs tillbaka, och numret ${c.documentCode} sparas så att det ` +
          `används igen när du bokför som ${receipt ? 'kvitto' : 'faktura'}. Har dokumentet redan ` +
          'gått till kunden ska det i stället krediteras (kreditfaktura finns inte än).',
        confirmText: 'Återöppna',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.reopen(c.id).subscribe({
          next: (r) => {
            this.busy.set(false);
            this.apply(r);
            this.snack.open('Kortet är återöppnat', 'OK', { duration: 4000 });
          },
          error: () => {
            this.busy.set(false);
            this.load(c.id);
          },
        });
      });
  }

  setPaid(paid: boolean) {
    const c = this.card();
    if (!c) return;
    const run = () =>
      this.api
        .setPaid(
          c.id,
          paid,
          paid ? this.payMethod() : undefined,
          paid ? noonOf(this.paidOn.value) : undefined,
        )
        .subscribe((r) => this.apply(r));
    if (paid) {
      run();
      return;
    }
    this.confirm
      .ask({
        title: 'Markera som obetald?',
        message: 'Betalningen och betalsättet tas bort. Däckhotell på kortet förblir betalda.',
        confirmText: 'Markera obetald',
        danger: true,
      })
      .subscribe((ok) => ok && run());
  }

  remove() {
    const c = this.card();
    if (!c) return;
    this.confirm
      .ask({
        title: `Ta bort ${c.code}?`,
        message: 'Utkastet raderas. Inget har bokförts.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.remove(c.id).subscribe(() => {
          this.dirty.set(false);
          void this.router.navigate(['/sales']);
        });
      });
  }
}
