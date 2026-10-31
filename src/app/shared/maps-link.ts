/** Länk som öppnar adressen i Google Maps (på mobil i kartappen), eller null om adress saknas. */
export function mapsUrl(
  a: { address?: string | null; postalCode?: string | null; city?: string | null } | null,
): string | null {
  const text = [a?.address, [a?.postalCode, a?.city].filter(Boolean).join(' ')]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(', ');
  return text ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(text) : null;
}
