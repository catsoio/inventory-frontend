import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { format } from 'date-fns';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { PaymentMethod, WorkOrderDetail, paymentLabel, paymentOptions } from '../../core/models';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { STATUS_TEXT, STATUS_TONE, dueNote, invoiceStatus } from '../../shared/invoice-status';

/**
 * Fakturakortet (eller kvittot) för ett äldre dokument på en arbetsorder: status, parter, belopp
 * och betalning på ett ställe, med genvägar till utskriften och arbetsordern bakom. Dokumentet är
 * bokfört och låst; det enda som ändras här är betalningen. Id:t är arbetsordern som bär
 * dokumentet. Nyare dokument ligger på säljkortet.
 */
@Component({
  selector: 'app-invoice-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/finance/invoices"
      listLabel="Fakturor"
      newTitle="Faktura"
      [title]="order() ? order()!.customerName : ''"
      [code]="order()?.invoice?.code ?? null"
    >
      @if (order(); as o) {
        @if (o.invoice; as inv) {
          <div class="flex flex-col gap-4">
            <section class="rounded-xl bg-white p-5 shadow-sm">
              <div class="mb-3 flex flex-wrap items-center gap-3">
                <h2 class="flex-1 text-base font-semibold">
                  {{ inv.kind === 'invoice' ? 'Faktura' : 'Kvitto' }} {{ inv.code }}
                </h2>
                <app-pill [tone]="statusTone(inv)">{{ statusText(inv) }}</app-pill>
              </div>
              <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
                <dt class="text-gray-500">Kund</dt>
                <dd>
                  <a class="text-brand" [routerLink]="['/customers', o.customerId]">{{
                    inv.buyer.name
                  }}</a>
                  @if (inv.buyer.customerCode) {
                    <span class="text-gray-500"> · {{ inv.buyer.customerCode }}</span>
                  }
                </dd>
                <dt class="text-gray-500">Datum</dt>
                <dd>{{ inv.issuedAt | date: 'yyyy-MM-dd' }}</dd>
                <dt class="text-gray-500">Bil</dt>
                <dd>
                  <a class="text-brand" [routerLink]="['/vehicles', o.vehicleId]">{{ o.regNo }}</a>
                  {{ o.vehicle }}
                </dd>
                @if (inv.kind === 'invoice') {
                  <dt class="text-gray-500">Förfaller</dt>
                  <dd>
                    {{ inv.dueAt ? (inv.dueAt | date: 'yyyy-MM-dd') : '–' }}
                    @if (note(inv); as n) {
                      <span [class]="status(inv) === 'overdue' ? 'font-medium text-red-700' : 'text-gray-500'">
                        · {{ n }}</span
                      >
                    }
                  </dd>
                }
                <dt class="text-gray-500">Arbetsorder</dt>
                <dd>
                  <a class="text-brand" [routerLink]="['/workorders', o.id]">{{ o.code }}</a>
                </dd>
                <dt class="text-gray-500">Utfört</dt>
                <dd class="whitespace-pre-line">{{ inv.performed || '–' }}</dd>
              </dl>
              <div class="mt-4 ml-auto max-w-xs text-sm">
                <div class="flex justify-between py-0.5">
                  <span>Summa exkl. moms</span><span>{{ inv.totals.net | kr }}</span>
                </div>
                @for (b of inv.totals.byRate; track b.rate) {
                  <div class="flex justify-between py-0.5 text-gray-600">
                    <span>Moms {{ b.rate }} %</span><span>{{ b.vat | kr }}</span>
                  </div>
                }
                <div class="mt-1 flex justify-between gap-6 border-t pt-1 text-base font-semibold">
                  <span>Att betala</span><span>{{ inv.totals.total | kr }}</span>
                </div>
              </div>
              <div class="mt-4 flex flex-wrap gap-2">
                <a mat-flat-button color="primary" [routerLink]="['/workorders', o.id, 'invoice']">
                  <mat-icon>print</mat-icon> Visa / skriv ut
                </a>
                <a mat-stroked-button [routerLink]="['/workorders', o.id]">
                  <mat-icon>handyman</mat-icon> Öppna arbetsorder
                </a>
              </div>
            </section>

            <section class="rounded-xl bg-white p-5 shadow-sm">
              <h2 class="mb-2 text-base font-semibold">Betalning</h2>
              <div class="flex flex-wrap items-center gap-3">
                @if (inv.paidAt) {
                  <span>
                    Betald {{ inv.paidAt | date: 'yyyy-MM-dd' }}
                    @if (inv.paymentMethod) {
                      · {{ payText(inv.kind, inv.paymentMethod) }}
                    }
                  </span>
                  <button mat-button type="button" (click)="setPaid(false)">Ångra betalning</button>
                } @else {
                  <mat-form-field subscriptSizing="dynamic" class="w-48">
                    <mat-label>Betalsätt</mat-label>
                    <mat-select [value]="method()" (selectionChange)="method.set($event.value)">
                      @for (m of methods(); track m[0]) {
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
            </section>
          </div>
        } @else {
          <p class="text-gray-600">Ordern har ingen faktura. <a [routerLink]="['/workorders', o.id]">Öppna ordern</a></p>
        }
      }
    </app-card-page>
  `,
})
export class InvoiceCard implements OnInit {
  private readonly api = inject(WorkOrderApi);
  private readonly dialog = inject(MatDialog);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  readonly payText = paymentLabel;
  readonly method = signal<PaymentMethod>('card');
  readonly order = signal<WorkOrderDetail | null>(null);
  readonly methods = computed(() => paymentOptions(this.order()?.invoice?.kind ?? 'receipt'));
  readonly today = format(new Date(), 'yyyy-MM-dd');
  readonly paidOn = new FormControl(this.today, { nonNullable: true });
  readonly status = invoiceStatus;
  readonly note = dueNote;
  readonly statusText = (i: Parameters<typeof invoiceStatus>[0]) => STATUS_TEXT[invoiceStatus(i)];
  readonly statusTone = (i: Parameters<typeof invoiceStatus>[0]) => STATUS_TONE[invoiceStatus(i)];

  ngOnInit() {
    this.load();
  }

  private load() {
    this.api.get(this.id).subscribe((o) => {
      this.order.set(o);
      this.method.set(o.invoice?.paymentMethod ?? (o.invoice?.kind === 'invoice' ? 'invoice' : 'card'));
    });
  }

  setPaid(paid: boolean) {
    const run = () =>
      this.api
        .setPaid(
          this.id,
          paid,
          paid ? this.method() : undefined,
          paid ? new Date(`${this.paidOn.value}T12:00:00`).toISOString() : undefined,
        )
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
}
