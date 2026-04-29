import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { AuthUser, LoginPayload, LoginResponse, MeResponse, RegisterPayload, RegisterResponse } from '../types';

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
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');

  /**
   * Garantiza que la sesión esté cargada.
   * Múltiples llamadas concurrentes esperarán la misma promesa.
   * Una vez completado, retorna inmediatamente.
   */
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

      if (!response.user) {
        throw new Error('Invalid user response from API');
      }

      this.currentUser.set(response.user);
    } catch (error) {
      console.error('[AuthService] Failed to load session:', error);
      this.clearToken();
    } finally {
      this.bootstrapped.set(true);
    }
  }

  async login(payload: LoginPayload) {
    try {
      const response = await firstValueFrom(this.api.post<LoginResponse>('/api/auth/login', payload));
      this.setToken(response.token);
      await this.ensureFreshProfile();
      return response;
    } catch (error) {
      console.error('[AuthService] Login failed:', error);
      throw error;
    }
  }

  async register(payload: RegisterPayload) {
    try {
      return await firstValueFrom(this.api.post<RegisterResponse>('/api/auth/register', payload));
    } catch (error) {
      console.error('[AuthService] Register failed:', error);
      throw error;
    }
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
