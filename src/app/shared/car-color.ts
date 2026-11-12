/**
 * Färgnamn från fordonsregistret till en färg att rita en prick med, på svenska och engelska (annonser
 * från Blocket anger ofta engelska namn, "Red" och "Grey"). Okänt namn: grå.
 */
const HEX: Record<string, string> = {
  svart: '#1f2328',
  vit: '#f4f4f2',
  grå: '#8b9096',
  grå_: '#8b9096',
  silver: '#c0c4c8',
  blå: '#2a5db0',
  röd: '#c0392b',
  grön: '#2e7d4f',
  gul: '#e8c53a',
  orange: '#e67e22',
  brun: '#7b5a3c',
  beige: '#d9c7a3',
  lila: '#7b4fa3',
  rosa: '#e58fb0',
  turkos: '#2aa7a0',
  guld: '#c9a227',
  black: '#1f2328',
  white: '#f4f4f2',
  grey: '#8b9096',
  gray: '#8b9096',
  blue: '#2a5db0',
  red: '#c0392b',
  green: '#2e7d4f',
  yellow: '#e8c53a',
  brown: '#7b5a3c',
  purple: '#7b4fa3',
  pink: '#e58fb0',
  turquoise: '#2aa7a0',
  gold: '#c9a227',
};

export function carColorHex(name: string | null | undefined): string {
  const first = (name ?? '')
    .toLowerCase()
    .split(/[\s/,-]+/)
    .find((w) => HEX[w]);
  return first ? HEX[first] : '#b8bcc2';
}
