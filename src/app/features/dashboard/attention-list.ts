import { Component, input } from '@angular/core';
import type { Attention } from './home-data';

/**
 * "Att göra": det som väntar på någon, en rad per sak med antal och en länk dit man gör något
 * åt det. Tonen följs alltid av en ikon, så färgen aldrig bär betydelsen ensam.
 */
@Component({
  selector: 'app-attention-list',
  standalone: false,
  host: { class: 'block' },
  template: `
    @if (items().length) {
      <ul class="-my-1 divide-y divide-gray-100">
        @for (a of items(); track a.key) {
          <li>
            <a
              [routerLink]="a.link"
              [queryParams]="a.params"
              class="flex min-h-12 items-center gap-3 rounded-lg py-2 hover:bg-gray-50 active:bg-gray-100"
            >
              <span
                class="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                [class]="tones[a.tone]"
              >
                <mat-icon class="!h-5 !w-5 !text-xl">{{ a.icon }}</mat-icon>
              </span>
              <span class="min-w-0 flex-1 text-sm leading-snug">{{ a.text }}</span>
              <mat-icon class="shrink-0 text-gray-300">chevron_right</mat-icon>
            </a>
          </li>
        }
      </ul>
    } @else if (ready()) {
      <p class="flex items-center gap-2 py-3 text-sm text-gray-600">
        <mat-icon class="text-[#006300]">check_circle</mat-icon>
        Allt under kontroll just nu.
      </p>
    }
  `,
})
export class AttentionList {
  readonly items = input.required<Attention[]>();
  /** Sant när all data hämtats, så att "Allt under kontroll" inte blinkar fram för tidigt. */
  readonly ready = input(true);
  readonly tones: Record<Attention['tone'], string> = {
    bad: 'bg-red-50 text-red-700',
    warn: 'bg-amber-50 text-amber-800',
    info: 'bg-sky-50 text-sky-800',
  };
}
