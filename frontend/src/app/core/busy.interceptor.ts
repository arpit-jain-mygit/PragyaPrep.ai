import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { BusyService } from './busy.service';

/** Tells BusyService when a request starts and when it ends (success, error or cancel). */
export const busyInterceptor: HttpInterceptorFn = (request, next) => {
  const busy = inject(BusyService);
  busy.begin();
  return next(request).pipe(finalize(() => busy.end()));
};
