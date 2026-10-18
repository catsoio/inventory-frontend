import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Confirm } from '../shared/confirm';

/** Kort och sidor med formulär som kan ha osparade ändringar. */
export interface HasUnsaved {
  hasUnsaved(): boolean;
}

/** Frågar innan man lämnar ett kort med osparade ändringar. */
export const unsavedGuard: CanDeactivateFn<HasUnsaved> = (page) =>
  !page.hasUnsaved() ||
  inject(Confirm).ask({
    title: 'Lämna utan att spara?',
    message: 'Du har ändringar som inte är sparade. De försvinner om du lämnar sidan.',
    confirmText: 'Lämna sidan',
    danger: true,
  });
