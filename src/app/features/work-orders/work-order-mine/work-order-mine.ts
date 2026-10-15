import { Component, OnInit, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import {
  WORK_ORDER_LINE_LABELS,
  WORK_ORDER_STATUS_LABELS,
  WorkOrder,
  WorkOrderDetail,
  WorkOrderStatus,
} from '../../../core/models';

const TONES: Record<string, 'blue' | 'amber' | 'green' | 'gray'> = {
  open: 'blue',
  in_progress: 'amber',
  waiting_parts: 'amber',
  done: 'green',
  cancelled: 'gray',
};

/**
 * Mekanikerns lista, gjord för mobilen: stora kort med regnr, bil och vad som ska göras.
 * Raderna bockas av med ett tryck och Starta/Klar sätter status. Inga priser eller kunduppgifter.
 */
@Component({
  selector: 'app-work-order-mine',
  standalone: false,
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-xl">
      <h1 class="mb-3 text-2xl font-bold">Mina arbetsorder</h1>
      <mat-button-toggle-group
        class="mb-4 w-full"
        hideSingleSelectionIndicator
        [value]="scope()"
        (change)="scope.set($event.value); load()"
        aria-label="Visa"
      >
        <mat-button-toggle class="flex-1" value="mine">Mina</mat-button-toggle>
        <mat-button-toggle class="flex-1" value="free">Ej tilldelade</mat-button-toggle>
      </mat-button-toggle-group>

      @if (loading()) {
        <p class="py-8 text-center text-gray-500">Hämtar…</p>
      } @else {
        @for (o of items(); track o.id) {
          <section class="mb-3 rounded-xl bg-white p-4 shadow-sm">
            <button type="button" class="block w-full text-left" (click)="toggle(o)">
              <div class="flex items-center justify-between gap-2">
                <app-reg-plate [value]="o.regNo" />
                <app-pill [tone]="tones[o.status]">{{ statuses[o.status] }}</app-pill>
              </div>
              <div class="mt-2 text-lg font-semibold">{{ o.vehicle || '–' }}</div>
              <div class="text-sm text-gray-600">{{ o.code }} · hämtas {{ day(o.pickupAt) }}</div>
              @if (o.remarks) {
                <div class="mt-2 rounded-lg bg-amber-50 p-2 text-sm whitespace-pre-line">
                  {{ o.remarks }}
                </div>
              }
            </button>

            @if (open()?.id === o.id) {
              @if (open(); as d) {
                <ul class="mt-3 divide-y divide-gray-100">
                  @for (l of d.lines; track l.id) {
                    <li>
                      <label class="flex min-h-14 items-center gap-3 py-2">
                        <input
                          type="checkbox"
                          class="h-7 w-7 shrink-0 accent-blue-600"
                          [checked]="l.done"
                          [disabled]="!mine() || busy()"
                          (change)="tick(d, l.id, box.checked)"
                          #box
                        />
                        <span class="flex-1 text-base" [class.line-through]="l.done">
                          {{ l.description }}
                          <span class="text-xs text-gray-500">
                            ({{ lineLabels[l.type] }}{{ l.addedByStaff ? ', tillagd' : '' }}{{ l.toOrder ? ', beställs' : '' }})
                          </span>
                        </span>
                        <span class="text-sm text-gray-600 tabular-nums">{{ l.quantity }}</span>
                      </label>
                    </li>
                  } @empty {
                    <li class="py-3 text-gray-500">Inga rader.</li>
                  }
                </ul>

                @if (mine()) {
                  <div class="mt-3 flex gap-2">
                    <input
                      #extra
                      class="min-h-12 flex-1 rounded-lg border border-gray-300 px-3"
                      placeholder="Hittade något mer? t.ex. slitna bromsar"
                      (keydown.enter)="add(d, extra, order.checked)"
                    />
                    <button mat-stroked-button class="!min-h-12" (click)="add(d, extra, order.checked)">
                      <mat-icon>add</mat-icon> Lägg till
                    </button>
                  </div>
                  <label class="mt-2 flex items-center gap-2 text-sm text-gray-700">
                    <input #order type="checkbox" class="h-5 w-5 accent-blue-600" />
                    Raden är en del som måste beställas
                  </label>
                  <div class="mt-4 flex gap-2">
                    @if (d.status === 'open') {
                      <button
                        mat-flat-button
                        color="primary"
                        class="!min-h-14 flex-1 !text-base"
                        [disabled]="busy()"
                        (click)="setStatus(d, 'in_progress')"
                      >
                        <mat-icon>play_arrow</mat-icon> Starta
                      </button>
                    }
                    @if (d.status === 'in_progress') {
                      <button
                        mat-stroked-button
                        class="!min-h-14 flex-1 !text-base"
                        [disabled]="busy()"
                        (click)="setStatus(d, 'waiting_parts')"
                      >
                        <mat-icon>hourglass_empty</mat-icon> Väntar på del
                      </button>
                    } @else if (d.status === 'waiting_parts') {
                      <button
                        mat-stroked-button
                        class="!min-h-14 flex-1 !text-base"
                        [disabled]="busy()"
                        (click)="setStatus(d, 'in_progress')"
                      >
                        <mat-icon>play_arrow</mat-icon> Fortsätt
                      </button>
                    }
                    @if (d.status !== 'done') {
                      <button
                        mat-flat-button
                        color="primary"
                        class="!min-h-14 flex-1 !text-base"
                        [disabled]="busy()"
                        (click)="setStatus(d, 'done')"
                      >
                        <mat-icon>check</mat-icon> Klar
                      </button>
                    } @else {
                      <button
                        mat-stroked-button
                        class="!min-h-14 flex-1 !text-base"
                        [disabled]="busy()"
                        (click)="setStatus(d, 'in_progress')"
                      >
                        Öppna igen
                      </button>
                    }
                  </div>
                } @else {
                  <p class="mt-3 text-sm text-gray-500">
                    Ej tilldelad. Be admin tilldela dig ordern för att arbeta på den.
                  </p>
                }
                <a mat-button class="mt-2" [routerLink]="['/workorders', o.id, 'print']"
                  ><mat-icon>print</mat-icon> Utskrift</a
                >
              }
            }
          </section>
        } @empty {
          <p class="py-8 text-center text-gray-500">
            {{ scope() === 'mine' ? 'Inga arbetsorder just nu.' : 'Inga ej tilldelade order.' }}
          </p>
        }
      }
    </div>
  `,
})
export class WorkOrderMine implements OnInit {
  private readonly api = inject(WorkOrderApi);
  private readonly snack = inject(MatSnackBar);

  readonly tones = TONES;
  readonly statuses = WORK_ORDER_STATUS_LABELS;
  readonly lineLabels = WORK_ORDER_LINE_LABELS;
  readonly scope = signal<'mine' | 'free'>('mine');
  readonly items = signal<WorkOrder[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  /** Ordern som är uppfälld, med rader. */
  readonly open = signal<WorkOrderDetail | null>(null);
  /** Uppfälld order är mekanikerns egen (tilldelad), inte en ej tilldelad. */
  readonly mine = signal(true);

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.open.set(null);
    this.api.list({ unassigned: this.scope() === 'free', limit: 100 }).subscribe({
      next: (p) => {
        // Pågående först, sedan öppna, klara sist.
        const rank: Record<WorkOrderStatus, number> = {
          in_progress: 0,
          waiting_parts: 1,
          open: 2,
          done: 3,
          cancelled: 4,
        };
        this.items.set(
          p.items
            .filter((o) => o.status !== 'cancelled')
            .sort((a, b) => rank[a.status] - rank[b.status]),
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  day(iso: string | null) {
    return iso ? new Date(iso).toLocaleDateString('sv-SE') : '–';
  }

  toggle(o: WorkOrder) {
    if (this.open()?.id === o.id) {
      this.open.set(null);
      return;
    }
    this.mine.set(this.scope() === 'mine');
    this.api.get(o.id).subscribe((d) => this.open.set(d));
  }

  tick(d: WorkOrderDetail, lineId: string, done: boolean) {
    this.run(d, { lines: [{ id: lineId, done }] });
  }

  add(d: WorkOrderDetail, input: HTMLInputElement, toOrder = false) {
    const description = input.value.trim();
    if (!description) return;
    this.run(
      d,
      { add: [{ description, toOrder, type: toOrder ? 'part' : undefined }] },
      () => (input.value = ''),
    );
  }

  setStatus(d: WorkOrderDetail, status: WorkOrderStatus) {
    this.run(d, { status }, () => {
      this.items.update((list) => list.map((o) => (o.id === d.id ? { ...o, status } : o)));
    });
  }

  private run(
    d: WorkOrderDetail,
    body: Parameters<WorkOrderApi['progress']>[1],
    after?: () => void,
  ) {
    this.busy.set(true);
    this.api.progress(d.id, body).subscribe({
      next: (r) => {
        this.open.set(r);
        this.busy.set(false);
        after?.();
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('Kunde inte spara. Försök igen.', undefined, { duration: 3000 });
      },
    });
  }
}
