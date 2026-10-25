import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { CHROME, INK } from './chart-theme';
import { htmlTooltip } from './chart-tooltip';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
);

// Gemensamma förval: samma typsnitt, tysta hårfina linjer, tooltip som HTML.
Chart.defaults.font.family = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = INK.muted;
Chart.defaults.borderColor = CHROME.grid;
// Kortare animation. `set` slår ihop med standardvärdena; en ersatt objekt tappar Chart.js interna fält.
Chart.defaults.set('animation', { duration: 300 });
Chart.defaults.plugins.tooltip.enabled = false;
Chart.defaults.plugins.tooltip.external = htmlTooltip;
Chart.defaults.plugins.legend.align = 'start';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyle = 'rectRounded';
Chart.defaults.plugins.legend.labels.boxWidth = 9;
Chart.defaults.plugins.legend.labels.boxHeight = 9;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.legend.labels.color = INK.secondary;

/**
 * Tunn Angular-omslag runt Chart.js. Skicka en konfiguration (helst från `chart-kit`); när den
 * byts ut ritas diagrammet om. Storleken styrs av förälderns höjd.
 */
@Component({
  selector: 'app-chart',
  standalone: false,
  host: { class: 'relative block h-full w-full' },
  template: `<canvas #canvas role="img" [attr.aria-label]="label"></canvas>`,
})
export class ChartView implements AfterViewInit, OnChanges, OnDestroy {
  // Diagramtypen (stapel, linje) skiljer sig per konfiguration, så den hålls öppen här.
  @Input({ required: true }) config!: ChartConfiguration<any>;
  @Input() label = 'Diagram';
  /** Klick på en stapel eller punkt: vilken kategori (index) och serie. Ger pekare över stapeln. */
  @Output() pick = new EventEmitter<{ index: number; datasetIndex: number }>();
  @ViewChild('canvas') private canvas!: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;

  ngAfterViewInit() {
    this.draw();
  }

  ngOnChanges() {
    if (this.canvas) this.draw();
  }

  private draw() {
    this.chart?.destroy();
    const clickable = this.pick.observed;
    this.chart = new Chart(this.canvas.nativeElement, {
      ...this.config,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        ...(clickable
          ? {
              onClick: (_e, els) => {
                if (els.length)
                  this.pick.emit({ index: els[0].index, datasetIndex: els[0].datasetIndex });
              },
              onHover: (e, els) => {
                const t = e.native?.target as HTMLElement | undefined;
                if (t) t.style.cursor = els.length ? 'pointer' : 'default';
              },
            }
          : {}),
        ...this.config.options,
      },
    });
  }

  ngOnDestroy() {
    this.chart?.destroy();
  }
}
