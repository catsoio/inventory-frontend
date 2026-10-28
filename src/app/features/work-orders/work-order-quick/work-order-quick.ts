import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { QuoteApi } from '../../../core/api/quote-api';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { Auth } from '../../../core/auth/auth';
import { WorkshopApi } from '../../../core/api/workshop-api';
import {
  Resource,
  WorkOrderDetail,
  WorkOrderInput,
  WorkOrderLine,
  WorkOrderLineInput,
  WorkOrderStatus,
} from '../../../core/models';
import { Confirm } from '../../../shared/confirm';
import { dateInput, dateIso } from '../../storage/storage-format';

const asInput = (l: WorkOrderLine, done = l.done): WorkOrderLineInput => ({
  id: l.id,
  articleId: l.articleId,
  toOrder: l.toOrder,
  type: l.type,
  description: l.description,
  quantity: l.quantity,
  // Utan instruktionen skulle en sparning tömma den.
  instruction: l.instruction,
  done,
  // Raderna ersätts vid sparning: allt som saknas här försvinner från ordern.
  jobId: l.jobId,
  code: l.code,
  unitPrice: l.unitPrice,
  discountPercent: l.discountPercent,
  vatRate: l.vatRate,
  noCharge: l.noCharge,
  minutes: l.minutes,
});

/**
 * Snabbpanelen bredvid listan: byt status, mekaniker och datum, bocka av rader och lägg till en
 * rad utan att lämna listan. Varje ändring sparas direkt.
 * Pris och kund ändras på hela ordern.
 */
