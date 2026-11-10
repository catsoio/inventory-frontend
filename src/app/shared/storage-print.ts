import {
  RIM_MATERIAL_LABELS,
  SEASON_LABELS,
  STORAGE_CONTENTS_LABELS,
  StorageDeposit,
} from '../core/models';
import { HAIR, INK, LINE, esc, printHtml } from './print-frame';

/** `a4` = tre etiketter under varandra på ett A4. `roll` = en etikett per sida för en rullskrivare. */
export type LabelFormat = 'a4' | 'roll';

/** Etiketter per A4 (stående), under varandra. */
const PER_SHEET = 3;

/** Rulletikettens storlek i mm. Skrivarens drivrutin ska vara inställd på samma storlek. */
export const ROLL_MM = { width: 100, height: 50 };

const FORMAT_KEY = 'garagestock.labelFormat';

/** Etikettformatet som valts i den här webbläsaren. */
export function labelFormat(): LabelFormat {
  try {
    return localStorage.getItem(FORMAT_KEY) === 'roll' ? 'roll' : 'a4';
  } catch {
    return 'a4';
  }
}

export function setLabelFormat(f: LabelFormat): void {
  try {
    localStorage.setItem(FORMAT_KEY, f);
  } catch {
    // Valet gäller då bara tills sidan laddas om.
  }
}

const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '');

/** Adressen som QR-koden pekar på: setets kort i appen. Mobilkameran öppnar den. */
export const depositUrl = (origin: string, d: Pick<StorageDeposit, 'id'>) =>
  `${origin}/storage/${d.id}`;

