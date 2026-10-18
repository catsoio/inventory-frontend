import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
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

/** Garagets färg (Material-token), så att diagrammen följer temat. */
export const brandColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--mat-sys-primary').trim() ||
  '#1976d2';

/**
 * Tunn Angular-omslag runt Chart.js. Skicka en vanlig Chart.js-konfiguration; när den byts ut
 * ritas diagrammet om. Storleken styrs av förälderns höjd.
 */
@Component({
  selector: 'app-chart',
  standalone: false,
  host: { class: 'relative block h-full w-full' },
  template: `<canvas #canvas role="img" [attr.aria-label]="label"></canvas>`,
})
export class ChartView implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) config!: ChartConfiguration;
  @Input() label = 'Diagram';
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
    this.chart = new Chart(this.canvas.nativeElement, {
      ...this.config,
      options: { responsive: true, maintainAspectRatio: false, ...this.config.options },
    });
  }

  ngOnDestroy() {
    this.chart?.destroy();
  }
}
