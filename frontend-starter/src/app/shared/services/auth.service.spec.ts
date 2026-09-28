import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from './auth.service';
import { AuthResponse } from '../models/auth-response.model';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('login() doit envoyer une requête POST /api/auth/login avec email et mot de passe', () => {
    const mockResponse: AuthResponse = {
      token: 'jwt-mock-token-123',
      user: {
        id: 'user-id-456',
        name: 'Demo User',
        email: 'demo@example.com',
        createdAt: '2026-09-25T08:00:00.000Z',
      },
    };

    service.login('demo@example.com', 'Demo1234!').subscribe((res) => {
      expect(res).toEqual(mockResponse);
      expect(service.token()).toBe('jwt-mock-token-123');
      expect(service.currentUser()?.email).toBe('demo@example.com');
      // Sécurité : le token ne doit JAMAIS être écrit dans localStorage
      expect(localStorage.getItem('gpc_token')).toBeNull();
    });

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({
      email: 'demo@example.com',
      password: 'Demo1234!',
    });

    req.flush(mockResponse);
  });

  it('refresh() doit restaurer la session via cookie HTTP-Only et mettre à jour le Signal', () => {
    const mockResponse: AuthResponse = {
      token: 'jwt-refreshed-token',
      user: {
        id: 'user-id-456',
        name: 'Demo User',
        email: 'demo@example.com',
        createdAt: '2026-09-25T08:00:00.000Z',
      },
    };

    service.refresh().subscribe((res) => {
      expect(res).toEqual(mockResponse);
      expect(service.token()).toBe('jwt-refreshed-token');
      expect(service.currentUser()?.email).toBe('demo@example.com');
    });

    const req = httpMock.expectOne('/api/auth/refresh');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush(mockResponse);
  });

  it('logout() doit purger le Signal et demander la suppression du cookie', () => {
    service.token.set('token-to-clear');
    service.currentUser.set({
      id: '123',
      name: 'User',
      email: 'user@test.com',
      createdAt: '2026-01-01',
    });

    service.logout();

    expect(service.token()).toBeNull();
    expect(service.currentUser()).toBeNull();

    const req = httpMock.expectOne('/api/auth/logout');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ message: 'Déconnexion réussie' });
  });
});
