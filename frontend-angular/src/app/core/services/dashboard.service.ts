import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface DashboardReading {
  id: number;
  deviceId: number;
  deviceName: string | null;
  houseId: number | null;
  houseName: string | null;
  ts: string;
  flow_lmin: number;
  pressure_kpa: number;
  risk: number;
  state: string;
}

export interface DashboardAlert {
  id: number;
  deviceId: number;
  deviceName: string | null;
  houseId: number | null;
  houseName: string | null;
  ts: string;
  severity: string;
  message: string;
  acknowledged: boolean;
}

export interface DashboardPayload {
  ok: boolean;
  latestReading: DashboardReading | null;
  recentReadings: DashboardReading[];
  recentAlerts: DashboardAlert[];
  deviceOnline: boolean;
  lastSeenAt: string | null;
  currentState: string;
}

export interface HistoryReading {
  id: number;
  ts: string;
  flow_lmin: number;
  pressure_kpa: number;
  risk: number;
  state: string;
  Device?: {
    id: number;
    name: string;
    house_id: number | null;
    House?: {
      id: number;
      name: string;
      code: string;
    } | null;
  } | null;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  snapshot() {
    return this.api.get<DashboardPayload>('/api/public/dashboard');
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
        subscriber.error(new Error('No hay token de sesion para abrir el stream'));
        return;
      }

      const runtime = (window as Window & { __APP_CONFIG__?: { apiBaseUrl?: string } }).__APP_CONFIG__;
      const apiBaseUrl =
        runtime?.apiBaseUrl ||
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? 'http://localhost:3000'
          : '');

      const streamUrl = new URL(`${apiBaseUrl.replace(/\/+$/, '')}/api/public/dashboard/stream`, window.location.origin);
      streamUrl.searchParams.set('token', token);

      const source = new EventSource(streamUrl.toString());

      source.addEventListener('dashboard', (event) => {
        try {
          subscriber.next(JSON.parse((event as MessageEvent<string>).data));
        } catch (error) {
          subscriber.error(error);
        }
      });

      source.addEventListener('error', () => {
        subscriber.error(new Error('Se perdio el stream del dashboard'));
        source.close();
      });

      return () => source.close();
    });
  }
}
