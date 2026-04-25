import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);

  private get apiBaseUrl(): string {
    const runtime = (window as Window & { __APP_CONFIG__?: { apiBaseUrl?: string } }).__APP_CONFIG__;
    if (runtime?.apiBaseUrl) {
      return runtime.apiBaseUrl.replace(/\/+$/, '');
    }

    const isLocalhost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    return isLocalhost ? 'http://localhost:3000' : '';
  }

  private toUrl(path: string) {
    return `${this.apiBaseUrl}${path}`;
  }

  get<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Observable<T> {
    return this.http.get<T>(this.toUrl(path), { params: this.buildParams(params) });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.toUrl(path), body);
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.toUrl(path), body);
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.toUrl(path), body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.toUrl(path));
  }

  private buildParams(params?: Record<string, string | number | boolean | null | undefined>) {
    let httpParams = new HttpParams();
    if (!params) return httpParams;

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      httpParams = httpParams.set(key, String(value));
    }

    return httpParams;
  }
}
