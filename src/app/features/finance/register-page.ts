import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RegisterApi } from '../../core/api/register-api';
import { appLocale } from '../../core/i18n/locale';
import { RegisterChain, RegisterEntry, RegisterReport, RegisterStatus } from '../../core/models';
import { Confirm } from '../../shared/confirm';

const isoDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const KIND: Record<RegisterEntry['kind'], string> = {
  start: 'Start',
  sale: 'Kvitto',
  return: 'Retur',
  copy: 'Kopia',
  x_report: 'X-rapport',
  z_report: 'Z-rapport',
};
const MEANS: Record<string, string> = { card: 'Kort', swish: 'Swish', cash: 'Kontant' };

/**
 * Kassan: dagens X-rapport, Z-rapporten som stänger dagen, journalen (allt som registrerats, i
 * ordning) och exporten som Skatteverket kan be om. Bara ägaren; att stänga dagen går inte att ångra.
 */
@Component({
  selector: 'app-register-page',
  standalone: false,
  host: { class: 'flex h-full flex-col' },
  template: `
    <app-finance-tabs />
    @if (status(); as s) {
      @if (!s.configured) {
        <div class="rounded-xl bg-white p-6 shadow-sm">
          <h2 class="text-base font-semibold">Kassaregistret är inte skapat</h2>
          <p class="mt-1 text-sm text-gray-600">
            Skapa det under Inställningar → Kassaregister. Då går kvitton genom registret och rapporterna visas här.
          </p>
        </div>
      } @else {
        @if (s.unit && !s.unit.control.certified) {
          <p class="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">
            <b>Utvecklingsläge.</b> Kontrollsystemet är inte certifierat: rapporter och kvitton här är inte giltiga.
          </p>
        }
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <button mat-flat-button color="primary" type="button" [disabled]="busy() || s.unit?.status !== 'active'" (click)="x()">
            <mat-icon>summarize</mat-icon> X-rapport
          </button>
          <button mat-stroked-button type="button" [disabled]="busy() || s.unit?.status !== 'active'" (click)="z()">
            <mat-icon>lock_clock</mat-icon> Z-rapport (stäng dagen)
          </button>
          <span class="text-sm text-gray-500">{{ s.unit?.label }} · version {{ s.version }}</span>
        </div>

        @if (report(); as r) {
          <section class="mb-4 rounded-xl bg-white p-5 shadow-sm">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-base font-semibold">
                {{ r.kind === 'Z' ? 'Z-rapport ' + r.number : 'X-rapport' }} · {{ time(r.to) }}
              </h2>
              <button mat-icon-button type="button" aria-label="Stäng" (click)="report.set(null)"><mat-icon>close</mat-icon></button>
            </div>
            <dl class="grid max-w-3xl grid-cols-[14rem_1fr] gap-x-4 gap-y-1 text-sm">
              <dt class="text-gray-500">Försäljning (inkl. moms)</dt><dd class="tabular-nums">{{ r.totalSales | kr }}</dd>
              <dt class="text-gray-500">Antal kvitton</dt><dd>{{ r.receipts }}</dd>
              <dt class="text-gray-500">Sålda varor / tjänster</dt><dd>{{ r.goodsSold }} / {{ r.servicesSold }}</dd>
              <dt class="text-gray-500">Rabatter</dt><dd class="tabular-nums">{{ r.discounts | kr }}</dd>
              <dt class="text-gray-500">Returer</dt><dd>{{ r.returns }} st · {{ r.returnsAmount | kr }}</dd>
              <dt class="text-gray-500">Kvittokopior</dt><dd>{{ r.copies }} st</dd>
              @for (v of r.vat; track v.rate) {
                <dt class="text-gray-500">Moms {{ v.rate }} %</dt><dd class="tabular-nums">{{ v.vat | kr }}</dd>
              }
              @for (p of r.payments; track p.means) {
                <dt class="text-gray-500">{{ means(p.means) }}</dt><dd class="tabular-nums">{{ p.amount | kr }}</dd>
              }
              <dt class="text-gray-500">Grand total försäljning</dt><dd class="tabular-nums">{{ r.grandTotalSales | kr }}</dd>
              <dt class="text-gray-500">Grand total retur</dt><dd class="tabular-nums">{{ r.grandTotalReturns | kr }}</dd>
              <dt class="text-gray-500">Grand total netto</dt><dd class="tabular-nums">{{ r.grandTotalNet | kr }}</dd>
            </dl>
          </section>
        }

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="mb-3 flex flex-wrap items-end gap-3">
            <h2 class="mr-auto text-base font-semibold">Journal</h2>
            <mat-form-field subscriptSizing="dynamic" class="w-40">
              <mat-label>Från</mat-label>
              <input matInput type="date" [formControl]="from" (change)="loadJournal()" />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic" class="w-40">
              <mat-label>Till</mat-label>
              <input matInput type="date" [formControl]="to" (change)="loadJournal()" />
            </mat-form-field>
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="export()">
              <mat-icon>download</mat-icon> Exportera XML
            </button>
            <button mat-button type="button" [disabled]="busy()" (click)="verify()">Kontrollera journalen</button>
          </div>
          @if (chain(); as ch) {
            @if (ch.ok) {
              <p class="mb-2 text-sm text-teal-800">Journalen är hel ({{ ch.entries }} rader): inget är ändrat eller borttaget.</p>
            } @else {
              <p class="mb-2 text-sm font-medium text-red-700">Journalen stämmer inte vid rad {{ ch.brokenAtSeq }}: {{ ch.reason }}</p>
            }
          }
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b text-xs text-gray-500 uppercase">
                <tr><th class="sticky left-0 bg-white py-2 pr-3">Nr</th><th class="pr-3">Typ</th><th class="pr-3">Tid</th><th class="pr-3 text-right">Belopp</th><th class="pr-3">Betalning</th><th></th></tr>
              </thead>
              <tbody>
                @for (e of entries(); track e.seq) {
                  <tr class="border-b border-gray-100">
                    <td class="sticky left-0 bg-white py-2 pr-3 tabular-nums">{{ e.code ?? e.seq }}</td>
                    <td class="pr-3">{{ kind(e) }}@if (e.returnOf) { <span class="text-gray-500"> av {{ e.returnOf }}</span> }</td>
                    <td class="pr-3 whitespace-nowrap">{{ time(e.occurredAt) }}</td>
                    <td class="pr-3 text-right tabular-nums">
                      @if (e.receipt) { {{ (e.kind === 'return' ? -e.receipt.total : e.receipt.total) | kr }} }
                      @else if (e.report) { {{ e.report.totalSales | kr }} }
                    </td>
                    <td class="pr-3">@if (e.receipt) { {{ paid(e) }} }</td>
                    <td class="text-right">
                      @if (e.kind === 'sale' && e.receiptNumber) {
                        <button mat-button type="button" [disabled]="busy()" (click)="copy(e)">Kopia</button>
                      }
                      @if (e.report) {
                        <button mat-button type="button" (click)="report.set(e.report)">Visa</button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="py-6 text-center text-gray-500">Inget registrerat under perioden.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    } @else {
      <p class="p-4 text-gray-500">Läser in…</p>
    }
  `,
})
export class RegisterPage implements OnInit {
  private readonly api = inject(RegisterApi);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);

  readonly status = signal<RegisterStatus | null>(null);
  readonly entries = signal<RegisterEntry[]>([]);
  readonly report = signal<RegisterReport | null>(null);
  readonly chain = signal<RegisterChain | null>(null);
  readonly busy = signal(false);
  readonly from = new FormControl(isoDay(-30), { nonNullable: true });
  readonly to = new FormControl(isoDay(0), { nonNullable: true });

  ngOnInit() {
    this.api.status().subscribe((s) => {
      this.status.set(s);
      if (s.configured) this.loadJournal();
    });
  }

  loadJournal() {
    this.api.journal({ from: this.from.value, to: this.to.value }).subscribe((rows) => this.entries.set(rows));
  }

  x() {
    this.busy.set(true);
    this.api.xReport().subscribe({
      next: (e) => {
        this.busy.set(false);
        this.report.set(e.report);
        this.loadJournal();
      },
      error: () => this.busy.set(false),
    });
  }

  z() {
    this.confirm
      .ask({
        title: 'Stäng dagen med en Z-rapport?',
        message:
          'Z-rapporten summerar allt sedan förra Z-rapporten och får nästa nummer. Det går inte att göra om eller ta bort. Kvitton som utfärdas efteråt räknas i nästa Z-rapport.',
        confirmText: 'Stäng dagen',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.zReport().subscribe({
          next: (e) => {
            this.busy.set(false);
            this.report.set(e.report);
            this.loadJournal();
          },
          error: () => this.busy.set(false),
        });
      });
  }

  verify() {
    this.api.verify().subscribe((c) => this.chain.set(c));
  }

  export() {
    this.busy.set(true);
    this.api.exportXml({ from: this.from.value, to: this.to.value }).subscribe({
      next: (blob) => {
        this.busy.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `journalminne-${this.from.value}-${this.to.value}.xml`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.busy.set(false),
    });
  }

  copy(e: RegisterEntry) {
    if (!e.receiptNumber) return;
    this.busy.set(true);
    this.api.copy(e.receiptNumber).subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open(`Kopia av kvitto ${e.receiptNumber} är registrerad. Ett kvitto får bara en kopia.`, 'OK', { duration: 5000 });
        this.loadJournal();
      },
      error: () => this.busy.set(false),
    });
  }

  kind(e: RegisterEntry) {
    return KIND[e.kind];
  }
  means(m: string) {
    return MEANS[m] ?? m;
  }
  paid(e: RegisterEntry) {
    return (e.receipt?.payments ?? []).map((p) => this.means(p.means)).join(', ');
  }
  time(iso: string) {
    return new Date(iso).toLocaleString(appLocale(), { dateStyle: 'short', timeStyle: 'short' });
  }
}
