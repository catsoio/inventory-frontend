import { Component, input } from '@angular/core';

export interface SummaryFlag {
  text: string;
  /** Färgen har fast betydelse: gul = väntar på dig, röd = brådskande (som siffrorna i menyn). */
  tone?: 'amber' | 'red';
  /** Sätter ett filter så att man ser exakt de posterna. Utan den är raden bara information. */
  click?: () => void;
}

const TONES = {
  none: 'border-gray-200 bg-white text-gray-700',
  amber: 'border-amber-300 bg-amber-50 text-amber-900',
  red: 'border-red-300 bg-red-50 text-red-900',
} as const;

/**
 * Raden mellan verktygsraden och tabellen: vad man tittar på, i ett enda format. Först en vanlig
 * text med antal och summa ("36 set inlagrade · 140 st"), sedan flaggor för det som väntar på
 * någon (obetalda, försenade). En flagga som går att klicka sätter filtret; den är en rundad ruta
 * som knapparna, aldrig en pill (pillen är en statusetikett som bara säger något).
 */
@Component({
  selector: 'app-summary',
  standalone: false,
  host: { class: 'mb-3 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm' },
  template: `
    <span class="text-gray-600"><ng-content /></span>
    @for (f of flags(); track f.text) {
      @if (f.click) {
        <button
          type="button"
          class="rounded-lg border px-2.5 py-0.5 hover:brightness-95"
          [class]="tones[f.tone ?? 'none']"
          (click)="f.click()"
        >
          {{ f.text }}
        </button>
      } @else {
        <span class="rounded-lg border px-2.5 py-0.5" [class]="tones[f.tone ?? 'none']">{{
          f.text
        }}</span>
      }
    }
  `,
})
export class Summary {
  readonly tones = TONES;
  readonly flags = input<SummaryFlag[]>([]);
}
