import {
  RIM_MATERIAL_LABELS,
  SEASON_LABELS,
  STORAGE_CONTENTS_LABELS,
  StorageDeposit,
} from '../../core/models';

export const dateText = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('sv-SE') : '–';

/** YYYY-MM-DD för <input type="date">, i lokal tid. */
export const dateInput = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('sv-SE') : '';

/** Lokalt middagsläge undviker att datumet glider över en tidszonsgräns. */
export const dateIso = (ymd: string) => new Date(`${ymd}T12:00:00`).toISOString();

/** Däckbeskrivning: "Nokian Hakkapeliitta R5 205/55 R16 · Vinter (dubb)". */
export function tyresText(d: StorageDeposit): string {
  const t = d.tyres;
  if (!t) return '';
  const name = [t.brand, t.model].filter(Boolean).join(' ');
  const season = SEASON_LABELS[t.season] + (t.studded ? ' (dubb)' : '');
  return [name, t.sizeLabel, season].filter(Boolean).join(' · ');
}

export function rimsText(d: StorageDeposit): string {
  const r = d.rims;
  if (!r) return '';
  return [r.brand, RIM_MATERIAL_LABELS[r.material], r.diameter ? `${r.diameter}"` : null]
    .filter(Boolean)
    .join(' · ');
}

/** Allt kunden lämnat in, på en rad. */
export function contentsText(d: StorageDeposit): string {
  const head = `${d.quantity} st ${STORAGE_CONTENTS_LABELS[d.contents].toLowerCase()}`;
  const parts = [d.tyres ? tyresText(d) : '', d.rims ? rimsText(d) : ''].filter(Boolean);
  return [head, ...parts].join(' — ');
}
