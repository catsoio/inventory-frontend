import { LOCATION_CODE_PREFIX } from '../core/api/stock-count-api';
import { Warehouse, WarehouseLocation } from '../core/models';
import { HAIR, INK, LINE, esc, printHtml } from './print-frame';
import { LabelFormat, ROLL_MM, labelFormat } from './storage-print';

/** Etiketter per A4 (stående): två bredvid varandra, fem rader. */
const PER_SHEET = 10;

/** Texten som QR-koden bär. Servern känner igen den som en hylla (`ScanService`). */
export const locationCode = (l: Pick<WarehouseLocation, 'id'>) => `${LOCATION_CODE_PREFIX}${l.id}`;

const COMMON = `
  * { box-sizing: border-box; }
  html, body { margin: 0; font-family: Roboto, Arial, sans-serif; color: ${INK}; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { display: flex; align-items: center; justify-content: space-between; overflow: hidden; }
  .txt { min-width: 0; }
  .txt small { display: block; text-transform: uppercase; letter-spacing: 1.5px; }
  .txt b { display: block; line-height: 1.05; overflow-wrap: anywhere; }
  .txt span { display: block; }
  .qr svg { display: block; width: 100%; height: 100%; }
`;

const CSS_A4 = `${COMMON}
  @page { size: A4 portrait; margin: 8mm; }
  .sheet { height: 281mm; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(5, 1fr); break-after: page; }
  .sheet:last-child { break-after: auto; }
  .label { padding: 5mm 7mm; gap: 5mm; border: 0.3mm dashed ${LINE}; }
  .txt small { font-size: 10pt; }
  .txt b { font-size: 30pt; margin-top: 2mm; }
  .txt span { font-size: 9pt; margin-top: 3mm; color: ${LINE}; }
  .qr { width: 36mm; height: 36mm; flex: none; }
`;

const CSS_ROLL = `${COMMON}
  @page { size: ${ROLL_MM.width}mm ${ROLL_MM.height}mm; margin: 0; }
  .label { width: ${ROLL_MM.width}mm; height: ${ROLL_MM.height}mm; padding: 3mm 5mm; gap: 4mm; break-after: page; }
  .label:last-child { break-after: auto; }
  .txt small { font-size: 8pt; }
  .txt b { font-size: 26pt; margin-top: 1mm; }
  .txt span { font-size: 7pt; margin-top: 2mm; border-top: 0.2mm solid ${HAIR}; padding-top: 1mm; }
  .qr { width: 36mm; height: 36mm; flex: none; }
`;

interface ShelfLabel {
  warehouse: string;
  name: string;
  qr: string;
}

const labelHtml = (l: ShelfLabel) => `<div class="label">
  <div class="txt"><small>${esc(l.warehouse)}</small><b>${esc(l.name)}</b><span>Skanna för att placera eller räkna</span></div>
  <div class="qr" role="img" aria-label="QR-kod till ${esc(l.name)}">${l.qr}</div>
</div>`;

/** Hela dokumentet för en uppsättning hylletiketter. */
export function shelfLabelsHtml(labels: ShelfLabel[], format: LabelFormat): string {
  const items = labels.map(labelHtml);
  let body: string;
  if (format === 'roll') {
    body = items.join('');
  } else {
    const sheets: string[] = [];
    for (let i = 0; i < items.length; i += PER_SHEET) {
      sheets.push(`<div class="sheet">${items.slice(i, i + PER_SHEET).join('')}</div>`);
    }
    body = sheets.join('');
  }
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Hylletiketter</title><style>${
    format === 'roll' ? CSS_ROLL : CSS_A4
  }</style></head><body>${body}</body></html>`;
}

/**
 * Skriver ut en etikett per hylla med en QR-kod som läsaren känner igen: den som placerar ett set,
 * eller räknar en hylla, skannar hyllan först. Samma format som däckhotellets etiketter (A4 eller
 * rulle), valt i webbläsaren.
 */
export async function printShelfLabels(
  warehouse: Pick<Warehouse, 'name'>,
  locations: WarehouseLocation[],
  format: LabelFormat = labelFormat(),
): Promise<void> {
  if (!locations.length) return;
  const mod = await import('qrcode');
  const toString = (mod as unknown as { default?: typeof mod }).default?.toString ?? mod.toString;
  const labels: ShelfLabel[] = [];
  for (const l of locations) {
    labels.push({
      warehouse: warehouse.name,
      name: l.name,
      qr: await toString(locationCode(l), {
        type: 'svg',
        margin: 0,
        errorCorrectionLevel: 'M',
        color: { dark: INK, light: '#ffffff' },
      }),
    });
  }
  printHtml(shelfLabelsHtml(labels, format));
}
