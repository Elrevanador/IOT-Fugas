import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';

type UserRole = 'admin' | 'operator' | 'resident';

export interface AuthUser {
  id: number;
  nombre: string;
  email: string;
  role: UserRole;
  house: { id: number; name: string; code: string; status?: string } | null;
}

interface LoginResponse {
  ok: boolean;
  token: string;
}

interface MeResponse {
  ok: boolean;
  user: AuthUser;
}

interface RegisterResponse {
  ok: boolean;
  user: AuthUser;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tokenKey = 'token';
  private readonly bootstrapped = signal(false);
  private readonly tokenState = signal(localStorage.getItem(this.tokenKey));
  private sessionLoadPromise: Promise<void> | null = null;
  readonly currentUser = signal<AuthUser | null>(null);
  readonly isAuthenticated = computed(() => Boolean(this.tokenState() && this.currentUser()));

  async ensureSessionLoaded() {
    if (this.bootstrapped()) return;
    if (this.sessionLoadPromise) {
      await this.sessionLoadPromise;
      return;
    }

    this.sessionLoadPromise = this.loadSession();
    try {
      await this.sessionLoadPromise;
    } finally {
      this.sessionLoadPromise = null;
    }
  }

  private async loadSession() {
    try {
      if (!this.tokenState()) return;

      const response = await firstValueFrom(this.api.get<MeResponse>('/api/auth/me'));
      this.currentUser.set(response.user);
    } catch {
      this.clearToken();
    } finally {
      this.bootstrapped.set(true);
    }
  }

  async login(payload: { email: string; password: string }) {
    const response = await firstValueFrom(this.api.post<LoginResponse>('/api/auth/login', payload));
    this.setToken(response.token);
    await this.ensureFreshProfile();
    return response;
  }

  async register(payload: { nombre: string; email: string; password: string }) {
    return firstValueFrom(this.api.post<RegisterResponse>('/api/auth/register', payload));
  }

  async ensureFreshProfile() {
    const response = await firstValueFrom(this.api.get<MeResponse>('/api/auth/me'));
    this.currentUser.set(response.user);
    return response.user;
  }

  async logout() {
    this.clearToken();
  }

  getToken() {
    return this.tokenState();
  }

  private setToken(token: string) {
    localStorage.setItem(this.tokenKey, token);
    this.tokenState.set(token);
    this.bootstrapped.set(false);
  }

  private clearToken() {
    localStorage.removeItem(this.tokenKey);
    this.tokenState.set(null);
    this.currentUser.set(null);
  }
}
