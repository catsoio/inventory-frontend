import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_URL } from '../api/inventory-api';
import { Auth } from '../auth/auth';

/** Superadmin som tittar i ett annat garage: backend agerar i det garaget. */
export const garageHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  const id = inject(Auth).actingGarageId();
  return id && req.url.startsWith(`${API_URL}/inventory`)
    ? next(req.clone({ setHeaders: { 'X-Garage-Id': id } }))
    : next(req);
};
