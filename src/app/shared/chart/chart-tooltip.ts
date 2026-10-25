import type { Chart, TooltipModel } from 'chart.js';

/**
 * Diagrammens gemensamma tooltip, ritad som HTML ovanpå diagrammet. Värdet är det starka och
 * serienamnet det svaga (läsaren har redan serien och vill ha talet). Allt som kommer från
 * data skrivs med `textContent`, aldrig som HTML.
 *
 * Utseendet ligger i `styles.css` (`.chart-tip`), eftersom elementet skapas utanför Angular.
 */
export function htmlTooltip({ chart, tooltip }: { chart: Chart; tooltip: TooltipModel<any> }) {
  const host = chart.canvas.parentElement;
  if (!host) return;
  let el = host.querySelector<HTMLDivElement>(':scope > .chart-tip');
  if (!el) {
    el = document.createElement('div');
    el.className = 'chart-tip';
    el.setAttribute('role', 'status');
    host.appendChild(el);
  }
  if (tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
    el.style.opacity = '0';
    return;
  }

  const text = (tag: string, cls: string, value: string) => {
    const n = document.createElement(tag);
    n.className = cls;
    n.textContent = value;
    return n;
  };

  el.replaceChildren();
  const title = tooltip.title?.filter(Boolean).join(' ');
  if (title) el.appendChild(text('div', 't', title));

  const named = chart.data.datasets.length > 1;
  tooltip.dataPoints.forEach((p, i) => {
    const value = tooltip.body[i]?.lines?.[0] ?? p.formattedValue;
    const row = document.createElement('div');
    row.className = 'r';
    const key = document.createElement('span');
    key.className = 'k';
    const c = tooltip.labelColors?.[i]?.backgroundColor;
    key.style.background = typeof c === 'string' ? c : '#94a3b8';
    row.appendChild(key);
    row.appendChild(text('span', 'v', value));
    if (named && p.dataset.label) row.appendChild(text('span', 'n', p.dataset.label));
    el.appendChild(row);
  });
  for (const line of tooltip.footer ?? []) el.appendChild(text('div', 'f', line));

  // Placera till höger om markören, eller till vänster när det inte ryms.
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = tooltip.caretX + 14;
  if (left + w > host.clientWidth) left = tooltip.caretX - w - 14;
  const top = Math.min(Math.max(tooltip.caretY - h / 2, 0), Math.max(host.clientHeight - h, 0));
  el.style.left = `${Math.max(left, 0)}px`;
  el.style.top = `${top}px`;
  el.style.opacity = '1';
}
