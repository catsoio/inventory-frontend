import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs';

// Packar upp { success, data, meta } så att tjänster får data direkt (listor som Page).
export const envelopeInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    map((event: HttpEvent<any>) => {
      if (
        !(event instanceof HttpResponse) ||
        !event.body ||
        typeof event.body !== 'object' ||
        !('success' in event.body)
      ) {
        return event;
      }
      const { data, meta } = event.body;
      return event.clone({
        body: meta?.pagination ? { items: data, pagination: meta.pagination } : data,
      });
    }),
  );
