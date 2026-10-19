import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { WORK_ORDER_STATUS_LABELS, VehicleDetail, WorkOrderDetail } from '../../../core/models';
import { Auth } from '../../../core/auth/auth';

/**
 * Arbetsordern som ett A4-blad att lämna till mekanikern, utan pris: allt han behöver veta överst,
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
        class="mx-auto max-w-[210mm] bg-white p-8 text-[13px] leading-snug text-[#4b5563] shadow-sm print:max-w-none print:p-0 print:shadow-none [print-color-adjust:exact]"
      >
        <header class="flex items-start justify-between border-b-2 border-[#4b5563] pb-3">
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

        <section class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div style="zoom: 2.2"><app-reg-plate [value]="o.regNo" size="lg" /></div>
          <div class="text-xl font-semibold">{{ o.vehicle }}</div>
        </section>

        <section class="mt-4 grid grid-cols-2 gap-x-8 gap-y-1">
          <div>
            @if (!auth.isMechanic()) {
              <span class="text-gray-600">Kund:</span> <b>{{ o.customerName }}</b>
            }
          </div>
          @if (!auth.isMechanic()) {
            <div><span class="text-gray-600">Telefon:</span> {{ o.phone || '–' }}</div>
          }
          <div><span class="text-gray-600">Mekaniker:</span> {{ o.resourceName || '–' }}</div>
          <div><span class="text-gray-600">Start:</span> {{ day(o.receivedAt) }}</div>
          <div><span class="text-gray-600">Klar senast:</span> {{ day(o.pickupAt) }}</div>
        </section>

        @if (vehicle()?.notes; as note) {
          <section class="mt-4 border-2 border-[#4b5563] p-3">
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
            <tr class="border-b-2 border-[#4b5563] text-left text-xs tracking-wide uppercase">
              <th class="w-8 py-1">Klar</th>
              <th class="py-1">Vad ska göras</th>
              <th class="w-20 py-1 text-right">Antal</th>
            </tr>
          </thead>
          <tbody>
            @for (l of o.lines; track l.id) {
              <tr class="border-b border-gray-300 align-top">
                <td class="py-2">
                  <span class="inline-block h-4 w-4 border-2 border-[#4b5563] text-center leading-3">{{
                    l.done ? '✓' : ''
                  }}</span>
                </td>
                <td class="py-2">
                  <b>{{ l.description }}</b>
                  @if (l.toOrder) {
                    <span class="ml-1 border border-[#4b5563] px-1 text-xs font-bold">DEL SAKNAS</span>
                  }
                  @if (l.instruction) {
                    <div class="mt-0.5 whitespace-pre-line text-[#4b5563]">{{ l.instruction }}</div>
                  }
                </td>
                <td class="py-2 text-right tabular-nums">{{ l.quantity }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="3" class="py-4 text-gray-500">Inga rader.</td>
              </tr>
            }
          </tbody>
        </table>

        <section class="mt-6">
          <div class="text-xs font-bold tracking-widest text-gray-600 uppercase">
            Mekanikerns anteckningar (t.ex. delar som saknas)
          </div>
          <div class="mt-1 h-40 border border-gray-400"></div>
        </section>

        <footer class="mt-8 grid grid-cols-2 gap-10 text-xs text-gray-600">
          <div class="border-t border-[#4b5563] pt-1">Mekaniker (signatur)</div>
          <div class="border-t border-[#4b5563] pt-1">Datum</div>
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
