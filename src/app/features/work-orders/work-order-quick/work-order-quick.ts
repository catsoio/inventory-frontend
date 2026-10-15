import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import {
  Resource,
  WORK_ORDER_LINE_LABELS,
  WORK_ORDER_STATUS_LABELS,
  WorkOrderDetail,
  WorkOrderInput,
  WorkOrderLine,
  WorkOrderLineInput,
  WorkOrderLineType,
  WorkOrderStatus,
} from '../../../core/models';
import { dateInput, dateIso } from '../../storage/storage-format';

const asInput = (l: WorkOrderLine, done = l.done): WorkOrderLineInput => ({
  id: l.id,
  articleId: l.articleId,
  toOrder: l.toOrder,
  type: l.type,
  description: l.description,
  quantity: l.quantity,
  unitPrice: l.unitPrice,
  done,
});

/**
 * Snabbpanelen bredvid listan: byt status, mekaniker och hämtdatum, bocka av rader, lägg till en
 * rad och skriv en intern anteckning utan att lämna listan. Varje ändring sparas direkt.
 * Priser och kund ändras på hela ordern.
 */
@Component({
  selector: 'app-work-order-quick',
  standalone: false,
  host: { class: 'block' },
  template: `
    @if (order(); as o) {
      <article class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <header class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <app-reg-plate [value]="o.regNo" />
          <div class="min-w-0 flex-1">
            <div class="truncate font-semibold">{{ o.vehicle || '–' }}</div>
            <div class="truncate text-sm text-gray-600">
              {{ o.customerName }}{{ o.phone ? ' · ' + o.phone : '' }}
            </div>
          </div>
          <span class="text-sm text-gray-500 tabular-nums">{{ o.code }}</span>
        </header>

        <mat-button-toggle-group
          class="mt-3 w-full flex-wrap"
          hideSingleSelectionIndicator
          [value]="o.status"
          [disabled]="busy()"
          (change)="patch({ status: $event.value })"
          aria-label="Status"
        >
          @for (s of statuses; track s[0]) {
            <mat-button-toggle class="flex-1" [value]="s[0]">{{ s[1] }}</mat-button-toggle>
          }
        </mat-button-toggle-group>

        @if (o.stockMissing) {
          <p class="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
            {{ o.stockMissing }} {{ o.stockMissing === 1 ? 'del' : 'delar' }} kunde inte tas ur
            lagret. Justera lagret och öppna ordern för att spara om.
          </p>
        }

        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="block text-xs text-gray-500">
            Mekaniker / plats
            <select
              class="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900"
              [value]="o.resourceId ?? ''"
              [disabled]="busy()"
              (change)="patch({ resourceId: $any($event.target).value || null })"
            >
              <option value="">Ingen vald</option>
              @for (r of resources(); track r.id) {
                <option [value]="r.id" [selected]="r.id === o.resourceId">{{ r.name }}</option>
              }
            </select>
          </label>
          <label class="block text-xs text-gray-500">
            Hämtas
            <input
              type="date"
              class="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900"
              [value]="day(o.pickupAt)"
              [disabled]="busy()"
              (change)="
                patch({
                  pickupAt: $any($event.target).value ? iso($any($event.target).value) : null,
                })
              "
            />
          </label>
        </div>

        @if (o.remarks) {
          <div class="mt-3 rounded-lg bg-amber-50 p-2 text-sm whitespace-pre-line">
            {{ o.remarks }}
          </div>
        }

        <h3 class="mt-4 mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          Vad ska göras
        </h3>
        <ul class="divide-y divide-gray-100">
          @for (l of o.lines; track l.id) {
            <li class="flex items-center gap-3 py-1.5">
              <input
                type="checkbox"
                class="h-5 w-5 shrink-0 accent-teal-700"
                [checked]="l.done"
                [disabled]="busy()"
                (change)="toggle(o, l, $any($event.target).checked)"
                [attr.aria-label]="'Klar: ' + l.description"
              />
              <span class="min-w-0 flex-1 text-sm" [class.line-through]="l.done">
                {{ l.description }}
                <span class="text-xs text-gray-500">
                  ({{ lineLabels[l.type] }}{{ l.toOrder ? ', beställs' : ''
                  }}{{ l.stockBooked ? ', uttagen' : '' }})
                </span>
                @if (l.addedByStaff) {
                  <app-pill tone="amber">Tillagd av mekaniker – prissätt</app-pill>
                }
              </span>
              <span class="text-sm text-gray-600 tabular-nums">{{ l.quantity }}</span>
              <span class="w-24 text-right text-sm tabular-nums">{{ l.total | kr }}</span>
            </li>
          } @empty {
            <li class="py-2 text-sm text-gray-500">Inga rader än.</li>
          }
        </ul>

        <form class="mt-2 flex gap-2" (submit)="$event.preventDefault(); add(o, text, type.value)">
          <input
            #text
            class="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-sm"
            placeholder="Lägg till rad…"
          />
          <select #type class="h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm">
            @for (t of lineTypes; track t[0]) {
              <option [value]="t[0]">{{ t[1] }}</option>
            }
          </select>
          <button mat-stroked-button type="submit" [disabled]="busy()">
            <mat-icon>add</mat-icon>
          </button>
        </form>

        <label class="mt-4 block text-xs text-gray-500">
          Intern anteckning
          <textarea
            rows="2"
            class="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900"
            [value]="o.notes ?? ''"
            (blur)="saveNotes(o, $any($event.target).value)"
          ></textarea>
        </label>

        <footer class="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <div class="mr-auto text-sm">
            <span class="text-gray-500">Summa exkl. moms</span>
            <b class="ml-2 text-base tabular-nums">{{ o.total | kr }}</b>
            @if (o.priceFrom !== null) {
              <div class="text-xs text-gray-500">
                Överenskommet {{ o.priceFrom | kr
                }}{{
                  o.priceTo !== null && o.priceTo !== o.priceFrom ? ' – ' + (o.priceTo | kr) : ''
                }}
              </div>
            }
          </div>
          <a mat-stroked-button [routerLink]="['/workorders', o.id, 'print']">
            <mat-icon>print</mat-icon> Skriv ut
          </a>
          <a mat-flat-button color="primary" [routerLink]="['/workorders', o.id]">
            Öppna hela ordern
          </a>
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

  readonly statuses = Object.entries(WORK_ORDER_STATUS_LABELS);
  readonly lineLabels = WORK_ORDER_LINE_LABELS;
  readonly lineTypes = Object.entries(WORK_ORDER_LINE_LABELS) as [WorkOrderLineType, string][];
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

  ngOnInit() {
    this.workshop.resources().subscribe((r) => this.resources.set(r.filter((x) => x.active)));
  }

  day = (iso: string | null) => dateInput(iso);
  iso = (ymd: string) => dateIso(ymd);

  patch(body: Partial<WorkOrderInput>) {
    const o = this.order();
    if (!o || this.busy()) return;
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

  toggle(o: WorkOrderDetail, l: WorkOrderLine, done: boolean) {
    this.patch({ lines: o.lines.map((x) => asInput(x, x.id === l.id ? done : x.done)) });
  }

  add(o: WorkOrderDetail, box: HTMLInputElement, type: string) {
    const description = box.value.trim();
    if (!description) return;
    box.value = '';
    this.patch({
      lines: [
        ...o.lines.map((x) => asInput(x)),
        {
          type: type as WorkOrderLineType,
          description,
          quantity: 1,
          unitPrice: 0,
          done: false,
        },
      ],
    });
  }

  saveNotes(o: WorkOrderDetail, value: string) {
    if ((o.notes ?? '') === value.trim()) return;
    this.patch({ notes: value.trim() || null });
  }
}
