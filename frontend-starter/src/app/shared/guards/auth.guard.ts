import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Protects routes that require a token issued by the API.
 * Si le token n'est pas encore en mémoire (ex: après un F5), interroge le cookie HTTP-Only
 * via refresh() pour restaurer la session avant de décider d'autoriser ou de rediriger vers /login.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // 1. Si le token est déjà présent en mémoire dans le Signal, autoriser immédiatement
  if (auth.token()) {
    return true;
  }

  // 2. Si le token est absent (cas du F5), tenter de restaurer la session via le cookie HTTP-Only
  return auth.refresh().pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};
