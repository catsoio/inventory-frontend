import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
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

/** Bokföring: garagets ägare och superadmin. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  return auth.isAdmin() || auth.isSuperAdmin() || inject(Router).createUrlTree(['/dashboard']);
};

/** Mekanikern kommer bara åt arbetsorder; allt annat leder till hens egen lista. */
export const mechanicGuard: CanActivateChildFn = (_route, state) => {
  const auth = inject(Auth);
  if (!auth.isMechanic() || state.url.startsWith('/workorders')) return true;
  return inject(Router).createUrlTree(['/workorders/mine']);
};
