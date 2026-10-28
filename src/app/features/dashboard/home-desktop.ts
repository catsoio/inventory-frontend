import { Component, computed, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Booking } from '../../core/models';
import { shortLabel } from '../../core/insights/hotel';
import { addDays, startOfDay } from '../../core/insights/dates';
import { openBooking } from '../../shared/booking-dialog/open-booking';
import { columns, fmtKr, kronor, tickKr } from '../../shared/chart/chart-kit';
import { ACCENT, OTHER, STATUS } from '../../shared/chart/chart-theme';
import type { PanelTable } from '../../shared/panel/panel';
import { delta } from '../../shared/stat/stat';
import { HomeData } from './home-data';

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
const dayName = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString('sv-SE', opts).replace('.', '');

/** Arbetsdagens längd per mekaniker i kapacitetslinjen i belastningsdiagrammet. */
const WORK_HOURS = 8;

/**
 * Hem på dator: hur dagen ser ut (vem gör vad, vad som väntar), arbetsorder att flytta mellan
 * kolumner och tre diagram som svarar på frågor: när kommer däckseten tillbaka, hur belastad är
 * veckan och hur går försäljningen. Allt annat finns en klick bort i menyn.
 */
@Component({
  selector: 'app-home-desktop',
  standalone: false,
  host: { class: 'block' },
  template: `
    <div
      class="grid gap-4 sm:grid-cols-2"
      [class]="data.admin ? 'xl:grid-cols-5' : 'xl:grid-cols-4'"
    >
      <app-stat
        label="Bokningar idag"
        [value]="data.bookingsLoaded() ? data.today().length : '–'"
        [hint]="data.bookingsLoaded() ? data.left() + ' kvar' : ''"
        link="/bookings"
      />
      <app-stat
        label="Däckhotell"
        [value]="data.hotel()?.stored ?? '–'"
        [hint]="hotelHint()"
        [status]="data.hotel()?.overdue ? 'bad' : 'none'"
        link="/storage/overview"
      />
      <app-stat
        label="Behöver beställas"
        [value]="data.summary()?.lowStock ?? '–'"
        [hint]="stockHint()"
        [status]="data.summary()?.outOfStock ? 'bad' : data.summary()?.lowStock ? 'warn' : 'none'"
        link="/inventory/overview"
      />
      @if (data.admin) {
        <app-stat
          [label]="'Försäljning, ' + data.days + ' dagar'"
          [value]="data.cur() ? kr(data.cur()!.soldRevenue) : '–'"
          [delta]="soldDelta()"
          [trend]="data.week()?.sold ?? []"
          hint="exkl. moms"
          link="/finance"
        />
        <app-stat
          label="Obetalt"
          [value]="data.unpaid() ? kr(data.unpaid()!.amount) : '–'"
          [hint]="data.unpaid() ? data.unpaid()!.count + ' fakturor' : ''"
          [status]="data.unpaid()?.count ? 'warn' : 'none'"
          link="/sales"
          [params]="{ show: 'unpaid' }"
        />
      } @else {
        <app-stat
          label="Säljkort att bokföra"
          [value]="data.drafts()"
          hint="utkast"
          link="/sales"
          [params]="{ show: 'draft' }"
        />
      }
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      <app-panel class="xl:col-span-2" title="Idag" [subtitle]="todayNote()" icon="today">
        <button actions mat-button type="button" (click)="newBooking()">
          <mat-icon>add</mat-icon> Ny bokning
        </button>
        <app-day-timeline
          [bookings]="data.today()"
          [resources]="data.resources()"
          [now]="data.now()"
          (openBooking)="open($event)"
        />
        @if (upcoming().length) {
          <div class="mt-4 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Kvar idag
          </div>
          <ul class="divide-y divide-gray-100">
            @for (b of upcoming(); track b.id) {
              <li class="flex items-center gap-3 py-2">
                <span class="w-12 shrink-0 text-sm font-semibold tabular-nums">{{
                  hhmm(b.start)
                }}</span>
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-3 text-left"
                  (click)="open(b)"
                >
                  @if (b.regNo) {
                    <app-reg-plate [value]="b.regNo" size="sm" />
                  }
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium">{{ b.title }}</span>
                    <span class="block truncate text-xs text-gray-500"
                      >{{ b.customerName }}{{ b.resourceName ? ' · ' + b.resourceName : '' }}</span
                    >
                  </span>
                </button>
                @if (b.status === 'arrived') {
                  <app-pill tone="amber">Här</app-pill>
                  <button
                    mat-stroked-button
                    class="!h-9"
                    type="button"
                    (click)="data.setStatus(b, 'done')"
                  >
                    Klar
                  </button>
                } @else {
                  <button
                    mat-stroked-button
                    class="!h-9"
                    type="button"
                    (click)="data.setStatus(b, 'arrived')"
                  >
                    Anlänt
                  </button>
                }
              </li>
            }
          </ul>
        }
      </app-panel>

      <app-panel title="Att göra" icon="task_alt">
        <app-attention-list [items]="data.attention()" [ready]="data.attentionReady()" />
      </app-panel>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      @if (data.workOrdersOn) {
        <app-panel
          class="xl:col-span-2"
          title="Arbetsorder"
          [subtitle]="activeOrders() + ' pågående. Dra ett kort för att byta status.'"
          icon="handyman"
        >
          <a actions mat-button routerLink="/workorders/new"
            ><mat-icon>add</mat-icon> Ny arbetsorder</a
          >
          <app-order-board />
        </app-panel>
      }
      <app-panel
        title="Hämtas per vecka"
        subtitle="Inlagrade däckset, per veckonummer. Röd stapel: har passerat hämtdatum."
        [table]="pickupTable()"
        [empty]="data.depositsLoaded() && !data.deposits().length"
        emptyText="Inga inlagrade set."
        [class.xl:col-span-3]="!data.workOrdersOn"
      >
        <div class="h-52">
          <app-chart [config]="pickupChart()" label="Däckset som ska hämtas per vecka" />
        </div>
      </app-panel>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      @if (data.admin) {
        <app-panel
          class="xl:col-span-2"
          title="Försäljning och inköp per vecka"
          subtitle="Exkl. moms, senaste 12 veckorna."
          [table]="weekTable()"
        >
          <div class="h-60">
            <app-chart [config]="weekChart()" label="Försäljning och inköp per vecka" />
          </div>
        </app-panel>
      }
      <app-panel
        title="Bokat kommande dagar"
        [subtitle]="'Timmar bokad tid per dag. Linjen är ' + WORK_HOURS + ' timmar per mekaniker.'"
        [table]="loadTable()"
        [class.xl:col-span-3]="!data.admin"
      >
        <div class="h-60">
          <app-chart [config]="loadChart()" label="Bokad tid per dag" />
        </div>
      </app-panel>
    </div>
  `,
})
export class HomeDesktop {
  readonly data = inject(HomeData);
  private readonly dialog = inject(MatDialog);
  readonly hhmm = hhmm;
  readonly kr = kronor;
  readonly WORK_HOURS = WORK_HOURS;

