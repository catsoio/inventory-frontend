import {
  RIM_MATERIAL_LABELS,
  SEASON_LABELS,
  STORAGE_CONTENTS_LABELS,
  StorageDeposit,
} from '../core/models';
import { HAIR, INK, LINE, esc, printHtml } from './print-frame';

/** Etiketter per A4 (stående), under varandra. */
const PER_SHEET = 3;

const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '');

function label(d: StorageDeposit): string {
  const place = (d.location || '').split(' · ');
  const spot = place.length > 1 ? place[place.length - 1] : (d.location ?? '');
  const where = place.length > 1 ? place.slice(0, -1).join(' · ') : 'Plats';
  const t = d.tyres;
  const season = t ? SEASON_LABELS[t.season].toUpperCase() + (t.studded ? ' · DUBB' : '') : '';
  const what = [
    `${d.quantity} st ${STORAGE_CONTENTS_LABELS[d.contents].toLowerCase()}`,
    t ? [[t.brand, t.model].filter(Boolean).join(' '), t.sizeLabel].filter(Boolean).join(' ') : '',
    d.rims ? [d.rims.brand, RIM_MATERIAL_LABELS[d.rims.material]].filter(Boolean).join(' ') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const damaged = d.conditionGrade === 'damaged' || d.conditionGrade === 'worn';
  const grade = d.conditionGrade === 'damaged' ? 'SKADAT' : 'SLITET';
  const dates = [
    `Inlämnad ${dateOf(d.depositedAt)}`,
    d.expectedPickupAt ? `Hämtas ca ${dateOf(d.expectedPickupAt)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<div class="label">
  <div class="top"><span class="code">${esc(d.code)}</span>${season ? `<span class="season">${esc(season)}</span>` : ''}</div>
  <div class="mid">
    <div class="plate"><i>S</i><b>${esc(d.vehicle.regNo)}</b></div>
    <div class="who"><div class="name">${esc(d.customer.name)}</div><div class="phone">${esc(d.customer.phone || '')}</div></div>
  </div>
  <div class="what">${esc(what)}</div>
  <div class="spot"><small>${esc(where)}</small><b>${esc(spot || 'Ej angiven')}</b></div>
  <div class="foot"><span>${esc(dates)}</span>${
    damaged
      ? `<span class="warn">${esc(grade)}${d.condition ? ': ' + esc(d.condition) : ''}</span>`
      : ''
  }</div>
</div>`;
}

const CSS = `
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; font-family: Roboto, Arial, sans-serif; color: ${INK}; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { height: 281mm; display: grid; grid-template-rows: repeat(${PER_SHEET}, 1fr); break-after: page; }
  .sheet:last-child { break-after: auto; }
  .label { display: flex; flex-direction: column; justify-content: space-between; padding: 6mm 8mm; border-bottom: 0.3mm dashed ${LINE}; overflow: hidden; }
  .sheet .label:last-child { border-bottom: 0; }
  .top { display: flex; justify-content: space-between; align-items: center; }
  .code { font-size: 22pt; font-weight: 700; letter-spacing: 1px; }
  .season { font-size: 16pt; font-weight: 700; border: 0.6mm solid ${INK}; border-radius: 1.2mm; padding: 0.5mm 3mm; }
  .mid { display: flex; align-items: center; justify-content: space-between; gap: 8mm; }
  .plate { display: inline-flex; border: 0.8mm solid ${INK}; border-radius: 2mm; overflow: hidden; flex: none; }
  .plate i { background: ${INK}; color: #fff; font-style: normal; font-weight: 700; font-size: 14pt; width: 13mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 1.5mm; }
  .plate b { font-size: 44pt; letter-spacing: 3px; padding: 0 5mm; line-height: 1.15; }
  .who { text-align: right; min-width: 0; }
  .name { font-size: 20pt; font-weight: 700; line-height: 1.15; }
  .phone { font-size: 15pt; margin-top: 1mm; }
  .what { font-size: 15pt; line-height: 1.25; }
  .spot { border-top: 0.6mm solid ${INK}; padding-top: 2.5mm; display: flex; align-items: baseline; gap: 6mm; }
  .spot small { font-size: 12pt; text-transform: uppercase; letter-spacing: 1.5px; }
  .spot b { font-size: 46pt; line-height: 1; }
  .foot { font-size: 12pt; display: flex; justify-content: space-between; gap: 6mm; border-top: 0.2mm solid ${HAIR}; padding-top: 1.5mm; }
  .warn { font-weight: 700; border: 0.5mm solid ${INK}; border-radius: 1mm; padding: 0 2mm; }
`;

/** Skriver ut inlämningsetiketter på A4, tre under varandra på varje ark. */
export function printStorageLabels(deposits: StorageDeposit[]): void {
  if (!deposits.length) return;
  const sheets: string[] = [];
  for (let i = 0; i < deposits.length; i += PER_SHEET) {
    sheets.push(
      `<div class="sheet">${deposits
        .slice(i, i + PER_SHEET)
        .map(label)
        .join('')}</div>`,
    );
  }
  printHtml(
    `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Däckhotell</title><style>${CSS}</style></head><body>${sheets.join('')}</body></html>`,
  );
}
