import { Component } from '@angular/core';
import { statusTitle } from '../screen-format';
import { ScreenStyleBase } from './style-base';

const BAR = {
  open: 'bg-sky-500',
  in_progress: 'bg-emerald-500',
  waiting_parts: 'bg-amber-500',
} as const;
const PILL = {
  open: 'bg-sky-100 text-sky-800',
  in_progress: 'bg-emerald-100 text-emerald-800',
  waiting_parts: 'bg-amber-100 text-amber-900',
} as const;

/** Ljus: vit bakgrund och ett enda rutnät av kort i turordning, status som färgad kant och märke. Passar en ljus hall. */
@Component({
  selector: 'app-screen-light',
  standalone: false,
  host: { class: 'block h-full bg-stone-100 text-slate-900' },
  template: `
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between gap-6 bg-white px-8 py-4 shadow-sm">
        <div class="flex min-w-0 items-baseline gap-5">
          <div class="truncate text-3xl font-bold tracking-tight">{{ view().garageName }}</div>
          <div class="text-xl text-slate-500">
            {{ total() }} order
            @if (late() > 0) {
              <span class="ml-2 font-semibold text-red-600">· {{ late() }} försenade</span>
            }
          </div>
        </div>
        <div class="flex items-baseline gap-5">
          <div class="text-xl text-slate-500 first-letter:uppercase">{{ date() }}</div>
          <div class="text-5xl leading-none font-bold tabular-nums">{{ clock() }}</div>
        </div>
      </header>

      @if (offline()) {
        <div class="flex items-center gap-3 bg-red-600 px-8 py-2.5 text-xl text-white">
          <mat-icon>wifi_off</mat-icon>
          Ingen kontakt. Visar läget klockan {{ time(view().at) }}.
        </div>
      }

      @if (orders().length === 0) {
        <main class="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
          <mat-icon class="!h-24 !w-24 !text-[96px]">check_circle</mat-icon>
          <div class="text-4xl font-semibold">Inga order just nu</div>
        </main>
      } @else {
        <main
          appAutoScroll
          class="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(27rem,1fr))] content-start gap-5 overflow-hidden p-6"
        >
          @for (o of orders(); track o.id) {
            <article class="relative overflow-hidden rounded-2xl bg-white p-5 pl-7 shadow-md">
              <span class="absolute inset-y-0 left-0 w-2.5" [class]="bar[o.status]"></span>
              <div class="flex items-center justify-between gap-3">
                <app-screen-plate [regNo]="o.regNo" />
                <span
                  class="rounded-full px-4 py-1 text-xl font-semibold whitespace-nowrap"
                  [class]="pill[o.status]"
                  >{{ title(o.status) }}</span
                >
              </div>
              @if (o.vehicle) {
                <div class="mt-3 flex items-center gap-3 text-2xl font-medium text-slate-700">
                  <span
                    class="inline-block h-4 w-4 shrink-0 rounded-full ring-1 ring-slate-400"
                    [style.background]="color(o.vehicleColor)"
                  ></span>
                  <span class="truncate">{{ o.vehicle }}</span>
                  <span class="ml-auto text-lg font-normal text-slate-400 tabular-nums">{{
                    o.code
                  }}</span>
                </div>
              }
              @for (j of o.jobs; track j.id) {
                <div class="mt-3 text-2xl leading-snug font-semibold">{{ j.title }}</div>
                @if (j.instruction) {
                  <div class="text-xl leading-snug text-slate-500">{{ j.instruction }}</div>
                }
              }
              @if (o.remarks) {
                <div
                  class="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-xl leading-snug text-slate-600"
                >
                  {{ o.remarks }}
                </div>
              }
              <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xl text-slate-600">
                @if (o.mechanic) {
                  <span class="inline-flex items-center gap-1.5"
                    ><mat-icon class="!h-6 !w-6 !text-[24px]">person</mat-icon
                    >{{ o.mechanic }}</span
                  >
                }
                @if (o.place) {
                  <span class="inline-flex items-center gap-1.5"
                    ><mat-icon class="!h-6 !w-6 !text-[24px]">garage</mat-icon>{{ o.place }}</span
                  >
                }
                @if (o.dueAt) {
                  <span
                    class="inline-flex items-center gap-1.5 font-semibold"
                    [class.text-red-600]="o.overdue"
                  >
                    <mat-icon class="!h-6 !w-6 !text-[24px]">{{
                      o.overdue ? 'warning' : 'flag'
                    }}</mat-icon>
                    {{ o.overdue ? 'Försenad ' : 'Klar ' }}{{ due(o.dueAt) }}
                  </span>
                }
                @if (o.missingParts) {
                  <span class="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                    <mat-icon class="!h-6 !w-6 !text-[24px]">inventory_2</mat-icon>Del saknas
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
        </main>
        @if (view().hidden > 0) {
          <div class="bg-white py-2 text-center text-lg text-slate-500">
            + {{ view().hidden }} order till visas inte
          </div>
        }
      }
    </div>
  `,
})
export class ScreenLightStyle extends ScreenStyleBase {
  readonly bar = BAR;
  readonly pill = PILL;
  readonly title = statusTitle;
}
