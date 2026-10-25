/**
 * Diagramfärger och ytor. Kategorier (identitet) följer den validerade paletten i fast ordning:
 * blå, orange, aqua. Kontrollerna är körda mot en vit yta (alla par, normalt seende och
 * färgblindhet); aqua ligger under 3:1 mot vitt, så varje diagram med aqua har förklaring,
 * direktetiketter eller tabellvy som avlastning.
 *
 * Enskilda serier och betoning använder varumärkets teal (`ACCENT`), övrigt sammanhang är grått.
 * Statusfärgerna är reserverade för något som faktiskt är bra eller dåligt (försenat, slut) och
 * följs alltid av ikon och text.
 */

/** Text: samma tre nivåer som resten av appen. */
export const INK = {
  primary: '#1e293b',
  secondary: '#52606d',
  muted: '#697586',
};

/** Diagrammets möbler: hårfina, tysta linjer. */
export const CHROME = {
  surface: '#ffffff',
  grid: '#eceff3',
  axis: '#cbd5e1',
};

/** Kategorier, fast ordning (slot 1–3 i paletten). */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'] as const;

/** Säsonger har alltid samma färg: vinter blå, sommar orange, helår aqua. */
export const SEASON = {
  winter: SERIES[0],
  summer: SERIES[1],
  all_season: SERIES[2],
} as const;

/** Varumärkets teal för det som är poängen i ett diagram med en serie. */
export const ACCENT = '#0b8f8f';
/** Sammanhang när en annan serie är poängen. */
export const CONTEXT = '#cbd5e1';
/** "Övriga" när svansen vikts ihop. */
export const OTHER = '#94a3b8';

/** Reserverade statusfärger (aldrig som "serie 4"). */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

/** Sekventiell ramp i varumärkets hue, ljus till mörk (varje steg ungefär 0,08 i OKLCH-ljushet). */
export const TEAL = {
  100: '#e0f7f7',
  200: '#c1edec',
  300: '#97dddc',
  400: '#68c6c6',
  500: '#39abab',
  600: '#0b8f8f',
  700: '#067272',
  800: '#025959',
  900: '#004141',
} as const;

/** Sekventiell skala för värmekartor: 0 = nära noll (ytan), 1 = högsta värdet. */
export const HEAT = [TEAL[100], TEAL[200], TEAL[300], TEAL[400], TEAL[500], TEAL[600], TEAL[700]];

/** Blandar en färg mot vitt (0 = oförändrad, 1 = vit). Används för hover och ljusare steg. */
export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Värde 0..1 till ett steg i värmeskalan. */
export function heat(t: number): string {
  const i = Math.min(HEAT.length - 1, Math.max(0, Math.round(t * (HEAT.length - 1))));
  return HEAT[i];
}
