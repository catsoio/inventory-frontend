/** Färgnamn från fordonsregistret (svenska) till en färg att rita en prick med. Okänt namn: grå. */
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
};

export function carColorHex(name: string | null | undefined): string {
  const first = (name ?? '')
    .toLowerCase()
    .split(/[\s/,-]+/)
    .find((w) => HEX[w]);
  return first ? HEX[first] : '#b8bcc2';
}
