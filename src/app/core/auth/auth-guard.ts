import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { Auth } from './auth';

export const authGuard: CanActivateFn = () => {
  return inject(Auth).isLoggedIn() || inject(Router).createUrlTree(['/login']);
};

/** Every inventory page needs a garage; users without one go to onboarding. */
export const garageGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (auth.garage()) return true;
  return auth.loadGarage().pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/onboarding']))),
  );
};
