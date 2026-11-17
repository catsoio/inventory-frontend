/**
 * Registreringsnummer ur text som en kamera läst. Svenska skyltar är tre bokstäver och sedan tre
 * siffror (ABC123) eller två siffror och en bokstav (ABC12D, sedan 2019). Bokstäverna I, Q, V, Å, Ä
 * och Ö används inte. Vi vet alltså vilken sorts tecken som ska stå var, och rättar de vanliga
 * felläsningarna efter plats (0 för O, 8 för B och så vidare).
 */

/** Bokstäver som får finnas på en skylt. */
const LETTERS = 'ABCDEFGHJKLMNOPRSTUWXYZ';

/** Vad OCR brukar läsa fel, per vad platsen ska vara. */
const TO_LETTER: Record<string, string> = { '0': 'O', '8': 'B', '5': 'S', '2': 'Z' };
const TO_DIGIT: Record<string, string> = { O: '0', D: '0', Q: '0', I: '1', B: '8', S: '5', Z: '2' };

const isLetter = (c: string) => LETTERS.includes(c);
const isDigit = (c: string) => c >= '0' && c <= '9';

/**
 * Det som ligger framför numret på en rad: ingenting, eller den blå EU-remsan med S som OCR kan läsa
 * som S eller 5.
 */
const BAND = ['', 'S', '5'];

/** Ett nummer ur en rad text, eller null. Raden ska vara skylten och inget annat. */
export function plateOf(line: string): string | null {
  const compact = line.toUpperCase().replace(/[^A-Z0-9ÅÄÖ]/g, '');
  if (compact.length < 6 || compact.length > 7) return null;
  const band = compact.slice(0, compact.length - 6);
  if (!BAND.includes(band)) return null;
  const c = [...compact.slice(compact.length - 6)];
  for (let i = 0; i < 3; i++) {
    c[i] = isLetter(c[i]) ? c[i] : (TO_LETTER[c[i]] ?? c[i]);
    if (!isLetter(c[i])) return null;
  }
  for (let i = 3; i < 5; i++) {
    c[i] = isDigit(c[i]) ? c[i] : (TO_DIGIT[c[i]] ?? c[i]);
    if (!isDigit(c[i])) return null;
  }
  // Sista tecknet är en siffra (gamla skyltar) eller en bokstav (nya): det som lästs gäller, och en
  // bokstav som inte finns på skyltar (I, Q) var troligen en siffra.
  if (!isDigit(c[5]) && !isLetter(c[5])) {
    const digit = TO_DIGIT[c[5]];
    if (!digit) return null;
    c[5] = digit;
  }
  return c.join('');
}

/** Alla nummer i en bildrutas textrader. */
export function platesIn(lines: string[]): string[] {
  const out = new Set<string>();
  for (const line of lines) {
    const plate = plateOf(line);
    if (plate) out.add(plate);
  }
  return [...out];
}

/**
 * Ett nummer räknas först när samma nummer setts i flera bildrutor i rad, så att en enstaka
 * felläsning inte öppnar fel bil. En bildruta utan nummer nollställer.
 */
export class PlateTracker {
  private seen = '';
  private count = 0;

  constructor(private readonly needed = 2) {}

  /** Matar in en bildruta. Ger numret när det är bekräftat, annars null. */
  push(plates: string[]): string | null {
    if (!plates.length) {
      this.seen = '';
      this.count = 0;
      return null;
    }
    // Flera nummer i bilden (en parkering): det som setts förut vinner, annars det första.
    const plate = plates.includes(this.seen) ? this.seen : plates[0];
    this.count = plate === this.seen ? this.count + 1 : 1;
    this.seen = plate;
    if (this.count < this.needed) return null;
    this.seen = '';
    this.count = 0;
    return plate;
  }
}
