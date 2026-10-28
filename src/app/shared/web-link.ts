/** En länk som någon klistrat in: bara http(s), annars ingen länk alls (aldrig javascript:). */
export function safeUrl(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return /^https?:\/\/\S+$/i.test(t) ? t : null;
}

/** Skrivs "butik.se/produkt" utan https:// lägger vi till det. Tomt = ingen länk. */
export function normalizeUrl(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return safeUrl(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
}

/** Domännamnet, för en kort text på länken: "dackia.se". */
export function hostOf(v: string | null | undefined): string {
  const u = safeUrl(v);
  if (!u) return '';
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}
