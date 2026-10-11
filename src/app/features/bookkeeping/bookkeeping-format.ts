import { ClosingBlocked, ClosingWarning } from '../../core/models';
import { KrPipe } from '../../shared/kr-pipe';

const TZ = 'Europe/Stockholm';
const kr = new KrPipe();

export const dayText = (iso: string): string =>
  new Date(iso).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TZ,
  });

export const dateTimeText = (iso: string): string =>
  new Date(iso).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });

/** YYYY-MM-DD i Stockholm, för <input type="date">. */
export const dayInput = (iso: string | Date): string =>
  new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ });

/** Slutpunkten är exklusiv, så visa sista dagen som faktiskt ingår. */
export const periodLabel = (from: string, to: string): string => {
  const last = new Date(new Date(to).getTime() - 1).toISOString();
  const a = dayText(from);
  const b = dayText(last);
  return a === b ? a : `${a} – ${b}`;
};

export const daysIn = (from: string, to: string): number =>
  Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 864e5));

export const BLOCKED_TEXT: Record<ClosingBlocked, string> = {
  INVALID_PERIOD: 'Slutdatumet måste ligga efter periodens start.',
  STARTS_AFTER_FIRST_EVENT:
    'Första bokföringen måste börja vid första händelsen eller tidigare, så att ingen historik lämnas obokförd.',
  NOTHING_TO_CLOSE:
    'Det finns inget att bokföra i perioden: inget lager, inga händelser och inga betalningar.',
};

export function warningText(w: ClosingWarning): string {
  const p = w.params ?? {};
  switch (w.code) {
    case 'LONG_PERIOD':
      return `Perioden är ${p['days']} dagar, längre än ett år. Kontrollera att datumen stämmer.`;
    case 'PERIOD_ENDS_NOW':
      return 'Perioden slutar nu. Inköp och försäljningar som görs härefter hamnar i nästa period.';
    case 'END_CAPPED_TO_NOW':
      return 'Slutdatumet låg i framtiden och har kortats till nu.';
    case 'STOCK_NOT_IN_LEDGER':
      return `${p['articles']} artiklar har ett lagersaldo som loggen inte förklarar (ändrat utan lagerhändelse). Saldot på hyllan bokförs och avvikelsen visas på artikelraden och som omvärdering.`;
    case 'NEGATIVE_STOCK':
      return `${p['articles']} artiklar har negativt saldo vid periodens slut. Kontrollera dem innan du bokför.`;
    case 'UNPAID_FEES':
      return `${p['sets']} inlämningar (${kr.transform(p['amount'])}) är obetalda vid periodens slut. De räknas som intäkt när de betalas, i en senare period.`;
    case 'STORED_SETS':
      return `${p['sets']} set ligger fortfarande inlagrade. De påverkar inte siffrorna men listas i sammanfattningen.`;
    case 'EMPTY_PERIOD':
      return 'Inget hände i perioden.';
  }
}
