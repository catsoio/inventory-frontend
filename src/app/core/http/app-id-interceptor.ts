import { HttpInterceptorFn } from '@angular/common/http';

export const appIdInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ setHeaders: { 'X-App-Id': 'garagestock' } }));
