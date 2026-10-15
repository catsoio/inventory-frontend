import { AbstractControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Anropas först i varje spara-metod. Är formuläret ogiltigt markeras alla fält så att felen syns,
 * och ett meddelande säger varför inget sparades. Spara-knappen ska alltså aldrig vara grå på
 * grund av ogiltiga fält: en grå knapp utan förklaring får användaren att tro att appen hänger sig.
 */
export function ensureValid(form: AbstractControl, snack: MatSnackBar, hint?: string): boolean {
  if (form.valid) return true;
  form.markAllAsTouched();
  snack.open(hint ?? 'Kontrollera de markerade fälten', undefined, { duration: 4000 });
  return false;
}
