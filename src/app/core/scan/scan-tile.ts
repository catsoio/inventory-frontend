import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * En stor ruta i ett skanningsblad: ikon över text, lätt att träffa med tummen. Samma ruta för en ny
 * bil, en känd bil och en okänd kod, så bladen känns lika. `primary` är det man troligast vill göra
 * (fylld i produktens färg); resten är vita.
 */
@Component({
  selector: 'button[app-scan-tile]',
  standalone: true,
  imports: [MatIconModule],
  host: {
    type: 'button',
    class:
      'flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-2xl p-3 text-center shadow-sm transition active:scale-[0.98]',
    '[class.bg-brand]': 'primary()',
    '[class.text-white]': 'primary()',
    '[class.bg-white]': '!primary()',
    '[class.ring-1]': '!primary()',
    '[class.ring-gray-200]': '!primary()',
  },
  template: `
    <mat-icon class="!h-8 !w-8 !text-3xl" [class.text-brand]="!primary()">{{ icon() }}</mat-icon>
    <span class="text-[15px] leading-tight font-semibold">{{ label() }}</span>
    @if (sub()) {
      <span
        class="max-w-full truncate text-xs leading-tight"
        [class.opacity-80]="primary()"
        [class.text-gray-500]="!primary()"
        >{{ sub() }}</span
      >
    }
  `,
})
export class ScanTile {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly sub = input('');
  readonly primary = input(false);
}
