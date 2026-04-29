import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { LoadingService } from '../services/loading.service';
import { ToastService } from '../services/toast.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const loading = inject(LoadingService);
  const toast = inject(ToastService);
  const token = auth.getToken();

  loading.begin();

  const nextReq = token
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      })
    : req;

  return next(nextReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        toast.warning('Tu sesion expiro. Inicia sesion de nuevo para continuar.');
        void auth.logout();
      }
      return throwError(() => error);
    }),
    finalize(() => loading.end())
  );
};
