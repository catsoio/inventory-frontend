import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';

export const authGuard: CanActivateFn = () => {
  return inject(Auth).isLoggedIn() || inject(Router).createUrlTree(['/login']);
};
