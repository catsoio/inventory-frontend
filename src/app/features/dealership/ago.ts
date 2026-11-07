/** Hur länge sedan, på svenska: "idag", "igår", "3 dagar sedan". */
export function agoText(iso: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'idag' : days === 1 ? 'igår' : `${days} dagar sedan`;
}