  constructor() {
    this.data.loadDesktop();
  }

  newBooking() {
    openBooking(this.dialog, null).subscribe((r) => r && this.data.loadBookings());
  }

  open(b: Booking) {
    openBooking(this.dialog, b).subscribe((r) => r && this.data.loadBookings());
  }

  // --- nyckeltal ---

  readonly hotelHint = computed(() => {
    const h = this.data.hotel();
    if (!h) return '';
    return h.overdue > 0 ? `${h.overdue} har passerat hämtdatum` : `${h.units} däck och fälgar`;
  });
  readonly stockHint = computed(() => {
    const s = this.data.summary();
    if (!s) return '';
    return s.outOfStock > 0 ? `${s.outOfStock} är slut` : 'under beställningspunkten';
  });
  readonly soldDelta = computed(() => {
    const c = this.data.cur();
    const p = this.data.prev();
    return c && p ? delta(c.soldRevenue, p.soldRevenue) : null;
  });
  readonly activeOrders = computed(
    () =>
      this.data.orders().filter((o) => o.status === 'open' || o.status === 'in_progress').length,
  );

  // --- idag ---

  readonly todayNote = computed(() => {
    const d = dayName(new Date(this.data.now()), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return this.data.bookingsLoaded()
      ? `${d.charAt(0).toUpperCase()}${d.slice(1)} · ${this.data.today().length} bokningar, ${this.data.left()} kvar`
      : '';
  });
  /** De närmaste som inte är avslutade, högst fem. */
  readonly upcoming = computed(() =>
    this.data
      .today()
      .filter((b) => (b.status === 'booked' || b.status === 'arrived') && !this.data.past(b))
      .slice(0, 5),
  );

  // --- hämtas per vecka ---

  readonly pickupChart = computed(() => {
    const b = this.data.forecast().buckets;
    return columns({
      labels: b.map(shortLabel),
      title: (i) => b[i].title,
      series: [
        {
          label: 'Set',
          data: b.map((x) => x.sets),
          color: ACCENT,
          colors: b.map((x) => (x.overdue ? STATUS.critical : x.key === 'later' ? OTHER : ACCENT)),
        },
      ],
      format: (v) => `${v} set`,
      footer: (i) => [`${b[i].units} däck och fälgar`],
    });
  });
  readonly pickupTable = computed<PanelTable>(() => ({
    head: ['Vecka', 'Set', 'Däck och fälgar'],
    rows: this.data.forecast().buckets.map((b) => [b.title, b.sets, b.units]),
  }));

  // --- försäljning och inköp ---

  readonly weekChart = computed(() => {
    const w = this.data.week();
    return columns({
      labels: w?.labels ?? [],
      series: [
        { label: 'Försäljning', data: (w?.sold ?? []).map((v) => v / 100), color: ACCENT },
        { label: 'Inköp', data: (w?.bought ?? []).map((v) => v / 100), color: OTHER },
      ],
      format: fmtKr,
      tick: tickKr,
      title: (i) =>
        `${w!.labels[i]} · ${dayName(w!.mondays[i], { day: 'numeric', month: 'short' })}`,
      footer: (i) => (w ? [`${w.soldUnits[i]} sålda enheter`] : []),
    });
  });
  readonly weekTable = computed<PanelTable>(() => {
    const w = this.data.week();
    return {
      head: ['Vecka', 'Försäljning', 'Inköp', 'Sålda enheter'],
      rows: w
        ? w.labels.map((l, i) => [l, kronor(w.sold[i]), kronor(w.bought[i]), w.soldUnits[i]])
        : [],
    };
  });

  // --- belastning ---

  /** Bokad tid per dag, idag och de närmaste arbetsdagarna (helg bara om något är bokat). */
  private readonly days = computed(() => {
    const start = startOfDay(new Date(this.data.now()));
    const out: { date: Date; hours: number; count: number }[] = [];
    for (let i = 0; i < 14 && out.length < 10; i++) {
      const date = addDays(start, i);
      const next = addDays(date, 1);
      const list = this.data
        .bookings()
        .filter((b) => new Date(b.start) >= date && new Date(b.start) < next);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      if (weekend && !list.length) continue;
      const hours = list.reduce(
        (t, b) => t + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 36e5,
        0,
      );
      out.push({ date, hours: Math.round(hours * 10) / 10, count: list.length });
    }
    return out;
  });
  private readonly capacity = computed(
    () =>
      Math.max(this.data.resources().filter((r) => r.kind === 'mechanic' && r.active).length, 1) *
      WORK_HOURS,
  );
  readonly loadChart = computed(() => {
    const d = this.days();
    const cap = this.capacity();
    return columns({
      labels: d.map((x) => [dayName(x.date, { weekday: 'short' }), String(x.date.getDate())]),
      title: (i) => dayName(d[i].date, { weekday: 'long', day: 'numeric', month: 'long' }),
      series: [{ label: 'Bokad tid', data: d.map((x) => x.hours), color: ACCENT }],
      format: (v) => `${String(v).replace('.', ',')} h`,
      footer: (i) => [`${d[i].count} bokningar`],
      reference: { value: cap, label: `Kapacitet ${cap} h` },
      min: cap * 1.1,
    });
  });
  readonly loadTable = computed<PanelTable>(() => ({
    head: ['Dag', 'Bokad tid (h)', 'Bokningar'],
    rows: this.days().map((x) => [
      dayName(x.date, { weekday: 'long', day: 'numeric', month: 'long' }),
      String(x.hours).replace('.', ','),
      x.count,
    ]),
  }));
}