function label(d: StorageDeposit, qr: string): string {
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
  <div class="spot"><div class="txt"><small>${esc(where)}</small><b>${esc(spot || 'Ej angiven')}</b></div>${qr ? `<div class="qr" role="img" aria-label="QR-kod till ${esc(d.code)}">${qr}</div>` : ''}</div>
  <div class="foot"><span>${esc(dates)}</span>${
    damaged
      ? `<span class="warn">${esc(grade)}${d.condition ? ': ' + esc(d.condition) : ''}</span>`
      : ''
  }</div>
</div>`;
}

const COMMON = `
  * { box-sizing: border-box; }
  html, body { margin: 0; font-family: Roboto, Arial, sans-serif; color: ${INK}; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .top { display: flex; justify-content: space-between; align-items: center; }
  .code { font-weight: 700; letter-spacing: 1px; }
  .season { font-weight: 700; border: 0.6mm solid ${INK}; border-radius: 1.2mm; }
  .mid { display: flex; align-items: center; justify-content: space-between; }
  .plate { display: inline-flex; border: 0.8mm solid ${INK}; overflow: hidden; flex: none; }
  .plate i { background: ${INK}; color: #fff; font-style: normal; font-weight: 700; display: flex; align-items: flex-end; justify-content: center; }
  .plate b { line-height: 1.15; }
  .who { text-align: right; min-width: 0; }
  .name { font-weight: 700; line-height: 1.15; }
  .what { line-height: 1.25; }
  .spot { border-top: 0.6mm solid ${INK}; display: flex; align-items: center; justify-content: space-between; }
  .spot .txt { display: flex; align-items: baseline; min-width: 0; }
  .spot small { text-transform: uppercase; letter-spacing: 1.5px; }
  .spot b { line-height: 1; }
  .qr { flex: none; }
  .qr svg { display: block; width: 100%; height: 100%; }
  .foot { display: flex; justify-content: space-between; border-top: 0.2mm solid ${HAIR}; }
  .warn { font-weight: 700; border: 0.5mm solid ${INK}; border-radius: 1mm; padding: 0 2mm; }
`;

const CSS_A4 = `${COMMON}
  @page { size: A4 portrait; margin: 8mm; }
  .sheet { height: 281mm; display: grid; grid-template-rows: repeat(${PER_SHEET}, 1fr); break-after: page; }
  .sheet:last-child { break-after: auto; }
  .label { padding: 6mm 8mm; border-bottom: 0.3mm dashed ${LINE}; }
  .sheet .label:last-child { border-bottom: 0; }
  .code { font-size: 22pt; }
  .season { font-size: 16pt; padding: 0.5mm 3mm; }
  .mid { gap: 8mm; }
  .plate { border-radius: 2mm; }
  .plate i { font-size: 14pt; width: 13mm; padding-bottom: 1.5mm; }
  .plate b { font-size: 44pt; letter-spacing: 3px; padding: 0 5mm; }
  .name { font-size: 20pt; }
  .phone { font-size: 15pt; margin-top: 1mm; }
  .what { font-size: 15pt; }
  .spot { padding-top: 2.5mm; gap: 6mm; }
  .spot .txt { gap: 6mm; }
  .spot small { font-size: 12pt; }
  .spot b { font-size: 46pt; }
  .qr { width: 24mm; height: 24mm; }
  .foot { font-size: 12pt; gap: 6mm; padding-top: 1.5mm; }
`;

const CSS_ROLL = `${COMMON}
  @page { size: ${ROLL_MM.width}mm ${ROLL_MM.height}mm; margin: 0; }
  .label { width: ${ROLL_MM.width}mm; height: ${ROLL_MM.height}mm; padding: 2.5mm 3.5mm; break-after: page; }
  .label:last-child { break-after: auto; }
  .code { font-size: 14pt; }
  .season { font-size: 9pt; padding: 0.2mm 1.5mm; }
  .mid { gap: 3mm; }
  .plate { border-radius: 1.2mm; border-width: 0.5mm; }
  .plate i { font-size: 7pt; width: 6mm; padding-bottom: 0.8mm; }
  .plate b { font-size: 20pt; letter-spacing: 1px; padding: 0 2.5mm; }
  .name { font-size: 10pt; }
  .phone { font-size: 8pt; }
  .what { font-size: 8pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .spot { padding-top: 1mm; gap: 3mm; }
  .spot .txt { gap: 2mm; }
  .spot small { font-size: 6.5pt; }
  .spot b { font-size: 22pt; }
  .qr { width: 15mm; height: 15mm; }
  .foot { font-size: 6.5pt; gap: 3mm; padding-top: 0.8mm; }
  .warn { padding: 0 1mm; }
`;

/** Hela dokumentet för en uppsättning etiketter. `qrFor` ger QR-kodens SVG för ett set. */
export function storageLabelsHtml(
  deposits: StorageDeposit[],
  format: LabelFormat,
  qrFor: (d: StorageDeposit) => string,
): string {
  const labels = deposits.map((d) => label(d, qrFor(d)));
  let body: string;
  if (format === 'roll') {
    body = labels.join('');
  } else {
    const sheets: string[] = [];
    for (let i = 0; i < labels.length; i += PER_SHEET) {
      sheets.push(`<div class="sheet">${labels.slice(i, i + PER_SHEET).join('')}</div>`);
    }
    body = sheets.join('');
  }
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Däckhotell</title><style>${
    format === 'roll' ? CSS_ROLL : CSS_A4
  }</style></head><body>${body}</body></html>`;
}

/**
 * Skriver ut inlämningsetiketter, tre per A4 eller en per sida för rullskrivare. Varje etikett har
 * en QR-kod som öppnar setets kort; biblioteket laddas först när något ska skrivas ut.
 */
export async function printStorageLabels(
  deposits: StorageDeposit[],
  format: LabelFormat = labelFormat(),
): Promise<void> {
  if (!deposits.length) return;
  const mod = await import('qrcode');
  const toString = (mod as unknown as { default?: typeof mod }).default?.toString ?? mod.toString;
  const codes = new Map<string, string>();
  for (const d of deposits) {
    codes.set(
      d.id,
      await toString(depositUrl(location.origin, d), {
        type: 'svg',
        margin: 0,
        errorCorrectionLevel: 'M',
        color: { dark: INK, light: '#ffffff' },
      }),
    );
  }
  printHtml(storageLabelsHtml(deposits, format, (d) => codes.get(d.id) ?? ''));
}
