import { Component, input } from '@angular/core';

/** Förändring mot en tidigare period. Färgen är riktning × om uppåt är bra. */
export interface Delta {
  text: string;
  icon: 'arrow_upward' | 'arrow_downward' | 'remove';
  tone: 'good' | 'bad' | 'flat';
}

/**
 * `upIsGood = false` för sådant där mindre är bättre (obetalt, försenat), `null` när varken upp
 * eller ned är bra eller dåligt (inköp): då visas bara riktningen, utan färg.
 */
export function delta(
  cur: number | null | undefined,
  prev: number | null | undefined,
  upIsGood: boolean | null = true,
): Delta | null {
  if (cur == null || prev == null) return null;
  const tone = (up: boolean): Delta['tone'] =>
    upIsGood === null ? 'flat' : up === upIsGood ? 'good' : 'bad';
  if (prev === 0) {
    return cur === 0
      ? { text: '0 %', icon: 'remove', tone: 'flat' }
      : { text: 'Ny', icon: 'arrow_upward', tone: tone(true) };
  }
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return { text: '0 %', icon: 'remove', tone: 'flat' };
  const up = pct > 0;
  return {
    text: `${Math.abs(pct)} %`,
    icon: up ? 'arrow_upward' : 'arrow_downward',
    tone: tone(up),
  };
}

const TONE: Record<Delta['tone'], string> = {
  good: 'text-[#006300]',
  bad: 'text-red-700',
  flat: 'text-gray-500',
};

/**
 * Nyckeltal: etikett, värde, en förklarande rad och eventuellt en kurva. Hela rutan är en länk
 * till sidan där man gör något åt siffran. `status` markerar sådant som kräver uppmärksamhet och
 * följs alltid av en ikon, så färgen aldrig bär betydelsen ensam.
 */
@Component({
  selector: 'app-stat',
  standalone: false,
  host: { class: 'block min-w-0' },
  template: `
    <ng-template #body>
      <span class="text-xs leading-tight font-medium text-gray-600">{{ label() }}</span>
      <span class="mt-1.5 block truncate text-[26px] leading-none font-semibold tracking-tight">
        {{ value() }}
      </span>
      <span class="mt-1.5 flex min-h-4 flex-wrap items-center gap-x-1.5 text-xs">
        @if (delta(); as d) {
          <span class="inline-flex items-center font-medium" [class]="tones[d.tone]">
            <mat-icon class="!h-4 !w-4 !text-sm !leading-4">{{ d.icon }}</mat-icon
            >{{ d.text }}
          </span>
        }
        @if (status() === 'warn') {
          <mat-icon class="!h-4 !w-4 !text-sm !leading-4 text-amber-700">warning</mat-icon>
        } @else if (status() === 'bad') {
          <mat-icon class="!h-4 !w-4 !text-sm !leading-4 text-red-700">error</mat-icon>
        }
        <span
          class="truncate"
          [class]="
            status() === 'bad'
              ? 'font-medium text-red-700'
              : status() === 'warn'
                ? 'font-medium text-amber-800'
                : 'text-gray-500'
          "
          >{{ hint() }}</span
        >
      </span>
      @if (trend().length > 1) {
        <app-spark class="mt-2" [values]="trend()" [label]="'Utveckling: ' + label()" />
      }
    </ng-template>

    @if (link(); as l) {
      <a
        [routerLink]="l"
        [queryParams]="params()"
        class="block h-full rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
      >
        <ng-container *ngTemplateOutlet="body" />
      </a>
    } @else {
      <div class="h-full rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <ng-container *ngTemplateOutlet="body" />
      </div>
    }
  `,
})
export class Stat {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input('');
  readonly delta = input<Delta | null>(null);
  readonly trend = input<number[]>([]);
  readonly link = input<string | null>(null);
  readonly params = input<Record<string, string | number | boolean>>({});
  readonly status = input<'none' | 'warn' | 'bad'>('none');
  readonly tones = TONE;
}
