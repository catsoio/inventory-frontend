import { Component, input } from '@angular/core';
import type { CalloutFix } from './callout-fix';

const TONES = {
  warn: 'bg-amber-50 text-amber-900',
  error: 'bg-red-50 text-red-900',
  info: 'bg-blue-50 text-blue-900',
} as const;
const ICONS = { warn: 'warning', error: 'error', info: 'info' } as const;

/**
 * En varning med vägen till åtgärden: texten säger vad som är fel, knapparna tar användaren dit det
 * rättas ("Öppna kundkortet") eller gör valet åt hen ("Bokför som kvitto"). Varje varning som ber
 * användaren göra något ska ha minst en knapp, så att ingen behöver leta.
 */
@Component({
  selector: 'app-callout',
  standalone: false,
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg p-3 text-sm"
      [class]="tones[tone()]"
    >
      <mat-icon class="!h-5 !w-5 shrink-0 !text-xl">{{ icon() ?? icons[tone()] }}</mat-icon>
      <div class="min-w-0 flex-1"><ng-content /></div>
      @if (fixes().length) {
        <div class="flex flex-wrap gap-2">
          @for (f of fixes(); track f.label) {
            @if (f.link) {
              <a
                mat-stroked-button
                class="!bg-white"
                [routerLink]="f.link"
                [queryParams]="f.queryParams"
                (click)="f.click?.()"
              >
                @if (f.icon) {
                  <mat-icon>{{ f.icon }}</mat-icon>
                }
                {{ f.label }}
              </a>
            } @else {
              <button mat-stroked-button class="!bg-white" type="button" (click)="f.click?.()">
                @if (f.icon) {
                  <mat-icon>{{ f.icon }}</mat-icon>
                }
                {{ f.label }}
              </button>
            }
          }
        </div>
      }
    </div>
  `,
})
export class Callout {
  readonly tone = input<'warn' | 'error' | 'info'>('warn');
  readonly icon = input<string>();
  readonly fixes = input<CalloutFix[]>([]);
  readonly tones = TONES;
  readonly icons = ICONS;
}
