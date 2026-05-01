import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { getApiBaseUrl } from '../utils/api-base-url';
import {
  DashboardPayload,
  HistoryReading,
  DashboardReading,
  DashboardAlert,
  DashboardDeviceSummary,
  DashboardSummary,
  ReadingsResponse
} from '../types';

// Re-export types for components that import from this service
export type {
  DashboardPayload,
  HistoryReading,
  DashboardReading,
  DashboardAlert,
  DashboardDeviceSummary,
  DashboardSummary,
  ReadingsResponse
};

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  snapshot() {
    return this.api.get<DashboardPayload>('/api/public/dashboard');
  }

  startPolling(intervalMs = 3000): Observable<DashboardPayload> {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    return new Observable<DashboardPayload>((subscriber) => {
      const pollOnce = async () => {
        try {
          const payload = await firstValueFrom(this.snapshot());
          subscriber.next(payload);
        } catch (error) {
          subscriber.error(error);
        }
      };

      // Ejecutar inmediatamente
      void pollOnce();

      // Luego cada intervalMs
      this.pollingTimer = setInterval(() => {
        void pollOnce();
      }, intervalMs);

      return () => {
        if (this.pollingTimer) {
          clearInterval(this.pollingTimer);
          this.pollingTimer = null;
        }
      };
    });
  }

  stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  readings(params: {
    from?: string;
    until?: string;
    limit?: number;
    deviceId?: number | null;
    houseId?: number | null;
  }) {
    return this.api.get<{ ok: boolean; readings: HistoryReading[] }>('/api/readings', params);
  }

  liveStream(): Observable<DashboardPayload> {
    return new Observable<DashboardPayload>((subscriber) => {
      const token = this.auth.getToken();
      if (!token) {
        subscriber.error(new Error('No hay token de sesión para abrir el stream'));
        return;
      }

      const eventSource = this.createEventSource(token);

      const handleDashboardMessage = (event: Event) => {
        try {
          const data = JSON.parse((event as MessageEvent<string>).data) as DashboardPayload;
          subscriber.next(data);
        } catch (error) {
          subscriber.error(new Error(`Failed to parse dashboard event: ${error}`));
        }
      };

      const handleError = () => {
        subscriber.error(new Error('Se perdio el stream del dashboard'));
        cleanup();
      };

      const cleanup = () => {
        // ✅ IMPORTANTE: Remover listeners antes de cerrar
        eventSource.removeEventListener('dashboard', handleDashboardMessage);
        eventSource.removeEventListener('error', handleError);
        eventSource.close();
      };

      eventSource.addEventListener('dashboard', handleDashboardMessage);
      eventSource.addEventListener('error', handleError);

      // ✅ Retornar función cleanup completa
      return cleanup;
    });
  }

  private createEventSource(token: string): EventSource {
    const apiBaseUrl = getApiBaseUrl();

    const streamUrl = new URL(
      `${apiBaseUrl.replace(/\/+$/, '')}/api/public/dashboard/stream`,
      window.location.origin
    );
    streamUrl.searchParams.set('token', token);

    return new EventSource(streamUrl.toString());
  }
}
