/**
 * Språket för datum och månads- och dagnamn. Läser samma val som `I18n` (localStorage), så att det
 * går att använda i vanliga funktioner och i `LOCALE_ID` innan Angular har startat. Byts språk
 * laddas appen om, så att alla datumformat och kalendern följer med.
 */
export type AppLang = 'sv' | 'en';

export const LANG_KEY = 'garagestock.lang';

export function storedLang(): AppLang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'sv';
  } catch {
    return 'sv';
  }
}

/** `sv-SE` eller `en-GB` (måndag först och 24-timmarsklocka, som i Sverige). */
export const appLocale = (): string => (storedLang() === 'en' ? 'en-GB' : 'sv-SE');
