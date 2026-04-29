import { environment } from '../../../environments/environment';

/**
 * Origen del API REST y del stream SSE.
 * Prioridad: `window.__APP_CONFIG__.apiBaseUrl` → `environment.apiBaseUrl` → fallback localhost.
 */
export function getApiBaseUrl(): string {
  const runtime = (window as Window & { __APP_CONFIG__?: { apiBaseUrl?: string } }).__APP_CONFIG__;
  if (runtime && typeof runtime.apiBaseUrl === 'string' && runtime.apiBaseUrl.trim() !== '') {
    return runtime.apiBaseUrl.replace(/\/+$/, '');
  }

  const envUrl = typeof environment.apiBaseUrl === 'string' ? environment.apiBaseUrl.trim() : '';
  if (envUrl !== '') {
    return envUrl.replace(/\/+$/, '');
  }

  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  return isLocalhost ? 'http://localhost:3000' : '';
}
