import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { AuthResponse } from '../models/auth-response.model';
import { User } from '../models/user.model';

/** Handles authentication and the current user's profile.
 * Le jeton JWT est stocké STRICTEMENT en mémoire applicative (Signal Angular) pour se prémunir des attaques XSS.
 * La persistance entre rafraîchissements (F5) est assurée de manière sécurisée par un cookie HTTP-Only géré par le backend.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<User | null>(null);
  /** Jeton d'accès stocké exclusivement en mémoire vive dans un Signal Angular */
  readonly token = signal<string | null>(null);

  login(email: string, password: string) {
    return this.http
      .post<AuthResponse>('/api/auth/login', { email, password }, { withCredentials: true })
      .pipe(tap((response) => this.storeAuthentication(response)));
  }

  register(name: string, email: string, password: string) {
    return this.http
      .post<AuthResponse>('/api/auth/register', { name, email, password }, { withCredentials: true })
      .pipe(tap((response) => this.storeAuthentication(response)));
  }

  /** Restaure le jeton d'accès en mémoire lors d'un rechargement de page via le cookie HTTP-Only */
  refresh() {
    return this.http
      .post<AuthResponse>('/api/auth/refresh', {}, { withCredentials: true })
      .pipe(tap((response) => this.storeAuthentication(response)));
  }

  profile() {
    return this.http
      .get<User>('/api/users/me')
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  update(name: string) {
    return this.http
      .put<User>('/api/users/me', { name })
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  logout(): void {
    // Purge de l'état mémoire dans les signaux Angular
    this.token.set(null);
    this.currentUser.set(null);
    // Demande au backend de supprimer le cookie de session HTTP-Only
    this.http.post('/api/auth/logout', {}, { withCredentials: true }).subscribe({
      error: () => {},
    });
  }

  private storeAuthentication(response: AuthResponse): void {
    this.token.set(response.token);
    this.currentUser.set(response.user);
  }
}
