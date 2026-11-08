import { Component } from '@angular/core';
import { STATUSES } from '../screen-format';
import { ScreenStyleBase } from './style-base';

const ACCENT = {
  open: 'text-sky-300',
  in_progress: 'text-emerald-300',
  waiting_parts: 'text-amber-300',
} as const;

/** Tavla: mörk, tre kolumner efter status. Det man ser först är vad som pågår och vad som väntar. */
@Component({
  selector: 'app-screen-board',
  standalone: false,
  host: { class: 'block h-full bg-slate-950 text-slate-100' },
  template: `
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between gap-6 px-8 pt-5 pb-4">
        <div class="min-w-0">
          <div class="truncate text-3xl font-semibold tracking-tight">{{ view().garageName }}</div>
          <div class="text-lg text-slate-400">
            {{ total() }} order i huset
            @if (late() > 0) {
              <span class="ml-3 font-medium text-red-300">· {{ late() }} försenade</span>
            }
          </div>
        </div>
        <div class="text-right">
          <div class="text-5xl leading-none font-semibold tabular-nums">{{ clock() }}</div>
          <div class="mt-1 text-lg text-slate-400 first-letter:uppercase">{{ date() }}</div>
        </div>
      </header>

      @if (offline()) {
        <div
          class="mx-8 mb-3 flex items-center gap-3 rounded-xl bg-red-950 px-5 py-3 text-xl text-red-100 ring-1 ring-red-500/50"
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
        <main class="grid min-h-0 flex-1 grid-cols-3 gap-5 px-8 pb-6">
          @for (c of columns; track c.status) {
            <section class="flex min-h-0 flex-col rounded-3xl bg-slate-900/60 ring-1 ring-white/5">
              <h2
                class="flex items-center gap-3 px-5 pt-4 pb-3 text-2xl font-semibold"
                [class]="accent[c.status]"
              >
                <mat-icon>{{ c.icon }}</mat-icon>
                {{ c.title }}
                <span
                  class="ml-auto rounded-full bg-white/10 px-3 py-0.5 text-xl text-slate-200 tabular-nums"
                  >{{ grouped()[c.status].length }}</span
                >
              </h2>
              <div appAutoScroll class="min-h-0 flex-1 space-y-4 overflow-hidden px-4 pt-2 pb-4">
                @for (o of grouped()[c.status]; track o.id) {
                  <article
                    class="rounded-2xl bg-slate-900 p-5 ring-1"
                    [class]="o.overdue ? 'ring-red-500/70' : 'ring-white/10'"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <app-screen-plate [regNo]="o.regNo" />
                      <span class="text-xl text-slate-500 tabular-nums">{{ o.code }}</span>
                    </div>
                    @if (o.vehicle) {
                      <div class="mt-3 flex items-center gap-3 text-2xl text-slate-200">
                        <span
                          class="inline-block h-4 w-4 shrink-0 rounded-full ring-1 ring-white/40"
                          [style.background]="color(o.vehicleColor)"
                        ></span>
                        <span class="truncate">{{ o.vehicle }}</span>
                      </div>
                    }
                    <div class="mt-3 flex flex-wrap gap-2 text-xl">
                      @if (o.mechanic) {
                        <span
                          class="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1"
                        >
                          <mat-icon class="!h-6 !w-6 !text-[24px]">person</mat-icon>{{ o.mechanic }}
                        </span>
                      }
                      @if (o.place) {
                        <span
                          class="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1"
                        >
                          <mat-icon class="!h-6 !w-6 !text-[24px]">garage</mat-icon>{{ o.place }}
                        </span>
                      }
                      @if (o.dueAt) {
                        <span
                          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 font-medium"
                          [class]="o.overdue ? 'bg-red-500/20 text-red-200' : 'bg-white/10'"
                        >
                          <mat-icon class="!h-6 !w-6 !text-[24px]">{{
                            o.overdue ? 'warning' : 'flag'
                          }}</mat-icon>
                          {{ o.overdue ? 'Försenad ' : 'Klar ' }}{{ due(o.dueAt) }}
                        </span>
                      }
                      @if (o.missingParts) {
                        <span
                          class="inline-flex items-center gap-1.5 rounded-lg bg-amber-400/20 px-3 py-1 font-medium text-amber-200"
                        >
                          <mat-icon class="!h-6 !w-6 !text-[24px]">inventory_2</mat-icon>Del saknas
                        </span>
                      }
                    </div>
                    @if (o.jobs.length) {
                      <ul class="mt-4 space-y-2">
                        @for (j of o.jobs; track j.id) {
                          <li>
                            <div class="text-2xl leading-snug font-medium">{{ j.title }}</div>
                            @if (j.instruction) {
                              <div class="text-xl leading-snug text-slate-400">
                                {{ j.instruction }}
                              </div>
                            }
                          </li>
                        }
                      </ul>
                    }
                    @if (o.remarks) {
                      <div
                        class="mt-3 border-l-4 border-slate-600 pl-3 text-xl leading-snug text-slate-300"
                      >
                        {{ o.remarks }}
                      </div>
                    }
                    @if (o.progress.total > 0) {
                      <div class="mt-4 flex items-center gap-3">
                        <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            class="h-full rounded-full bg-emerald-400"
                            [style.width.%]="(o.progress.done / o.progress.total) * 100"
                          ></div>
                        </div>
                        <span class="text-lg text-slate-400 tabular-nums"
                          >{{ o.progress.done }}/{{ o.progress.total }}</span
                        >
                      </div>
                    }
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
export class ScreenBoardStyle extends ScreenStyleBase {
  readonly columns = STATUSES;
  readonly accent = ACCENT;
}
