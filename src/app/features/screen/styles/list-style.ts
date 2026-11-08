import { Component } from '@angular/core';
import { statusTitle } from '../screen-format';
import { plateOf } from '../screen-format';
import { ScreenStyleBase } from './style-base';

const DOT = {
  open: 'bg-sky-400',
  in_progress: 'bg-emerald-400',
  waiting_parts: 'bg-amber-400',
} as const;

/** Lista: som en avgångstavla på en flygplats. En rad per order, jättetext, svart och gult. Läsbar på långt håll. */
@Component({
  selector: 'app-screen-list',
  standalone: false,
  host: { class: 'block h-full bg-black text-[#ffd23f]' },
  template: `
    <div class="flex h-full flex-col font-mono">
      <header
        class="flex items-end justify-between gap-6 border-b-4 border-[#ffd23f] px-8 pt-5 pb-3"
      >
        <div class="min-w-0">
          <div class="truncate text-4xl font-bold tracking-wide uppercase">
            {{ view().garageName }}
          </div>
          <div class="text-xl text-[#ffd23f]/70">
            {{ total() }} order
            @if (late() > 0) {
              <span class="ml-3 font-bold text-red-400">· {{ late() }} FÖRSENADE</span>
            }
          </div>
        </div>
        <div class="text-7xl leading-none font-bold tabular-nums">{{ clock() }}</div>
      </header>

      @if (offline()) {
        <div class="bg-red-600 px-8 py-2 text-2xl font-bold text-white">
          INGEN KONTAKT · LÄGE KL {{ time(view().at) }}
        </div>
      }

      @if (orders().length === 0) {
        <main class="flex flex-1 items-center justify-center text-5xl font-bold">
          INGA ORDER JUST NU
        </main>
      } @else {
        <div
          class="grid grid-cols-[13rem_1.1fr_2fr_9rem_8rem_9rem_12rem] gap-x-5 border-b border-[#ffd23f]/40 px-8 py-2 text-xl tracking-widest text-[#ffd23f]/60 uppercase"
        >
          <span>Regnr</span><span>Bil</span><span>Jobb</span><span>Mekaniker</span><span>Plats</span
          ><span>Klar</span><span>Status</span>
        </div>
        <main appAutoScroll class="min-h-0 flex-1 overflow-hidden">
          @for (o of orders(); track o.id; let odd = $odd) {
            <div
              class="grid grid-cols-[13rem_1.1fr_2fr_9rem_8rem_9rem_12rem] items-center gap-x-5 px-8 py-3.5 text-3xl"
              [class.bg-white/5]="odd"
              [class.text-red-400]="o.overdue"
            >
              <span class="font-bold tracking-widest whitespace-nowrap">{{ plate(o.regNo) }}</span>
              <span class="truncate">{{ o.vehicle ?? '' }}</span>
              <span class="truncate"
                >{{ o.jobs[0]?.title ?? '' }}
                @if (o.jobs.length > 1) {
                  <span class="text-[#ffd23f]/60"> +{{ o.jobs.length - 1 }}</span>
                }
              </span>
              <span class="truncate">{{ o.mechanic ?? '–' }}</span>
              <span class="truncate">{{ o.place ?? '–' }}</span>
              <span class="whitespace-nowrap">{{ o.dueAt ? due(o.dueAt) : '–' }}</span>
              <span class="flex items-center gap-3 whitespace-nowrap">
                <span
                  class="h-4 w-4 shrink-0 rounded-full"
                  [class]="dot[o.missingParts ? 'waiting_parts' : o.status]"
                ></span>
                <span class="truncate text-2xl uppercase">{{
                  o.missingParts ? 'Del saknas' : title(o.status)
                }}</span>
              </span>
            </div>
          }
        </main>
        @if (view().hidden > 0) {
          <div class="border-t border-[#ffd23f]/40 py-2 text-center text-xl text-[#ffd23f]/70">
            + {{ view().hidden }} ORDER TILL
          </div>
        }
      }
    </div>
  `,
})
export class ScreenListStyle extends ScreenStyleBase {
  readonly dot = DOT;
  readonly title = statusTitle;
  readonly plate = plateOf;
}
