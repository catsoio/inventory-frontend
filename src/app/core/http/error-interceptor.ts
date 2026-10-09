import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';
import { ApiError } from '../models';

const MESSAGES: Record<string, string> = {
  INSUFFICIENT_STOCK: 'Det finns inte tillräckligt i lager.',
  DUPLICATE_SKU: 'Artikelnumret finns redan.',
  ARTICLE_HAS_STOCK: 'Artikeln kan inte arkiveras eftersom det finns lager kvar.',
  CONCURRENT_MODIFICATION: 'Någon annan har ändrat artikeln. Ladda om sidan och försök igen.',
  INVALID_QUANTITY: 'Ogiltigt antal. Ange ett heltal på minst 1.',
  INVALID_ARTICLE: 'Ogiltig artikel. Kontrollera uppgifterna.',
  INVALID_CREDENTIALS: 'Fel e-post/telefon eller lösenord.',
  NO_GARAGE: 'Skapa eller gå med i ett garage först.',
  INVALID_INVITE: 'Inbjudningskoden är ogiltig eller har gått ut.',
  ALREADY_IN_GARAGE: 'Du tillhör redan ett garage.',
  OWNER_CANNOT_LEAVE: 'Ägaren kan inte tas bort.',
  ACCOUNT_NOT_ACTIVE: 'Kontot är inte aktiverat. Verifiera med engångskod först.',
};

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snack = inject(MatSnackBar);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const e = err.error?.error;
      const code: string = e?.code ?? (err.status === 0 ? 'NETWORK' : 'UNKNOWN');
      const message =
        MESSAGES[code] ??
        (err.status === 0
          ? 'Kunde inte nå servern.'
          : err.status === 403
            ? 'Du saknar behörighet för detta.'
            : err.status === 404
              ? 'Hittades inte.'
              : err.status === 401
                ? 'Sessionen har gått ut.'
                : err.status === 400 && e?.message
                  ? `Ogiltiga uppgifter: ${e.message}`
                  : 'Något gick fel. Försök igen.');
      if (err.status !== 401 && code !== 'NO_GARAGE')
        snack.open(message, 'Stäng', { duration: 6000 });
      const apiError: ApiError = { code, message, status: err.status, details: e?.details };
      return throwError(() => apiError);
    }),
  );
};
