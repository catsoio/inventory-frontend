import { ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ensureValid } from '../../../shared/form-guard';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { InventoryApi } from '../../../core/api/inventory-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import {
  Article,
  CustomerType,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  Resource,
  WORK_ORDER_STATUS_LABELS,
  WorkOrderDetail,
  WorkOrderInput,
  WorkOrderLineType,
  WorkOrderStatus,
} from '../../../core/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { LinkResolver } from '../../../shared/customer-vehicle-picker/link-resolver';
import { Subject, debounceTime, switchMap } from 'rxjs';
import type { PickerValue } from '../../../shared/customer-vehicle-picker/customer-vehicle-picker';
import { dateInput, dateIso } from '../../storage/storage-format';
import { Auth } from '../../../core/auth/auth';
import { totalsOf, withVat } from '../../../shared/vat';
import { QuickArticleDialog } from '../quick-article-dialog/quick-article-dialog';

const ore = (kr: number | null) => (kr == null ? null : Math.round(kr * 100));
const kr = (o: number | null | undefined) => (o == null ? null : o / 100);

/** Arbetsordern: arbetsbladet till mekanikern (utan pris) och, separat, priset och kvittot mellan admin och kund. */
@Component({
  selector: 'app-work-order-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/workorders"
      listLabel="Arbetsorder"
      newTitle="Ny arbetsorder"
      [title]="card() ? card()!.regNo + ' · ' + card()!.customerName : ''"
      [code]="card()?.code ?? null"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          @if (admin && !c.invoice) {
            <button mat-button class="!text-red-700" (click)="remove()">Ta bort</button>
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
        @if (!card()?.invoice) {
          <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
            Spara
          </button>
        }
      </div>

      @if (card()?.invoice; as inv) {
        <p class="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          <b>{{ inv.kind === 'invoice' ? 'Fakturerad' : 'Kvitterad' }} som {{ inv.code }}.</b>
          Ordern är låst: rader, pris och kund kan inte ändras (en utfärdad faktura får inte ändras
          i efterhand).
        </p>
      }

      @if (card()?.hasMissing && card()!.status !== 'done') {
        <p
          class="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          <span><b>Del saknas.</b> Någon rad måste beställas innan jobbet kan bli klart.</span>
          @if (card()!.status !== 'waiting_parts' && !card()!.invoice) {
            <button mat-stroked-button type="button" (click)="waitForParts()">
              Sätt Väntar på del
            </button>
          }
        </p>
      }

      <form [formGroup]="form" class="flex flex-col gap-4">
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Kund och bil</h2>
          <app-customer-vehicle-picker formControlName="link" />
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

          <div class="mb-4 sm:col-span-6">
            <mat-button-toggle-group formControlName="status" hideSingleSelectionIndicator>
              @for (s of statuses; track s[0]) {
                <mat-button-toggle [value]="s[0]">{{ s[1] }}</mat-button-toggle>
              }
            </mat-button-toggle-group>
          </div>

          <mat-form-field class="sm:col-span-6">
            <mat-label>Anmärkning för det här besöket</mat-label>
            <textarea
              matInput
              rows="2"
              formControlName="remarks"
              placeholder="t.ex. Taxibolaget, kommer ofta. Kunden hör ett ljud från höger fram."
            ></textarea>
          </mat-form-field>
          <mat-form-field class="sm:col-span-6">
            <mat-label>Intern anteckning (skrivs inte ut)</mat-label>
            <textarea matInput rows="2" formControlName="notes"></textarea>
          </mat-form-field>
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <h2 class="flex-1 text-base font-semibold">Vad ska göras</h2>
            <button mat-stroked-button type="button" (click)="addLine()">
              <mat-icon>add</mat-icon> Lägg till rad
            </button>
          </div>

          @if (card()?.stockMissing; as n) {
            <p class="mb-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {{ n }} {{ n === 1 ? 'del' : 'delar' }} kunde inte tas ur lagret (saknas eller är
              arkiverad). Justera lagret och spara om ordern.
            </p>
          }
          <div formArrayName="lines" class="flex flex-col">
            @for (row of lines.controls; track row; let i = $index) {
              <div
                [formGroupName]="i"
                class="mt-3 flex flex-col gap-2 rounded-xl border border-gray-200 p-3"
                [class.border-amber-300]="row.value.toOrder"
                [class.bg-amber-50]="row.value.toOrder"
                [class.bg-green-50]="row.value.done && !row.value.toOrder"
              >
                <div class="flex items-center gap-2">
                  <div class="relative min-w-0 flex-1">
                    <mat-icon class="pointer-events-none absolute top-2 left-2 text-gray-400"
                      >search</mat-icon
                    >
                    <input
                      formControlName="description"
                      [matAutocomplete]="auto"
                      (input)="edited(row)"
                      (focus)="typed(row)"
                      autocomplete="off"
                      placeholder="Sök artikel i lagret, eller skriv vad som ska göras…"
                      class="focus:ring-brand h-10 w-full rounded-xl border-0 bg-white pr-3 pl-10 shadow-sm ring-1 ring-gray-200 outline-none focus:ring-2"
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
                  <label class="flex shrink-0 items-center gap-1.5 text-sm text-gray-500">
                    Antal
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      formControlName="quantity"
                      class="focus:ring-brand h-10 w-16 rounded-xl border-0 bg-white px-2 text-center text-gray-900 shadow-sm ring-1 ring-gray-200 outline-none focus:ring-2"
                    />
                  </label>
                  <button
                    mat-icon-button
                    type="button"
                    class="shrink-0"
                    (click)="removeLine(i)"
                    aria-label="Ta bort raden"
                  >
                    <mat-icon>delete_outline</mat-icon>
                  </button>
                </div>
                <input
                  formControlName="instruction"
                  autocomplete="off"
                  placeholder="Instruktion till mekanikern (valfritt), t.ex. originaldelar"
                  class="focus:ring-brand h-9 w-full rounded-lg border-0 bg-white px-3 text-sm shadow-sm ring-1 ring-gray-200 outline-none focus:ring-2"
                />
                <div class="flex flex-wrap items-center gap-2 text-sm">
                  <mat-checkbox [checked]="row.value.done" (change)="flip(row, 'done')">
                    Klar
                  </mat-checkbox>
                  <mat-checkbox [checked]="row.value.toOrder" (change)="flip(row, 'toOrder')">
                    Del saknas, ska beställas
                  </mat-checkbox>
                  @if (row.value.articleId) {
                    <span class="text-xs text-gray-500">
                      {{
                        row.value.stockBooked
                          ? 'Uttagen ur lagret'
                          : 'Lagerartikel, tas ur lagret när ordern är klar'
                      }}
                    </span>
                  }
                </div>
              </div>
            } @empty {
              <p class="text-sm text-gray-500">
                Inga rader än. Lägg till vad som ska göras med knappen ovan.
              </p>
            }
          </div>
        </section>

        <section class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-6">
          <h2 class="mb-1 text-base font-semibold sm:col-span-6">Pris</h2>
          <p class="mb-3 text-sm text-gray-600 sm:col-span-6">
            Överenskommet med kunden. Står inte på arbetsbladet.
          </p>
          <mat-form-field class="sm:col-span-2">
            <mat-label>Pris för jobbet (kr, exkl. moms)</mat-label>
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

        @if (card(); as c) {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-2 text-base font-semibold">
              {{ customerType() === 'company' ? 'Faktura' : 'Kvitto' }}
            </h2>
            <div class="grid gap-x-4 sm:grid-cols-6">
              <mat-form-field class="sm:col-span-6">
                <mat-label>Utfört (står på kvittot)</mat-label>
                <textarea matInput rows="3" formControlName="performed"></textarea>
                <mat-hint
                  >t.ex. Bytt dragkrok. Fylls i från åtgärderna när ordern är klar.</mat-hint
                >
              </mat-form-field>
              <mat-form-field class="sm:col-span-6">
                <mat-label>Garanti</mat-label>
                <input
                  matInput
                  formControlName="warranty"
                  placeholder="t.ex. 12 månaders garanti på dragkrok"
                />
              </mat-form-field>
            </div>
            @if (c.invoice; as inv) {
              <div class="flex flex-wrap items-center gap-3">
                <span>
                  <b>{{ inv.code }}</b> ·
                  {{ inv.kind === 'invoice' ? 'faktura' : 'kvitto' }} utfärdat
                  {{ inv.issuedAt | date: 'yyyy-MM-dd' }}
                  @if (inv.dueAt) {
                    · förfaller {{ inv.dueAt | date: 'yyyy-MM-dd' }}
                  }
                  · <b>{{ inv.totals.total | kr }}</b> inkl. moms
                </span>
                <a mat-stroked-button [routerLink]="['/workorders', c.id, 'invoice']">
                  <mat-icon>receipt_long</mat-icon> Visa / skriv ut
                </a>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-3">
                @if (inv.paidAt) {
                  <app-pill tone="green"
                    >Betald {{ inv.paidAt | date: 'yyyy-MM-dd' }}
                    @if (inv.paymentMethod) {
                      · {{ payLabels[inv.paymentMethod] }}
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
                      @for (m of payMethods; track m[0]) {
                        <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <button mat-flat-button color="primary" type="button" (click)="setPaid(true)">
                    Markera betald
                  </button>
                }
              </div>
              @if (inv.kind === 'receipt' && payMethod() !== 'invoice') {
                <p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <b>Kassaregister:</b> kontant-, kort- och Swish-försäljning till privatpersoner
                  kräver ett certifierat kassaregister, om försäljningen över ett år överstiger fyra
                  prisbasbelopp inkl. moms (236 800 kr för 2026). Det här systemet är inget
                  kassaregister. Kontrollera med Skatteverket eller er revisor hur ni ska göra.
                </p>
              }
            } @else if (c.status === 'done') {
              <p class="mb-3 text-sm text-gray-600">
                @if (customerType() === 'company') {
                  Företag får faktura med organisationsnummer, momsbelopp och förfallodatum.
                } @else {
                  Privatkund får kvitto med priset inklusive moms.
                }
                När den är utfärdad får fakturanummer och går inte att ändra.
              </p>
              @if (form.dirty) {
                <p class="mb-3 text-sm text-amber-800">Spara ändringarna först.</p>
              }
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="form.dirty || busy() || !admin"
                (click)="issue()"
              >
                <mat-icon>receipt_long</mat-icon>
                {{ customerType() === 'company' ? 'Fakturera' : 'Skapa kvitto' }}
              </button>
            } @else {
              <p class="text-sm text-gray-600">
                Sätt ordern till <b>Klar</b> och spara för att kunna
                {{ customerType() === 'company' ? 'fakturera' : 'skapa kvitto' }}.
              </p>
            }
          </section>
        }
      </form>
    </app-card-page>
  `,
})
export class WorkOrderCard implements OnInit {
  private readonly auth = inject(Auth);
  /** Bara ägare får ta bort. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(WorkOrderApi);
  private readonly links = inject(LinkResolver);
  private readonly workshop = inject(WorkshopApi);
  private readonly inventory = inject(InventoryApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly statuses = Object.entries(WORK_ORDER_STATUS_LABELS);
  readonly payLabels = PAYMENT_METHOD_LABELS;
  readonly payMethods = Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][];
  readonly payMethod = signal<PaymentMethod>('card');
  /** Privat → kvitto med pris inkl. moms; företag → faktura. */
  readonly customerType = signal<CustomerType>('private');
  readonly busy = signal(false);
  readonly card = signal<WorkOrderDetail | null>(null);
  readonly resources = signal<Resource[]>([]);
  readonly mechanics = computed(() => this.resources().filter((r) => r.kind === 'mechanic'));
  readonly places = computed(() => this.resources().filter((r) => r.kind !== 'mechanic'));
  private readonly partResults = signal<Article[]>([]);
  private readonly partSearch = new Subject<string>();
  /** Räknas om när något i formuläret ändras, så att summan följer med. */
  private readonly version = signal(0);

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

  constructor() {
    this.form.valueChanges.subscribe(() => this.version.update((n) => n + 1));
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
    if (this.id) this.load();
  }

  private newLine(init?: {
    id?: string | null;
    articleId?: string | null;
    type: WorkOrderLineType;
    description: string;
    quantity: number;
    instruction?: string | null;
    done: boolean;
    toOrder?: boolean;
    stockBooked?: boolean;
  }) {
    return this.fb.nonNullable.group({
      id: [init?.id ?? (null as string | null)],
      articleId: [init?.articleId ?? (null as string | null)],
      toOrder: [init?.toOrder ?? false],
      stockBooked: [init?.stockBooked ?? false],
      type: [init?.type ?? ('labour' as WorkOrderLineType)],
      description: [init?.description ?? '', Validators.required],
      quantity: [init?.quantity ?? 1, [Validators.required, Validators.min(0.01)]],
      instruction: [init?.instruction ?? ''],
      done: [init?.done ?? false],
    });
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
    if (a) row.patchValue({ description: a.label, articleId: a.id });
    this.form.markAsDirty();
  }

  addLine() {
    this.lines.push(this.newLine({ type: 'other', description: '', quantity: 1, done: false }));
    this.form.markAsDirty();
    this.settle();
  }

  /**
   * Material-fälten på en ny rad får sin utformning först i en andra rendering; utan den
   * syns raden oformaterad tills man klickar i något (appen kör utan zone.js).
   */
  private settle() {
    this.cdr.detectChanges();
    setTimeout(() => this.cdr.detectChanges());
  }

  removeLine(i: number) {
    this.lines.removeAt(i);
    this.form.markAsDirty();
    this.settle();
  }

  /** Slår på/av en av radens markeringar (klar, saknas). */
  flip(row: FormGroup, key: 'done' | 'toOrder') {
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
        row.patchValue({ description: a.label, articleId: a.id });
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

  /** "= 1 250 kr inkl. moms" under ett nettopris. */
  inclHint(netKr: number | null | undefined): string {
    if (netKr == null || Number.isNaN(netKr)) return '';
    const ore = Math.round(netKr * 100);
    return `= ${(withVat(ore) / 100).toLocaleString('sv-SE')} kr inkl. moms`;
  }

  private load() {
    this.api.get(this.id!).subscribe((o) => {
      this.card.set(o);
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
            instruction: l.instruction,
            done: l.done,
          }),
        );
      }
      this.form.reset({
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
      } as never);
      // En fakturerad order är låst.
      if (o.invoice) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
      this.payMethod.set(o.invoice?.paymentMethod ?? 'card');
      this.workshop.customer(o.customerId).subscribe((c) => this.customerType.set(c.type));
      this.version.update((n) => n + 1);
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
      lines: this.lines.controls.map((row) => {
        const l = row.getRawValue() as {
          id: string | null;
          articleId: string | null;
          toOrder: boolean;
          type: WorkOrderLineType;
          description: string;
          quantity: number;
          instruction: string | null;
          done: boolean;
        };
        return {
          id: l.id ?? undefined,
          articleId: l.articleId,
          toOrder: l.toOrder,
          // Typen följer artikeln: kopplad till lagret = del, annars fri rad.
          type: (l.articleId ? 'part' : l.type === 'part' ? 'other' : l.type) as WorkOrderLineType,
          description: l.description,
          quantity: l.quantity,
          instruction: l.instruction || null,
          done: l.done,
        };
      }),
    };
    // En klar order utan "utfört" får texten från åtgärderna, redigerbar innan kvittot.
    if (body.status === 'done' && !body.performed) {
      body.performed = body.lines
        .filter((l) => l.description)
        .map((l) => l.description)
        .join(', ');
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

  /** Fakturerar (företag) eller kvitterar (privat) och låser ordern. */
  issue() {
    const o = this.card()!;
    const company = this.customerType() === 'company';
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: company ? `Fakturera ${o.code}?` : `Skapa kvitto för ${o.code}?`,
          message:
            'Ordern får ett löpnummer och låses: rader, pris och kund kan inte ändras efteråt. ' +
            'Verkstadens och kundens uppgifter kopieras in på dokumentet.',
          confirmText: company ? 'Fakturera' : 'Skapa kvitto',
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.issueInvoice(o.id).subscribe({
          next: () => {
            this.busy.set(false);
            this.snack.open('Utfärdat', undefined, { duration: 2000 });
            this.load();
          },
          error: () => this.busy.set(false),
        });
      });
  }

  setPaid(paid: boolean) {
    const run = () =>
      this.api
        .setPaid(this.id!, paid, paid ? this.payMethod() : undefined)
        .subscribe(() => this.load());
    if (paid) {
      run();
      return;
    }
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Markera som obetald?',
          message: 'Betalningen och betalsättet tas bort från fakturan.',
          confirmText: 'Markera obetald',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe((ok) => ok && run());
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
