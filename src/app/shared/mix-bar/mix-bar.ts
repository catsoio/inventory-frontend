import { Component, computed, input } from '@angular/core';

export interface MixPart {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Liten förklaring bredvid, t.ex. "varav dubbade 12". */
  note?: string;
}

/**
 * Andelar av en helhet: en tunn stapel i 100 % och under den en rad per del med antal och procent.
 * Listan är tabellvyn (varje värde står i text), så färgen bär aldrig något ensam.
 */
@Component({
  selector: 'app-mix-bar',
  standalone: false,
  host: { class: 'block' },
  template: `
    @if (total() === 0) {
      <p class="py-2 text-sm text-gray-500">Inget att visa än.</p>
    }
    <div
      class="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-gray-100"
      [class.hidden]="total() === 0"
      role="img"
      [attr.aria-label]="aria()"
    >
      @for (p of visible(); track p.key) {
        <div
          class="h-full min-w-1"
          [style.flex-grow]="p.value"
          [style.background]="p.color"
          [title]="p.label + ': ' + p.value + ' ' + unit()"
        ></div>
      }
    </div>
    <ul class="mt-3 grid gap-1.5 text-sm">
      @for (p of visible(); track p.key) {
        <li class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 shrink-0 rounded-sm" [style.background]="p.color"></span>
          <span class="min-w-0 flex-1 truncate text-gray-700">{{ p.label }}</span>
          @if (p.note) {
            <span class="hidden text-xs text-gray-500 sm:inline">{{ p.note }}</span>
          }
          <b class="font-semibold tabular-nums">{{ p.value }}</b>
          <span class="w-10 text-right text-xs text-gray-500 tabular-nums">{{ pct(p) }} %</span>
        </li>
      }
    </ul>
  `,
})
export class MixBar {
  readonly parts = input.required<MixPart[]>();
  /** Vad som räknas: "set", "däck". */
  readonly unit = input('st');
  readonly total = computed(() => this.parts().reduce((t, p) => t + p.value, 0));
  readonly visible = computed(() => this.parts().filter((p) => p.value > 0));
  readonly aria = computed(() =>
    this.parts()
      .map((p) => `${p.label} ${p.value}`)
      .join(', '),
  );

  pct(p: MixPart): number {
    return this.total() ? Math.round((p.value / this.total()) * 100) : 0;
  }
}
