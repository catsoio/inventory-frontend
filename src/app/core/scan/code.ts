import type { ServiceType } from '../models';

/** Koder som skannern själv läser som något annat (våra etiketter): de kan aldrig bli en artikels kod. */
const OWN_LABEL = /^(?:(?:ART|DH|AO|SK|KF)-?\d+|HYLLA:.*|https?:.*)$/i;

/** Ser koden ut som en av våra egna etiketter (AO-…, DH-…, hyllans QR)? Då finns ingen artikel att koppla den till. */
export const isOwnLabel = (code: string) => OWN_LABEL.test(code.trim());

/** En streckkod av typen EAN (8–14 siffror); allt annat är en leverantörs eget nummer. */
export const isEan = (code: string) => /^\d{8,14}$/.test(code.trim());

/** Garagets egen åtgärd för däck- eller hjulbyte om det finns en, annars texten Däckbyte. */
export function tyreJobName(services: ServiceType[]): string {
  return (
    services.find((s) => s.active !== false && /d[äa]ckbyte|hjulbyte|d[äa]ck.*byte/i.test(s.name))
      ?.name ?? 'Däckbyte'
  );
}
