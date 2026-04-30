import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureSessionLoaded();

  if (auth.isAuthenticated() && auth.hasFrontendAccess('/admin')) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
