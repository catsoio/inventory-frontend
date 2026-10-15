import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import {
  WORK_ORDER_LINE_LABELS,
  WORK_ORDER_STATUS_LABELS,
  VehicleDetail,
  WorkOrderDetail,
} from '../../../core/models';
import { Auth } from '../../../core/auth/auth';

/**
 * Arbetsordern som ett A4-blad att lämna till mekanikern: allt han behöver veta överst,
 * bilens bestående anmärkningar framhävda, rutor att bocka av och plats för anteckningar.
 */
@Component({
  selector: 'app-work-order-print',
  standalone: false,
  template: `
    <div class="mb-4 flex items-center gap-2 print:hidden">
      <a mat-button [routerLink]="auth.isMechanic() ? ['/workorders/mine'] : ['/workorders', id]"
        ><mat-icon>arrow_back</mat-icon> Tillbaka</a
      >
      <span class="flex-1"></span>
      <button mat-flat-button color="primary" (click)="print()">
        <mat-icon>print</mat-icon> Skriv ut
      </button>
    </div>

    @if (order(); as o) {
      <article
        class="mx-auto max-w-[210mm] bg-white p-8 text-[13px] leading-snug text-black shadow-sm print:max-w-none print:p-0 print:shadow-none"
      >
        <header class="flex items-start justify-between border-b-2 border-black pb-3">
          <div>
            <div class="text-xs tracking-widest text-gray-600 uppercase">
              {{ auth.garage()?.name }}
            </div>
            <h1 class="text-3xl font-bold">Arbetsorder</h1>
          </div>
          <div class="text-right">
            <div class="text-3xl font-bold tabular-nums">{{ o.code }}</div>
            <div class="text-gray-600">{{ statuses[o.status] }}</div>
          </div>
        </header>

        <section class="mt-4 grid grid-cols-2 gap-x-8 gap-y-1">
          <div>
            @if (!auth.isMechanic()) {
              <span class="text-gray-600">Kund:</span> <b>{{ o.customerName }}</b>
            }
          </div>
          @if (!auth.isMechanic()) {
            <div><span class="text-gray-600">Telefon:</span> {{ o.phone || '–' }}</div>
          }
          <div>
            <span class="text-gray-600">Bil:</span> <b>{{ o.regNo }}</b>
            {{ o.vehicle ? '· ' + o.vehicle : '' }}
          </div>
          <div><span class="text-gray-600">Mekaniker:</span> {{ o.resourceName || '–' }}</div>
          <div><span class="text-gray-600">Inlämnad:</span> {{ day(o.receivedAt) }}</div>
          <div><span class="text-gray-600">Hämtas:</span> {{ day(o.pickupAt) }}</div>
          @if (!auth.isMechanic()) {
            <div class="col-span-2">
              <span class="text-gray-600">Pris (exkl. moms):</span>
              @if (o.priceFrom !== null) {
                överenskommet
                <b
                  >{{ o.priceFrom | kr
                  }}{{
                    o.priceTo !== null && o.priceTo !== o.priceFrom ? ' – ' + (o.priceTo | kr) : ''
                  }}</b
                >
              }
              @if (o.quote !== null) {
                · prisförslag <b>{{ o.quote | kr }}</b>
              }
              @if (o.priceFrom === null && o.quote === null) {
                –
              }
            </div>
          }
        </section>

        @if (vehicle()?.notes; as note) {
          <section class="mt-4 border-2 border-black p-3">
            <div class="text-xs font-bold tracking-widest uppercase">Obs! Om bilen</div>
            <div class="mt-1 text-base font-semibold">{{ note }}</div>
          </section>
        }
        @if (o.remarks) {
          <section class="mt-3 border border-gray-400 p-3">
            <div class="text-xs font-bold tracking-widest text-gray-600 uppercase">
              Anmärkning för det här besöket
            </div>
            <div class="mt-1 whitespace-pre-line">{{ o.remarks }}</div>
          </section>
        }

        <table class="mt-5 w-full border-collapse">
          <thead>
            <tr class="border-b-2 border-black text-left text-xs tracking-wide uppercase">
              <th class="w-8 py-1">Klar</th>
              <th class="py-1">Vad ska göras</th>
              <th class="w-20 py-1 text-right">Antal</th>
              @if (!auth.isMechanic()) {
                <th class="w-24 py-1 text-right">À-pris exkl. moms</th>
                <th class="w-24 py-1 text-right">Summa exkl. moms</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (l of o.lines; track l.id) {
              <tr class="border-b border-gray-300 align-top">
                <td class="py-2">
                  <span class="inline-block h-4 w-4 border-2 border-black text-center leading-3">{{
                    l.done ? '✓' : ''
                  }}</span>
                </td>
                <td class="py-2">
                  {{ l.description }}
                  <span class="text-xs text-gray-500">({{ lineLabels[l.type] }})</span>
                </td>
                <td class="py-2 text-right tabular-nums">{{ l.quantity }}</td>
                @if (!auth.isMechanic()) {
                  <td class="py-2 text-right tabular-nums">{{ l.unitPrice | kr }}</td>
                  <td class="py-2 text-right tabular-nums">{{ l.total | kr }}</td>
                }
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="py-4 text-gray-500">Inga rader.</td>
              </tr>
            }
          </tbody>
          @if (!auth.isMechanic()) {
            <tfoot>
              <tr>
                <td colspan="4" class="pt-2 text-right font-bold">Summa exkl. moms</td>
                <td class="pt-2 text-right font-bold tabular-nums">{{ o.total | kr }}</td>
              </tr>
            </tfoot>
          }
        </table>

        <section class="mt-6">
          <div class="text-xs font-bold tracking-widest text-gray-600 uppercase">
            Mekanikerns anteckningar
          </div>
          <div class="mt-1 h-40 border border-gray-400"></div>
        </section>

        <footer class="mt-8 grid grid-cols-2 gap-10 text-xs text-gray-600">
          <div class="border-t border-black pt-1">Mekaniker (signatur)</div>
          <div class="border-t border-black pt-1">Datum</div>
        </footer>
      </article>
    }
  `,
})
export class WorkOrderPrint implements OnInit {
  private readonly api = inject(WorkOrderApi);
  private readonly workshop = inject(WorkshopApi);
  readonly auth = inject(Auth);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;

  readonly statuses = WORK_ORDER_STATUS_LABELS;
  readonly lineLabels = WORK_ORDER_LINE_LABELS;
  readonly order = signal<WorkOrderDetail | null>(null);
  /** Bilen, för dess bestående anmärkningar. */
  readonly vehicle = signal<VehicleDetail | null>(null);

  ngOnInit() {
    this.api.get(this.id).subscribe((o) => {
      this.order.set(o);
      this.workshop.vehicle(o.vehicleId).subscribe((v) => this.vehicle.set(v));
    });
  }

  day(iso: string | null) {
    return iso ? new Date(iso).toLocaleDateString('sv-SE') : '–';
  }

  print() {
    window.print();
  }
}
