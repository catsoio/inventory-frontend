import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { WorkOrder, WorkOrderStatus } from '../../core/models';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { HomeData } from './home-data';

const sameDay = (iso: string | null, now: number) =>
  !!iso && new Date(iso).toDateString() === new Date(now).toDateString();

/**
 * Arbetsorder i fyra kolumner: dra ett kort till en annan kolumn för att byta status. Klara order
 * visas bara om de blev klara eller hämtas idag. Samma lista som Hem hämtar, så ändringen syns
 * direkt i "Att göra" också. Bara dator (arbetsorder och planering görs vid skärmen).
 */
@Component({
  selector: 'app-order-board',
  standalone: false,
  host: { class: 'block' },
  styles: `
    .order-card {
      cursor: grab;
    }
    .cdk-drag-preview {
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
      border-radius: 8px;
      cursor: grabbing;
    }
    .cdk-drag-placeholder {
      opacity: 0.35;
    }
    .cdk-drag-animating {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }
    .cdk-drop-list-dragging .order-card:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }
  `,
  template: `
    <div cdkDropListGroup class="grid grid-cols-2 gap-3 xl:grid-cols-4">
      @for (col of columns(); track col.status) {
        <div class="min-w-0 rounded-xl bg-gray-50 p-2.5">
          <div class="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
            <span class="text-gray-600 uppercase">{{ col.label }}</span>
            <app-pill [tone]="col.tone">{{ col.items.length }}</app-pill>
          </div>
          <div
            cdkDropList
            [cdkDropListData]="col.status"
            (cdkDropListDropped)="drop($event, col.status)"
            class="flex h-48 flex-col gap-1.5 overflow-y-auto rounded-lg"
          >
            @for (o of col.items; track o.id) {
              <div
                cdkDrag
                [cdkDragData]="o"
                [cdkDragStartDelay]="{ touch: 250, mouse: 0 }"
                (cdkDragStarted)="dragging = true"
                (click)="open(o)"
                (keydown.enter)="open(o)"
                tabindex="0"
                role="link"
                class="order-card block rounded-lg bg-white p-2 text-sm shadow-sm ring-1 ring-black/5"
              >
                <span class="flex items-center justify-between gap-2">
                  <app-reg-plate [value]="o.regNo" size="sm" />
                  <span class="text-xs text-gray-500">{{ o.code }}</span>
                </span>
                <span class="mt-1 block truncate">{{ o.vehicle || '–' }}</span>
                <span class="block truncate text-xs text-gray-500">
                  {{ o.customerName }} · {{ o.resourceName || 'Ej tilldelad' }}
                </span>
              </div>
            } @empty {
              <p class="px-1 py-2 text-xs text-gray-400">Inga. Dra hit en order.</p>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class OrderBoard {
  private readonly data = inject(HomeData);
  private readonly api = inject(WorkOrderApi);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  /** Order som dragits till Klara: ska stanna kvar i kolumnen även om de inte hör till idag. */
  private readonly movedDone = signal<Set<string>>(new Set());
  /** Sant medan ett kort dras, så att släppet inte räknas som klick. */
  dragging = false;

  readonly columns = computed(() => {
    const list = this.data.orders().filter((o) => o.status !== 'cancelled');
    const now = this.data.now();
    const col = (
      status: WorkOrderStatus,
      label: string,
      tone: 'blue' | 'amber' | 'green' | 'gray',
      keep: (o: WorkOrder) => boolean = () => true,
    ) => ({ status, label, tone, items: list.filter((o) => o.status === status && keep(o)) });
    return [
      col('open', 'Öppna', 'blue'),
      col('in_progress', 'Pågår', 'amber'),
      col('waiting_parts', 'Väntar på del', 'gray'),
      col(
        'done',
        'Klara idag',
        'green',
        (o) => sameDay(o.pickupAt, now) || sameDay(o.receivedAt, now) || this.movedDone().has(o.id),
      ),
    ];
  });

  open(o: WorkOrder) {
    if (this.dragging) return;
    void this.router.navigate(['/workorders', o.id]);
  }

  /** Släpp i en annan kolumn: statusen ändras direkt, och tas tillbaka om servern säger nej. */
  drop(e: CdkDragDrop<WorkOrderStatus>, to: WorkOrderStatus) {
    setTimeout(() => (this.dragging = false));
    const o = e.item.data as WorkOrder;
    if (o.status === to) return;
    const apply = () => {
      const from = o.status;
      this.data.orders.update((l) => l.map((x) => (x.id === o.id ? { ...x, status: to } : x)));
      if (to === 'done') this.movedDone.update((m) => new Set(m).add(o.id));
      this.api.update(o.id, { status: to }).subscribe({
        error: (err) => {
          this.data.orders.update((l) =>
            l.map((x) => (x.id === o.id ? { ...x, status: from } : x)),
          );
          this.snack.open(err?.error?.message ?? 'Kunde inte ändra status', 'Stäng', {
            duration: 5000,
          });
        },
      });
    };
    if (to !== 'done') return apply();
    // Klar bokar lagerdelarna som en försäljning, så det frågas en gång.
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Markera ${o.code} som klar?`,
          message: 'Delarna på ordern tas ut ur lagret och bokas som en försäljning.',
          confirmText: 'Markera klar',
        },
      })
      .afterClosed()
      .subscribe((ok) => ok && apply());
  }
}
