import type { Params } from '@angular/router';

/** Vad man kan göra åt en varning: gå dit felet rättas, eller göra ett val direkt på sidan. */
export interface CalloutFix {
  label: string;
  icon?: string;
  /** Adressen där det rättas (routerLink). */
  link?: string | unknown[];
  queryParams?: Params;
  /** Körs vid klick: ett val på sidan (utan `link`), eller t.ex. att stänga en dialog (med `link`). */
  click?: () => void;
}
