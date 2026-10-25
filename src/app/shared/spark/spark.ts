import { Component, computed, input } from '@angular/core';
import { ACCENT, CHROME, OTHER } from '../chart/chart-theme';

const H = 28;

/**
 * Liten kurva för ett nyckeltal. Hela förloppet i dämpat grått och den senaste perioden i
 * accentfärgen, med en markör i änden (8 px med 2 px ring). Ritas som SVG, ingen axel.
 */
@Component({
  selector: 'app-spark',
  standalone: false,
  host: { class: 'relative block h-7 w-full', role: 'img', '[attr.aria-label]': 'label()' },
  template: `
    @if (pts().length > 1) {
      <svg
        class="absolute inset-0 h-full w-full overflow-visible"
        [attr.viewBox]="'0 0 100 ' + h"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          [attr.points]="all()"
          fill="none"
          [attr.stroke]="muted"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
        <polyline
          [attr.points]="recent()"
          fill="none"
          [attr.stroke]="accent"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      @if (end(); as e) {
        <span
          class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          [style.left.%]="e.x"
          [style.top.%]="e.y"
          [style.background]="accent"
          [style.box-shadow]="'0 0 0 2px ' + surface"
        ></span>
      }
    }
  `,
})
export class Spark {
  readonly values = input<number[]>([]);
  readonly label = input('Utveckling');
  readonly h = H;
  readonly accent = ACCENT;
  readonly muted = OTHER;
  readonly surface = CHROME.surface;

  /** Punkterna i viewBox 0..100 × 0..H (y vänds, 2 px luft upptill och nedtill). */
  readonly pts = computed(() => {
    const v = this.values();
    if (v.length < 2) return [];
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    return v.map((n, i) => ({
      x: (i / (v.length - 1)) * 100,
      y: H - 3 - ((n - min) / span) * (H - 6),
    }));
  });
  private readonly str = (p: { x: number; y: number }[]) =>
    p.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ');
  readonly all = computed(() => this.str(this.pts()));
  readonly recent = computed(() => this.str(this.pts().slice(-2)));
  /** Markörens läge i procent av bredd och höjd. */
  readonly end = computed(() => {
    const p = this.pts();
    const e = p[p.length - 1];
    return e ? { x: e.x, y: (e.y / H) * 100 } : null;
  });
}