@Component({
  selector: 'app-work-order-quick',
  standalone: false,
  host: { class: 'block' },
  template: `
    @if (order(); as o) {
      <article class="overflow-hidden rounded-xl bg-white shadow-sm">
        <div class="flex items-center gap-1 border-b border-gray-100 px-3 py-1.5">
          @if (admin && !o.locked) {
            <button
              mat-icon-button
              type="button"
              class="!text-red-700"
              matTooltip="Ta bort"
              aria-label="Ta bort"
              [disabled]="busy() || o.locked"
              (click)="remove(o)"
            >
              <mat-icon>delete_outline</mat-icon>
            </button>
          }
          <span class="flex-1"></span>
          @if (o.quoteId || o.quote) {
            <button
              mat-icon-button
              type="button"
              matTooltip="Öppna offert"
              aria-label="Öppna offert"
              [disabled]="busy() || o.locked"
              (click)="openQuote(o)"
            >
              <mat-icon>request_quote</mat-icon>
            </button>
          }
          <a
            mat-icon-button
            [routerLink]="['/workorders', o.id, 'print']"
            matTooltip="Skriv ut arbetsblad"
            aria-label="Skriv ut arbetsblad"
          >
            <mat-icon>print</mat-icon>
          </a>
          <a mat-flat-button color="primary" class="ml-2" [routerLink]="['/workorders', o.id]">
            Öppna order
            <mat-icon iconPositionEnd>arrow_forward</mat-icon>
          </a>
        </div>

        @if (o.locked) {
          <p class="flex items-center gap-2 bg-blue-50 px-5 py-2 text-sm text-blue-900">
            <mat-icon class="shrink-0">lock</mat-icon> Fakturerad och låst
          </p>
        }
        <header class="flex items-center gap-4 p-5">
          <app-reg-plate [value]="o.regNo" />
          <div class="min-w-0 flex-1">
            <div class="truncate font-semibold">{{ o.vehicle || '–' }}</div>
            <div class="truncate text-sm text-gray-600">
              {{ o.customerName }}{{ o.phone ? ' · ' + o.phone : '' }}
            </div>
          </div>
          <span class="self-start text-sm font-medium text-gray-400 tabular-nums">{{
            o.code
          }}</span>
        </header>

        <div class="px-5 pb-5">
          <div class="sec">Status</div>
          <mat-button-toggle-group
            class="w-full"
            hideSingleSelectionIndicator
            [value]="o.status"
            [disabled]="busy() || o.locked"
            (change)="patch({ status: $event.value })"
            aria-label="Status"
          >
            @for (s of statuses; track s[0]) {
              <mat-button-toggle class="flex-1" [value]="s[0]">{{ s[1] }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
          @if (o.stockMissing) {
            <app-callout
              class="mt-3"
              [fixes]="[
                { label: 'Öppna ordern', icon: 'open_in_new', link: ['/workorders', o.id] },
              ]"
            >
              {{ o.stockMissing }} {{ o.stockMissing === 1 ? 'del' : 'delar' }} kunde inte tas ur
              lagret. Justera lagret och öppna ordern för att spara om.
            </app-callout>
          }
        </div>

        <section class="border-t border-gray-100 p-5">
          <div class="grid gap-x-3 gap-y-4 sm:grid-cols-2">
            <label class="block">
              <span class="sec !mb-1 block">Mekaniker</span>
              <select
                class="h-11 w-full px-3 text-sm text-gray-900 field"
                [disabled]="busy() || o.locked"
                (change)="patch({ resourceId: $any($event.target).value || null })"
              >
                <option value="" [selected]="!o.resourceId">Ingen vald</option>
                @for (r of resources(); track r.id) {
                  @if (r.kind === 'mechanic') {
                    <option [value]="r.id" [selected]="r.id === o.resourceId">{{ r.name }}</option>
                  }
                }
              </select>
            </label>
            <label class="block">
              <span class="sec !mb-1 block">Lyft / plats</span>
              <select
                class="h-11 w-full px-3 text-sm text-gray-900 field"
                [disabled]="busy() || o.locked"
                (change)="patch({ placeId: $any($event.target).value || null })"
              >
                <option value="" [selected]="!o.placeId">Ingen vald</option>
                @for (r of resources(); track r.id) {
                  @if (r.kind !== 'mechanic') {
                    <option [value]="r.id" [selected]="r.id === o.placeId">{{ r.name }}</option>
                  }
                }
              </select>
            </label>
            <label class="block sm:col-span-2">
              <span class="sec !mb-1 block">Klar senast</span>
              <input
                type="date"
                class="h-11 w-full px-3 text-sm text-gray-900 field"
                [value]="day(o.pickupAt)"
                [disabled]="busy() || o.locked"
                (change)="
                  patch({
                    pickupAt: $any($event.target).value ? iso($any($event.target).value) : null,
                  })
                "
              />
            </label>
          </div>
        </section>

        <section class="border-t border-gray-100 p-5">
          <div class="sec">Kundanmärkning</div>
          <textarea
            rows="2"
            class="w-full resize-y px-3 py-2 text-sm field"
            placeholder="Vad kunden berättat, t.ex. ljud från framhjulet"
            [value]="o.remarks ?? ''"
            [disabled]="busy() || o.locked"
            (blur)="saveRemarks(o, $any($event.target).value)"
          ></textarea>
        </section>

        <section class="border-t border-gray-100 p-5">
          <div class="sec">Vad ska göras</div>
          <div class="space-y-3">
            @for (g of groups(o); track g.id; let n = $index) {
              <div
                class="overflow-hidden rounded-lg border border-l-4 transition-colors"
                [class.border-gray-200]="!g.work?.done"
                [class.border-l-teal-700]="!g.work?.done"
                [class.bg-white]="!g.work?.done"
                [class.border-green-300]="g.work?.done"
                [class.border-l-green-600]="g.work?.done"
                [class.bg-green-50]="g.work?.done"
              >
                @if (g.title) {
                  <div class="flex items-center gap-3 px-3 py-2.5">
                    @if (g.work; as w) {
                      <input
                        type="checkbox"
                        class="h-5 w-5 shrink-0 accent-teal-700"
                        [checked]="w.done"
                        [disabled]="busy() || o.locked"
                        (change)="toggle(o, w, $any($event.target).checked)"
                        [attr.aria-label]="'Klar: ' + g.title"
                      />
                    }
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-semibold tracking-wide text-teal-800 uppercase">
                        Jobb {{ n + 1 }}
                      </div>
                      <div
                        class="truncate text-sm font-semibold"
                        [class.line-through]="g.work?.done"
                      >
                        {{ g.title }}
                      </div>
                    </div>
                    @if (g.total !== null) {
                      <span class="text-sm font-semibold tabular-nums">{{ g.total | kr }}</span>
                    }
                  </div>
                }
                @if (g.lines.length) {
                  <div class="px-3 pb-3" [class.pt-3]="!g.title">
                    @if (g.title) {
                      <div class="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                        Delar
                      </div>
                    }
                    <ul class="mt-1 ml-1 border-l-2 border-teal-700/30 pl-3">
                      @for (l of g.lines; track l.id) {
                        <li class="flex items-start gap-3 py-1.5">
                          <input
                            type="checkbox"
                            class="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
                            [checked]="l.done"
                            [disabled]="busy() || o.locked"
                            (change)="toggle(o, l, $any($event.target).checked)"
                            [attr.aria-label]="'Klar: ' + l.description"
                          />
                          <span class="min-w-0 flex-1 text-sm" [class.text-gray-400]="l.done">
                            <span [class.line-through]="l.done">{{ l.description }}</span>
                            @if (l.toOrder) {
                              <app-pill tone="amber">Del saknas</app-pill>
                            }
                            @if (l.instruction) {
                              <span class="block text-xs text-gray-500">{{ l.instruction }}</span>
                            }
                          </span>
                          @if (l.quantity !== 1) {
                            <span class="text-sm text-gray-500 tabular-nums"
                              >{{ l.quantity }} st</span
                            >
                          }
                        </li>
                      }
                    </ul>
                  </div>
                }
              </div>
            } @empty {
              <p class="text-sm text-gray-500">Inga rader än.</p>
            }
          </div>

          <form class="mt-3 flex gap-2" (submit)="$event.preventDefault(); add(o, text)">
            <input
              #text
              class="h-11 min-w-0 flex-1 px-3 text-sm field"
              placeholder="Nytt jobb, t.ex. Byta olja"
            />
            <button mat-stroked-button type="submit" class="!h-11" [disabled]="busy() || o.locked">
              <mat-icon>add</mat-icon> Lägg till jobb
            </button>
          </form>
        </section>

        <footer
          class="flex flex-wrap items-center gap-x-3 gap-y-3 border-t border-gray-100 bg-gray-50 p-5"
        >
          <div class="mr-auto">
            @if (o.total > 0) {
              <div class="text-xs text-gray-500">Att betala</div>
              <div class="text-lg font-semibold tabular-nums">{{ o.total | kr }}</div>
              @if (o.priceNote) {
                <div class="text-xs text-gray-500">{{ o.priceNote }}</div>
              }
            } @else {
              <span class="text-sm text-gray-500">Inget pris satt</span>
            }
          </div>
        </footer>
      </article>
    } @else {
      <p class="p-6 text-center text-sm text-gray-500">Hämtar…</p>
    }
  `,
})
export class WorkOrderQuick implements OnInit {
  private readonly api = inject(WorkOrderApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly snack = inject(MatSnackBar);
  private readonly quotes = inject(QuoteApi);
  private readonly router = inject(Router);
  private readonly confirm = inject(Confirm);
  private readonly auth = inject(Auth);

  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();

  readonly statuses: [WorkOrderStatus, string][] = [
    ['open', 'Öppen'],
    ['in_progress', 'Pågår'],
    ['waiting_parts', 'Pausad'],
    ['done', 'Klar'],
  ];
  readonly order = signal<WorkOrderDetail | null>(null);
  readonly resources = signal<Resource[]>([]);
  readonly busy = signal(false);

  /** Ordern som visas; byts den hämtas den nya. */
  @Input({ required: true }) set orderId(id: string) {
    this.order.set(null);
    this.api.get(id).subscribe((o) => this.order.set(o));
  }
  /** Något sparades: listan bör läsas om. */
  @Output() changed = new EventEmitter<void>();
  /** Ordern togs bort: listan ska läsas om och panelen stängas. */
  @Output() removed = new EventEmitter<void>();

  ngOnInit() {
    this.workshop.resources().subscribe((r) => this.resources.set(r.filter((x) => x.active)));
  }

  /** Raderna under sitt jobb (kundanmärkning) med delsumma; rader utan jobb samlas sist. Systemraden döljs. */
  groups(o: WorkOrderDetail) {
    const rows = o.lines.filter((l) => !l.system);
    const out: {
      id: string;
      title: string;
      total: number | null;
      work: WorkOrderLine | null;
      lines: WorkOrderLine[];
    }[] = [];
    for (const j of o.jobs ?? []) {
      const all = rows.filter((l) => l.jobId === j.id);
      // Jobbets egen rad (arbetet) blir jobbets kryssruta; resten är delarna.
      const work = all.find((l) => l.type === 'labour') ?? null;
      const lines = all.filter((l) => l !== work);
      if (all.length)
        out.push({ id: j.id, title: j.title, total: o.jobTotals?.[j.id] ?? null, work, lines });
    }
    const known = new Set((o.jobs ?? []).map((j) => j.id));
    const rest = rows.filter((l) => !l.jobId || !known.has(l.jobId));
    if (rest.length) out.push({ id: 'rest', title: '', total: null, work: null, lines: rest });
    return out;
  }

  day = (iso: string | null) => dateInput(iso);
  iso = (ymd: string) => dateIso(ymd);

  patch(body: Partial<WorkOrderInput>) {
    const o = this.order();
    if (!o || this.busy()) return;
    if (o.locked) {
      this.snack.open('Ordern är fakturerad och låst.', undefined, { duration: 2500 });
      return;
    }
    this.busy.set(true);
    this.api.update(o.id, body).subscribe({
      next: (r) => {
        this.order.set(r);
        this.busy.set(false);
        this.snack.open('Sparat', undefined, { duration: 1500 });
        this.changed.emit();
      },
      // Felet visas av felhanteraren; läs om ordern så att panelen visar sanningen.
      error: () => {
        this.busy.set(false);
        this.api.get(o.id).subscribe((r) => this.order.set(r));
      },
    });
  }

  saveRemarks(o: WorkOrderDetail, text: string) {
    const remarks = text.trim();
    if (remarks === (o.remarks ?? '')) return;
    this.patch({ remarks: remarks || null });
  }

  private flushing = false;
  private linesDirty = false;

  /**
   * Bockar av direkt i panelen och sparar efteråt. Klickar man igen medan en sparning pågår
   * skickas senaste läget när den är klar (inget klick tappas, och svaret skriver inte över det).
   */
  toggle(o: WorkOrderDetail, l: WorkOrderLine, done: boolean) {
    if (o.locked) return;
    this.order.update((x) =>
      x ? { ...x, lines: x.lines.map((r) => (r.id === l.id ? { ...r, done } : r)) } : x,
    );
    this.linesDirty = true;
    if (!this.flushing) this.flush();
  }

  private flush() {
    const o = this.order();
    if (!o) return;
    this.flushing = true;
    this.linesDirty = false;
    this.api
      .update(o.id, { lines: o.lines.filter((x) => !x.system).map((x) => asInput(x)) })
      .subscribe({
        next: (r) => {
          this.flushing = false;
          if (this.linesDirty) return this.flush();
          this.order.set(r);
          this.changed.emit();
        },
        error: () => {
          this.flushing = false;
          this.linesDirty = false;
          this.api.get(o.id).subscribe((r) => this.order.set(r));
        },
      });
  }

  /** Nytt jobb: ett jobb med en arbetsrad, som i kortet. Priset sätts i ordern. */
  add(o: WorkOrderDetail, box: HTMLInputElement) {
    const title = box.value.trim();
    if (!title) return;
    box.value = '';
    const id = crypto.randomUUID();
    this.patch({
      jobs: [
        ...(o.jobs ?? []).map((j) => ({
          id: j.id,
          title: j.title,
          instruction: j.instruction,
          limit: j.limit,
          fixedPrice: j.fixedPrice,
        })),
        { id, title },
      ],
      lines: [
        ...o.lines.filter((x) => !x.system).map((x) => asInput(x)),
        { type: 'labour', description: title, quantity: 1, done: false, jobId: id },
      ],
    });
  }

  /** Öppnar kostnadsförslaget; en äldre order flyttar först sitt förslag till ett eget dokument. */
  openQuote(o: WorkOrderDetail) {
    if (o.quoteId) {
      this.router.navigate(['/quotes', o.quoteId]);
      return;
    }
    this.busy.set(true);
    this.quotes.fromWorkOrder(o.id).subscribe({
      next: (q) => {
        this.busy.set(false);
        this.router.navigate(['/quotes', q.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove(o: WorkOrderDetail) {
    this.confirm
      .ask({
        title: `Ta bort ${o.code}?`,
        message: 'Arbetsordern och alla dess rader tas bort. Det går inte att ångra.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.remove(o.id).subscribe({
          next: () => {
            this.busy.set(false);
            this.removed.emit();
          },
          error: () => this.busy.set(false),
        });
      });
  }
}
