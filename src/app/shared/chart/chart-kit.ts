import type { ChartConfiguration, ChartType, Plugin, ScriptableContext } from 'chart.js';
import { ACCENT, CHROME, INK, tint } from './chart-theme';

declare module 'chart.js' {
  interface PluginOptionsByType<TType extends ChartType> {
    /** Vågrät referenslinje (t.ex. kapacitet) med etikett vid högerkanten. */
    refLine?: { value: number; label: string } | false;
    /** Värde vid änden av varje liggande stapel (eller summan för en stapel i staplar). */
    tipLabels?: { format: (v: number) => string; totals?: number[] } | false;
  }
}

/** Siffror: tusentalsavgränsare efter svensk sed, hela tal. */
export const fmtInt = (v: number): string => Math.round(v).toLocaleString('sv-SE');
export const fmtKr = (v: number): string => `${Math.round(v).toLocaleString('sv-SE')} kr`;
/** Öre till hela kronor, för nyckeltal: 2 094 683 kr. */
export const kronor = (ore: number | null | undefined): string =>
  ore == null ? '–' : fmtKr(ore / 100);
const trim = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
/** Axelns skala: 0 / 50 tkr / 1,2 Mkr (kompakt från 1 000). */
export const tickKr = (v: number): string =>
  Math.abs(v) >= 1e6
    ? `${trim(v / 1e6)} Mkr`
    : Math.abs(v) >= 1e3
      ? `${trim(v / 1e3)} tkr`
      : String(v);
export const tickInt = (v: number): string => Math.round(v).toLocaleString('sv-SE');

/** En serie. `colors` ger egen färg per punkt (betoning), annars `color`. */
export interface Serie {
  label: string;
  data: number[];
  color: string;
  colors?: string[];
}

interface Common {
  series: Serie[];
  /** Hur ett värde skrivs i tooltip och på etiketter. */
  format?: (v: number) => string;
  /** Hur axelns värden skrivs. */
  tick?: (v: number) => string;
  /** Extra rader längst ned i tooltipen för en kategori. */
  footer?: (index: number) => string[];
  /** Rubrik i tooltipen (annars kategorins etikett), t.ex. "v. 44 · 26 okt–1 nov". */
  title?: (index: number) => string;
  /** Tjockleken på en stapel i px (högst 24 enligt standarden). */
  thickness?: number;
}

export interface ColumnOptions extends Common {
  /** En etikett kan vara flera rader (t.ex. veckodag och datum). */
  labels: (string | string[])[];
  /** Visa alla etiketter även när de är täta (några få och läsbara); annars hoppas varannan över. */
  allLabels?: boolean;
  stacked?: boolean;
  reference?: { value: number; label: string };
  /** Håll axeln minst så här hög (t.ex. kapaciteten). */
  min?: number;
}

export interface BarOptions extends Common {
  labels: string[];
  stacked?: boolean;
  /** Kategorietiketter längre än så här kapas. */
  maxLabel?: number;
}

const topRounded = { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 };
const endRounded = { topLeft: 0, topRight: 4, bottomLeft: 0, bottomRight: 4 };

/** I en stapel är det bara översta synliga segmentet som rundas av (datans ände). */
function onlyLast(horizontal: boolean) {
  const round = horizontal ? endRounded : topRounded;
  return (c: ScriptableContext<'bar'>) => {
    const { chart, datasetIndex, dataIndex } = c;
    const sets = chart.data.datasets;
    const higher = sets.some(
      (d, i) => i > datasetIndex && chart.isDatasetVisible(i) && Number(d.data[dataIndex]) > 0,
    );
    return higher ? 0 : round;
  };
}

