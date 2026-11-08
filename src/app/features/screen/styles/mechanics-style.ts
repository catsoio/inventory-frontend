import { Component, computed } from '@angular/core';
import { ScreenOrder } from '../../../core/models';
import { initialsOf, statusTitle } from '../screen-format';
import { ScreenStyleBase } from './style-base';

const NONE = 'Ej tilldelad';

const CHIP = {
  open: 'bg-sky-400/20 text-sky-200',
  in_progress: 'bg-emerald-400/20 text-emerald-200',
  waiting_parts: 'bg-amber-400/20 text-amber-200',
} as const;

/** Per mekaniker: en kolumn per person med dennes order, och en för order ingen fått än. Svarar på "vad gör Kalle?". */
@Component({
  selector: 'app-screen-mechanics',
  standalone: false,
  host: { class: 'block h-full bg-[#10131f] text-slate-100' },
  template: `
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between gap-6 px-8 pt-5 pb-4">
        <div class="min-w-0">
          <div class="truncate text-3xl font-semibold tracking-tight">{{ view().garageName }}</div>
          <div class="text-lg text-slate-400">
            {{ total() }} order
            @if (late() > 0) {
              <span class="ml-3 font-medium text-red-300">· {{ late() }} försenade</span>
            }
          </div>
        </div>
        <div class="text-5xl leading-none font-semibold tabular-nums">{{ clock() }}</div>
      </header>

      @if (offline()) {
        <div
          class="mx-8 mb-3 flex items-center gap-3 rounded-xl bg-red-950 px-5 py-3 text-xl text-red-100"
        >
          <mat-icon>wifi_off</mat-icon>
          Ingen kontakt. Visar läget klockan {{ time(view().at) }}.
        </div>
      }

      @if (orders().length === 0) {
        <main class="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
          <mat-icon class="!h-24 !w-24 !text-[96px]">check_circle</mat-icon>
          <div class="text-4xl font-medium">Inga order just nu</div>
        </main>
      } @else {
        <main
          class="grid min-h-0 flex-1 gap-5 px-8 pb-6"
          [style.grid-template-columns]="'repeat(' + people().length + ', minmax(0, 1fr))'"
        >
          @for (p of people(); track p.name) {
            <section class="flex min-h-0 flex-col rounded-3xl bg-white/[0.04] ring-1 ring-white/10">
              <h2 class="flex items-center gap-3 px-5 pt-4 pb-3">
                <span
                  class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl font-bold"
                  [class]="p.none ? 'bg-white/10 text-slate-300' : 'bg-indigo-500 text-white'"
                  >{{ p.none ? '?' : initials(p.name) }}</span
                >
                <span class="min-w-0">
                  <span class="block truncate text-2xl font-semibold">{{ p.name }}</span>
                  <span class="block text-lg text-slate-400">{{ p.orders.length }} order</span>
                </span>
              </h2>
              <div appAutoScroll class="min-h-0 flex-1 space-y-3 overflow-hidden px-4 pt-2 pb-4">
                @for (o of p.orders; track o.id) {
                  <article
                    class="rounded-2xl bg-[#1a1f33] p-4 ring-1"
                    [class]="o.overdue ? 'ring-red-500/70' : 'ring-white/10'"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <app-screen-plate [regNo]="o.regNo" size="sm" />
                      <span
                        class="rounded-full px-3 py-0.5 text-lg font-medium whitespace-nowrap"
                        [class]="chip[o.missingParts ? 'waiting_parts' : o.status]"
                        >{{ o.missingParts ? 'Del saknas' : title(o.status) }}</span
                      >
                    </div>
                    @if (o.vehicle) {
                      <div class="mt-2 truncate text-xl text-slate-300">{{ o.vehicle }}</div>
                    }
                    @for (j of o.jobs; track j.id) {
                      <div class="mt-2 text-xl leading-snug font-medium">{{ j.title }}</div>
                      @if (j.instruction) {
                        <div class="text-lg leading-snug text-slate-400">{{ j.instruction }}</div>
                      }
                    }
                    <div
                      class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-lg text-slate-400"
                    >
                      @if (o.place) {
                        <span class="inline-flex items-center gap-1"
                          ><mat-icon class="!h-5 !w-5 !text-[20px]">garage</mat-icon
                          >{{ o.place }}</span
                        >
                      }
                      @if (o.dueAt) {
                        <span
                          class="inline-flex items-center gap-1 font-medium"
                          [class.text-red-300]="o.overdue"
                        >
                          <mat-icon class="!h-5 !w-5 !text-[20px]">{{
                            o.overdue ? 'warning' : 'flag'
                          }}</mat-icon>
                          {{ due(o.dueAt) }}
                        </span>
                      }
                      @if (o.progress.total > 0) {
                        <span class="ml-auto tabular-nums"
                          >{{ o.progress.done }}/{{ o.progress.total }}</span
                        >
                      }
                    </div>
                  </article>
                }
              </div>
            </section>
          }
        </main>
        @if (view().hidden > 0) {
          <div class="pb-3 text-center text-lg text-slate-500">
            + {{ view().hidden }} order till visas inte
          </div>
        }
      }
    </div>
  `,
})
export class ScreenMechanicsStyle extends ScreenStyleBase {
  readonly chip = CHIP;
  readonly title = statusTitle;
  readonly initials = initialsOf;

  /** Mekanikerna i bokstavsordning, och sist ordern som ingen fått. Order behåller sin brådskeordning. */
  readonly people = computed(() => {
    const by = new Map<string, ScreenOrder[]>();
    for (const o of this.orders()) {
      const key = o.mechanic?.trim() || NONE;
      by.set(key, [...(by.get(key) ?? []), o]);
    }
    return [...by.entries()]
      .map(([name, orders]) => ({ name, orders, none: name === NONE }))
      .sort((a, b) => Number(a.none) - Number(b.none) || a.name.localeCompare(b.name, 'sv'));
  });
}
