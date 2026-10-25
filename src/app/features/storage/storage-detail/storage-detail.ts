import { vatIn } from '../../../shared/vat';
import { Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { StorageApi } from '../../../core/api/storage-api';
import { Auth } from '../../../core/auth/auth';
import { PageTitle } from '../../../core/page-title';
import {
  ACCESSORY_LABELS,
  DEPOSIT_CONDITION_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  RIM_MATERIAL_LABELS,
  SEASON_LABELS,
  STORAGE_CONTENTS_LABELS,
  STORAGE_STATUS_LABELS,
  StorageDeposit,
} from '../../../core/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { KrPipe } from '../../../shared/kr-pipe';
import { StorageActionDialog } from '../storage-action-dialog/storage-action-dialog';
import { contentsText, dateText } from '../storage-format';

type Field = [label: string, value: string | number];

@Component({
  selector: 'app-storage-detail',
  standalone: false,
  template: `
    @if (d(); as d) {
      <div class="mb-1 text-sm text-gray-500">
        <a routerLink="/storage" class="text-brand underline">Däckhotell</a> / {{ d.code }}
      </div>
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <app-item-icon
          [kind]="d.contents === 'tyres' ? 'tyre' : d.contents === 'rims' ? 'rim' : 'wheel'"
        />
        <app-reg-plate [value]="d.vehicle.regNo" size="lg" />
        <h1 class="text-2xl font-semibold">{{ d.customer.name }}</h1>
        <app-pill [tone]="d.status === 'stored' ? (d.overdue ? 'red' : 'blue') : 'gray'">{{
          d.overdue ? 'Passerat hämtdatum' : statusLabels[d.status]
        }}</app-pill>
        <app-pill [tone]="d.paymentStatus === 'paid' ? 'green' : 'amber'">{{
          paymentLabels[d.paymentStatus]
        }}</app-pill>
      </div>

      <div
        class="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white shadow-sm p-2"
      >
        @if (d.paymentStatus === 'unpaid') {
          <button mat-flat-button (click)="act('pay')">
            <mat-icon>payments</mat-icon> Markera betald
          </button>
        }
        @if (d.status === 'stored') {
          <button mat-flat-button (click)="act('pickup')">
            <mat-icon>output</mat-icon> Lämna ut
          </button>
        } @else {
          <button mat-stroked-button (click)="reopen(d)">
            <mat-icon>undo</mat-icon> Ångra utlämning
          </button>
        }
        <button mat-stroked-button (click)="print()">
          <mat-icon>print</mat-icon> Skriv ut etikett
        </button>
        <span class="mx-1 hidden h-6 border-l sm:block"></span>
        <a mat-button routerLink="edit"><mat-icon>edit</mat-icon> Ändra</a>
        @if (d.paymentStatus === 'unpaid') {
          <a mat-stroked-button routerLink="/sales/new" [queryParams]="{ depositId: d.id }">
            <mat-icon>receipt_long</mat-icon> Lägg på säljkort
          </a>
        }
        @if (admin) {
          <button
            mat-icon-button
            class="!text-red-700"
            aria-label="Ta bort"
            matTooltip="Ta bort"
            (click)="remove(d)"
          >
            <mat-icon>delete_outline</mat-icon>
          </button>
        }
      </div>

      <div class="flex flex-col gap-4">
        @for (s of sections(d); track s.title) {
          <details open class="rounded-xl bg-white shadow-sm">
            <summary class="cursor-pointer px-5 py-4 font-semibold select-none">
              {{ s.title }}
            </summary>
            <dl class="grid grid-cols-1 gap-x-10 gap-y-1 px-5 pb-5 sm:grid-cols-2 2xl:grid-cols-3">
              @for (f of s.fields; track f[0]) {
                <div
                  class="flex items-baseline justify-between gap-4 rounded-lg px-2 py-1.5 hover:bg-gray-50"
                >
                  <dt class="text-sm text-gray-500">{{ f[0] }}</dt>
                  <dd class="text-right font-medium">{{ f[1] }}</dd>
                </div>
              }
            </dl>
          </details>
        }
      </div>
    } @else {
      <mat-progress-bar mode="indeterminate" />
    }
  `,
})
export class StorageDetail {
  private readonly api = inject(StorageApi);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly kr = new KrPipe();
  private readonly pageTitle = inject(PageTitle);

  readonly admin = inject(Auth).isAdmin();
  readonly d = signal<StorageDeposit | null>(null);
  readonly statusLabels = STORAGE_STATUS_LABELS;
  readonly paymentLabels = PAYMENT_STATUS_LABELS;
  readonly summary = contentsText;
  readonly date = dateText;

  constructor() {
    this.api.deposit(this.id).subscribe((x) => {
      this.d.set(x);
      this.pageTitle.page.set(`${x.vehicle.regNo} · ${x.customer.name}`);
    });
  }

  sections(d: StorageDeposit): { title: string; fields: Field[] }[] {
    const sections: { title: string; fields: Field[] }[] = [
      {
        title: 'Kund och fordon',
        fields: [
          ['Registreringsnummer', d.vehicle.regNo],
          ['Bil', [d.vehicle.make, d.vehicle.model].filter(Boolean).join(' ') || '–'],
          ['Kund', d.customer.name],
          ['Telefon', d.customer.phone || '–'],
          ['E-post', d.customer.email || '–'],
        ],
      },
      {
        title: 'Förvaring',
        fields: [
          ['Inlämningsnummer', d.code],
          ['Innehåll', STORAGE_CONTENTS_LABELS[d.contents]],
          ['Antal', `${d.quantity} st`],
          ['Plats i hotellet', d.location || '–'],
          ['Inlämnad', dateText(d.depositedAt)],
          ['Beräknad hämtning', dateText(d.expectedPickupAt)],
          ['Utlämnad', dateText(d.pickedUpAt)],
          ['Förvarad', `${d.daysStored} dagar`],
          ['Tillbehör', d.accessories.map((a) => ACCESSORY_LABELS[a]).join(', ') || '–'],
          [
            'Skick vid inlämning',
            [d.conditionGrade ? DEPOSIT_CONDITION_LABELS[d.conditionGrade] : '', d.condition]
              .filter(Boolean)
              .join(' · ') || '–',
          ],
        ],
      },
    ];
    const t = d.tyres;
    if (t) {
      sections.push({
        title: 'Däck',
        fields: [
          ['Märke', t.brand || '–'],
          ['Modell', t.model || '–'],
          ['Storlek', t.sizeLabel || '–'],
          ['Säsong', SEASON_LABELS[t.season] + (t.studded ? ' (dubb)' : '')],
          ['Mönsterdjup', t.treadDepthMm != null ? `${t.treadDepthMm} mm` : '–'],
        ],
      });
    }
    const r = d.rims;
    if (r) {
      sections.push({
        title: 'Fälgar',
        fields: [
          ['Fälgtyp', RIM_MATERIAL_LABELS[r.material]],
          ['Märke', r.brand || '–'],
          ['Diameter', r.diameter ? `${r.diameter}"` : '–'],
        ],
      });
    }
    sections.push(
      {
        title: 'Avgift och betalning',
        fields: [
          ['Avgift per år (inkl. moms)', this.kr.transform(d.fee)],
          ['Varav moms 25 %', this.kr.transform(vatIn(d.fee))],
          ['Att betala (inkl. moms)', this.kr.transform(d.fee)],
          ['Status', PAYMENT_STATUS_LABELS[d.paymentStatus]],
          ['Betalsätt', d.paymentMethod ? PAYMENT_METHOD_LABELS[d.paymentMethod] : '–'],
          ['Betaldatum', dateText(d.paidAt)],
          ['Nästa betalning', dateText(d.nextPaymentAt)],
        ],
      },
      { title: 'Anteckningar', fields: [['Anteckningar', d.notes || '–']] },
    );
    return sections;
  }

  act(action: 'pay' | 'pickup') {
    this.dialog
      .open<StorageActionDialog, unknown, StorageDeposit>(StorageActionDialog, {
        data: { deposit: this.d(), action },
        width: '420px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((u) => {
        if (u) {
          this.d.set(u);
          this.snack.open('Sparat', undefined, { duration: 2500 });
        }
      });
  }

  reopen(d: StorageDeposit) {
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Ångra utlämning?',
          message: `${d.vehicle.regNo} markeras som inlagrad igen.`,
          confirmText: 'Ångra utlämning',
        },
      })
      .afterClosed()
      .subscribe((ok) => ok && this.api.reopen(d.id).subscribe((x) => this.d.set(x)));
  }

  remove(d: StorageDeposit) {
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Ta bort inlämning?',
          message: `${d.code} (${d.vehicle.regNo}) tas bort helt. Använd bara för felregistreringar – för att lämna ut, välj Lämna ut.`,
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) => ok && this.api.remove(d.id).subscribe(() => this.router.navigateByUrl('/storage')),
      );
  }

  /**
   * Skriver ut etiketten i ett eget dolt dokument, så att resten av sidan inte
   * påverkar utskriften (annars blir det en extra tom sida).
   */
  print() {
    const d = this.d();
    if (!d) return;
    const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const place = (d.location || '').split(' · ');
    const spot = place.length > 1 ? place[place.length - 1] : (d.location ?? '');
    const where = place.length > 1 ? place.slice(0, -1).join(' · ') : 'Plats';
    const t = d.tyres;
    const season = t ? SEASON_LABELS[t.season].toUpperCase() + (t.studded ? ' · DUBB' : '') : '';
    const what = [
      `${d.quantity} st ${STORAGE_CONTENTS_LABELS[d.contents].toLowerCase()}`,
      t
        ? [[t.brand, t.model].filter(Boolean).join(' '), t.sizeLabel].filter(Boolean).join(' ')
        : '',
      d.rims ? [d.rims.brand, RIM_MATERIAL_LABELS[d.rims.material]].filter(Boolean).join(' ') : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const damaged = d.conditionGrade === 'damaged' || d.conditionGrade === 'worn';
    const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${esc(d.code)}</title>
<style>
  @page { size: A6 landscape; margin: 7mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; font-family: Roboto, Arial, sans-serif; color: #111; }
  .label { height: 100%; display: grid; grid-template-rows: auto auto 1fr auto auto; gap: 2.5mm; }
  .top { display: flex; justify-content: space-between; align-items: center; }
  .code { font-size: 15pt; font-weight: 700; color: #444; letter-spacing: 1px; }
  .season { font-size: 13pt; font-weight: 700; border: 2px solid #111; border-radius: 4px; padding: 1px 8px; }
  .plate { display: inline-flex; align-self: flex-start; border: 2px solid #111; border-radius: 6px; overflow: hidden; }
  .plate i { background: #003399; width: 12mm; }
  .plate b { font-size: 34pt; letter-spacing: 3px; padding: 0 12px; }
  .who { display: flex; justify-content: space-between; align-items: baseline; }
  .name { font-size: 16pt; font-weight: 700; }
  .phone { font-size: 12pt; color: #444; }
  .what { font-size: 12pt; color: #333; }
  .spot { border-top: 2px solid #111; padding-top: 2mm; display: flex; align-items: baseline; gap: 4mm; }
  .spot small { font-size: 10pt; color: #555; text-transform: uppercase; letter-spacing: 1px; }
  .spot b { font-size: 34pt; line-height: 1; }
  .foot { font-size: 10pt; color: #444; display: flex; justify-content: space-between; gap: 6mm; }
  .warn { font-weight: 700; color: #111; border: 1.5px solid #111; border-radius: 3px; padding: 0 5px; }
</style></head><body><div class="label">
  <div class="top"><div class="code">${esc(d.code)}</div>${season ? `<div class="season">${esc(season)}</div>` : ''}</div>
  <div class="plate"><i></i><b>${esc(d.vehicle.regNo)}</b></div>
  <div>
    <div class="who"><span class="name">${esc(d.customer.name)}</span><span class="phone">${esc(d.customer.phone || '')}</span></div>
    <div class="what">${esc(what)}</div>
  </div>
  <div class="spot"><small>${esc(where)}</small><b>${esc(spot || 'Ej angiven')}</b></div>
  <div class="foot">
    <span>Inlämnad ${esc(dateText(d.depositedAt))}${d.expectedPickupAt ? ` · Hämtas ca ${esc(dateText(d.expectedPickupAt))}` : ''}</span>
    ${damaged ? `<span class="warn">${esc(d.conditionGrade === 'damaged' ? 'SKADAT' : 'SLITET')}${d.condition ? ': ' + esc(d.condition) : ''}</span>` : ''}
  </div>
</div></body></html>`;

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const win = frame.contentWindow!;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onafterprint = () => frame.remove();
    // Ge dokumentet en tick att lägga ut sig innan utskriften startar.
    setTimeout(() => {
      win.focus();
      win.print();
      setTimeout(() => frame.remove(), 60_000);
    }, 100);
  }
}