const refLine: Plugin<'bar'> = {
  id: 'refLine',
  afterDatasetsDraw(chart, _args, options) {
    const opts = options as { value: number; label: string } | false;
    if (!opts) return;
    const y = chart.scales['y'];
    const { left, right, top, bottom } = chart.chartArea;
    const py = y.getPixelForValue(opts.value);
    if (py < top || py > bottom) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = INK.secondary;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(right, py);
    ctx.stroke();
    ctx.fillStyle = INK.secondary;
    ctx.font = `500 11px ${chart.options.font?.family ?? 'sans-serif'}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(opts.label, left + 4, py - 4);
    ctx.restore();
  },
};

const tipLabels: Plugin<'bar'> = {
  id: 'tipLabels',
  afterDatasetsDraw(chart, _args, options) {
    const opts = options as { format: (v: number) => string; totals?: number[] } | false;
    if (!opts) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = `600 12px ${chart.options.font?.family ?? 'sans-serif'}`;
    ctx.fillStyle = INK.secondary;
    ctx.textBaseline = 'middle';
    const n = chart.data.labels?.length ?? 0;
    for (let i = 0; i < n; i++) {
      // Längst ut: den sista synliga serien med ett värde i den här raden.
      let end: { x: number; y: number } | null = null;
      let sum = 0;
      chart.data.datasets.forEach((d, di) => {
        if (!chart.isDatasetVisible(di)) return;
        const v = Number(d.data[i]) || 0;
        sum += v;
        if (v > 0) {
          const el = chart.getDatasetMeta(di).data[i];
          if (el) end = el.getProps(['x', 'y'], true) as { x: number; y: number };
        }
      });
      if (!end || sum <= 0) continue;
      const { x, y } = end as { x: number; y: number };
      ctx.fillText(opts.format(opts.totals?.[i] ?? sum), x + 8, y);
    }
    ctx.restore();
  },
};

const crosshair: Plugin<'line'> = {
  id: 'crosshair',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements();
    if (!active?.length) return;
    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = CHROME.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

const hover = (s: Serie, n: number) =>
  (s.colors ?? Array.from({ length: n }, () => s.color)).map((c) => tint(c, 0.2));

/**
 * Kolumndiagram (lodrätt). Tunna staplar med rundad topp och rak bas, 1 px yta mellan
 * staplar som rör vid varandra, hårfint rutnät, förklaring bara vid två serier eller fler.
 */
export function columns(o: ColumnOptions): ChartConfiguration<'bar'> {
  const fmt = o.format ?? fmtInt;
  const tick = o.tick ?? tickInt;
  const multi = o.series.length > 1;
  return {
    type: 'bar',
    data: {
      labels: o.labels,
      datasets: o.series.map((s) => ({
        label: s.label,
        data: s.data,
        backgroundColor: s.colors ?? s.color,
        hoverBackgroundColor: hover(s, o.labels.length),
        borderRadius: o.stacked ? onlyLast(false) : topRounded,
        borderSkipped: 'bottom',
        borderWidth: multi ? 1 : 0,
        borderColor: CHROME.surface,
        maxBarThickness: Math.min(o.thickness ?? 24, 24),
      })),
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6 } },
      plugins: {
        legend: { display: multi },
        tooltip: {
          callbacks: {
            title: (items) =>
              items.length
                ? (o.title?.(items[0].dataIndex) ?? [o.labels[items[0].dataIndex]].flat().join(' '))
                : '',
            label: (c) => fmt(c.parsed.y ?? 0),
            footer: (items) => (items.length ? (o.footer?.(items[0].dataIndex) ?? []) : []),
          },
        },
        refLine: o.reference ?? false,
      },
      scales: {
        x: {
          stacked: o.stacked,
          grid: { display: false },
          border: { color: CHROME.axis },
          ticks: {
            color: INK.muted,
            maxRotation: 0,
            autoSkip: !o.allLabels,
            autoSkipPadding: 6,
          },
        },
        y: {
          stacked: o.stacked,
          beginAtZero: true,
          suggestedMax: o.min,
          border: { display: false },
          grid: { color: CHROME.grid, tickLength: 0 },
          ticks: {
            color: INK.muted,
            maxTicksLimit: 5,
            padding: 8,
            // Hela tal på skalan även när allt är noll (annars 0, 0,5 och 1 som "1, 1, 0").
            precision: 0,
            callback: (v) => tick(Number(v)),
          },
        },
      },
    },
    plugins: [refLine],
  };
}

/**
 * Liggande staplar för rangordning: kategorinamn till vänster, värdet vid stapelns ände
 * (så behövs ingen värdeaxel). Ett värde per stapel, så etiketten på varje är läsbar.
 */
export function bars(o: BarOptions): ChartConfiguration<'bar'> {
  const fmt = o.format ?? fmtInt;
  const multi = o.series.length > 1;
  const max = o.maxLabel ?? 26;
  const totals = o.labels.map((_, i) => o.series.reduce((t, s) => t + (s.data[i] || 0), 0));
  return {
    type: 'bar',
    data: {
      labels: o.labels,
      datasets: o.series.map((s) => ({
        label: s.label,
        data: s.data,
        backgroundColor: s.colors ?? s.color,
        hoverBackgroundColor: hover(s, o.labels.length),
        borderRadius: o.stacked ? onlyLast(true) : endRounded,
        borderSkipped: 'start',
        borderWidth: multi ? 1 : 0,
        borderColor: CHROME.surface,
        maxBarThickness: Math.min(o.thickness ?? 18, 24),
      })),
    },
    options: {
      indexAxis: 'y',
      interaction: { mode: 'index', axis: 'y', intersect: false },
      layout: { padding: { right: 56 } },
      plugins: {
        legend: { display: multi },
        tooltip: {
          callbacks: {
            title: (items) =>
              items.length ? (o.title?.(items[0].dataIndex) ?? o.labels[items[0].dataIndex]) : '',
            label: (c) => fmt(c.parsed.x ?? 0),
            footer: (items) => (items.length ? (o.footer?.(items[0].dataIndex) ?? []) : []),
          },
        },
        tipLabels: { format: fmt, totals },
      },
      scales: {
        x: { stacked: o.stacked, display: false, beginAtZero: true },
        y: {
          stacked: o.stacked,
          grid: { display: false },
          border: { color: CHROME.axis },
          ticks: {
            color: INK.secondary,
            autoSkip: false,
            callback(_v, i) {
              const l = o.labels[i] ?? '';
              return l.length > max ? `${l.slice(0, max - 1)}…` : l;
            },
          },
        },
      },
    },
    plugins: [tipLabels],
  };
}

export interface LineOptions {
  labels: string[];
  label: string;
  data: number[];
  color?: string;
  format?: (v: number) => string;
  tick?: (v: number) => string;
  /** Mjuk yta under linjen. Bara när axeln börjar på noll. */
  fill?: boolean;
}

/**
 * Linje för en serie över tid: 2 px, en markör (8 px med 2 px ytring) i sista punkten och
 * ett lodrätt hårstreck som följer markören.
 */
export function line(o: LineOptions): ChartConfiguration<'line'> {
  const color = o.color ?? ACCENT;
  const fmt = o.format ?? fmtInt;
  const tick = o.tick ?? tickInt;
  const last = o.data.length - 1;
  return {
    type: 'line',
    data: {
      labels: o.labels,
      datasets: [
        {
          label: o.label,
          data: o.data,
          borderColor: color,
          borderWidth: 2,
          borderJoinStyle: 'round',
          borderCapStyle: 'round',
          backgroundColor: `${color}1a`,
          fill: o.fill ? 'origin' : false,
          tension: 0.2,
          pointRadius: (c) => (c.dataIndex === last ? 4 : 0),
          pointHoverRadius: 4,
          pointBackgroundColor: color,
          pointBorderColor: CHROME.surface,
          pointBorderWidth: 2,
          pointHitRadius: 24,
        },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6, right: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => fmt(c.parsed.y ?? 0) } },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: CHROME.axis },
          ticks: { color: INK.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
        },
        y: {
          beginAtZero: !!o.fill,
          grace: '12%',
          border: { display: false },
          grid: { color: CHROME.grid, tickLength: 0 },
          ticks: {
            color: INK.muted,
            maxTicksLimit: 5,
            padding: 8,
            callback: (v) => tick(Number(v)),
          },
        },
      },
    },
    plugins: [crosshair],
  };
}
