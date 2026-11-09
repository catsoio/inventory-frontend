import { Article, SEASON_LABELS } from '../core/models';
import { KrPipe } from './kr-pipe';
import { HAIR, INK, LINE, esc, printHtml } from './print-frame';

/** Etiketter = små lappar att klippa ut, Lista = en tät tabell. Båda fyller A4 så mycket det går. */
export type TyrePrintLayout = 'labels' | 'list';

/** Etiketter per ark: 2 kolumner × 6 rader (ca 97 × 47 mm). */
const LABEL_COLS = 2;
const LABEL_ROWS = 6;

const kr = new KrPipe();

function season(a: Article): string {
  const t = a.tyre;
  return t ? SEASON_LABELS[t.season] + (t.studded ? ' dubb' : '') : '';
}

function label(a: Article): string {
  const t = a.tyre;
  const load = t ? `${t.loadIndex ?? ''}${t.speedIndex ?? ''}` : '';
  const name = [a.brand, a.model].filter(Boolean).join(' ');
  return `<div class="l">
  <div class="size">${esc(a.sizeLabel || a.label)}${load ? ` <small>${esc(load)}</small>` : ''}</div>
  <div class="name">${esc(name)}</div>
  <div class="row"><span class="tag">${esc(season(a))}</span><span class="code">${esc(a.code ?? '')}</span></div>
  <div class="row foot"><span class="loc">${esc(a.location || 'Ingen plats')}</span><b>${a.quantity} st</b></div>
</div>`;
}

const BASE_CSS = `
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; font-family: Roboto, Arial, sans-serif; color: ${INK}; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

const LABELS_CSS = `${BASE_CSS}
  .sheet { display: grid; grid-template-columns: repeat(${LABEL_COLS}, 1fr); grid-template-rows: repeat(${LABEL_ROWS}, 1fr); height: 281mm; break-after: page; }
  .sheet:last-child { break-after: auto; }
  .l { border: 0.3mm dashed ${LINE}; padding: 3.5mm 4.5mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; min-width: 0; }
  .size { font-size: 26pt; font-weight: 700; line-height: 1.05; white-space: nowrap; }
  .size small { font-size: 15pt; font-weight: 500; }
  .name { font-size: 14pt; line-height: 1.15; max-height: 2.3em; overflow: hidden; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm; }
  .tag { font-size: 13pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .code { font-size: 11pt; }
  .foot { border-top: 0.5mm solid ${INK}; padding-top: 1.5mm; }
  .loc { font-size: 15pt; font-weight: 700; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .foot b { font-size: 18pt; white-space: nowrap; }
`;

const LIST_CSS = `${BASE_CSS}
  table { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 0.4mm solid ${INK}; padding: 0.6mm 1.2mm; }
  td { border-bottom: 0.2mm solid ${HAIR}; padding: 0.55mm 1.2mm; white-space: nowrap; line-height: 1.2; }
  tr { break-inside: avoid; }
  .r { text-align: right; }
  .size { font-weight: 700; }
  .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2mm; font-size: 9pt; }
  .head b { font-size: 11pt; }
`;

function labelsHtml(list: Article[]): string {
  const per = LABEL_COLS * LABEL_ROWS;
  const sheets: string[] = [];
  for (let i = 0; i < list.length; i += per) {
    sheets.push(
      `<div class="sheet">${list
        .slice(i, i + per)
        .map(label)
        .join('')}</div>`,
    );
  }
  return `<style>${LABELS_CSS}</style>${sheets.join('')}`;
}

function listHtml(list: Article[]): string {
  const rows = list
    .map(
      (a) => `<tr>
<td>${esc(a.code ?? '')}</td>
<td class="size">${esc(a.sizeLabel ?? '')}</td>
<td>${esc(a.tyre ? `${a.tyre.loadIndex ?? ''}${a.tyre.speedIndex ?? ''}` : '')}</td>
<td>${esc([a.brand, a.model].filter(Boolean).join(' '))}</td>
<td>${esc(season(a))}</td>
<td>${esc(a.location || '')}</td>
<td class="r"><b>${a.quantity}</b></td>
<td class="r">${esc(kr.transform(a.sellPrice))}</td>
</tr>`,
    )
    .join('');
  const printed = new Date().toLocaleDateString('sv-SE');
  return `<style>${LIST_CSS}</style><div class="head"><b>Däck i lager</b><span>Utskrivet ${printed} · ${list.length} rader</span></div><table><thead><tr>
<th>Nr</th><th>Mått</th><th>Index</th><th>Märke och modell</th><th>Säsong</th><th>Plats</th><th class="r">Lager</th><th class="r">Pris inkl. moms</th>
</tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Skriver ut däck på A4 i ett eget dolt dokument (så att resten av sidan inte påverkar utskriften).
 * Artiklar som inte är däck hoppas över.
 */
export function printTyres(articles: Article[], layout: TyrePrintLayout = 'labels'): void {
  const tyres = articles.filter((a) => a.tyre);
  if (!tyres.length) return;
  const body = layout === 'labels' ? labelsHtml(tyres) : listHtml(tyres);
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Däck</title></head><body>${body}</body></html>`;

  printHtml(html);
}
