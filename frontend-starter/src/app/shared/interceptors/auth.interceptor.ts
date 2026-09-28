import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Adds the bearer token to protected API requests and handles 401 responses.
 * Transmet systématiquement les cookies de session (withCredentials: true) sur les routes /api.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const isApi = request.url.startsWith('/api');

  // Prépare les modifications à apporter à la requête
  const headers: Record<string, string> = {};
  if (token && isApi) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const req = request.clone({
    setHeaders: headers,
    withCredentials: isApi ? true : request.withCredentials,
  });

  return next(req).pipe(
    catchError((error: { status?: number }) => {
      // Déconnecter et rediriger vers /login uniquement si la 401 survient sur une ressource
      // protégée (ex: /api/tracks, /api/users/me), mais PAS sur les endpoints d'authentification
      // (/api/auth/login pour afficher les erreurs de formulaire, ou /api/auth/refresh géré par le guard)
      const isAuthEndpoint = request.url.includes('/api/auth/');
      if (error.status === 401 && !isAuthEndpoint) {
        auth.logout();
        void router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
