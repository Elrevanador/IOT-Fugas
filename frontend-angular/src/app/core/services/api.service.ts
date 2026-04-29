import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';

import { getApiBaseUrl } from '../utils/api-base-url';

const DEFAULT_TIMEOUT_MS = 30000;

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);

  private get apiBaseUrl(): string {
    return getApiBaseUrl();
  }

  private toUrl(path: string) {
    return `${this.apiBaseUrl}${path}`;
  }

  private withTimeout<T>(observable: Observable<T>): Observable<T> {
    return observable.pipe(timeout(DEFAULT_TIMEOUT_MS));
  }

  get<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Observable<T> {
    return this.withTimeout(this.http.get<T>(this.toUrl(path), { params: this.buildParams(params) }));
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.withTimeout(this.http.post<T>(this.toUrl(path), body));
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.withTimeout(this.http.put<T>(this.toUrl(path), body));
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.withTimeout(this.http.patch<T>(this.toUrl(path), body));
  }

  delete<T>(path: string): Observable<T> {
    return this.withTimeout(this.http.delete<T>(this.toUrl(path)));
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
