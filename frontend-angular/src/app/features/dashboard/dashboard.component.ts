import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { ToastService } from '../../core/services/toast.service';
import {
  DashboardDeviceSummary,
  DashboardPayload,
  DashboardReading,
  DashboardAlert,
  HistoryReading
} from '../../core/types';
import { TelemetryChartComponent } from '../../shared/components/telemetry-chart/telemetry-chart.component';
import { resolveErrorMessage } from '../../core/utils/error-message';

type TimeRange = '1h' | '6h' | '24h' | '7d';
type DashboardTab = 'overview' | 'readings' | 'alerts' | 'analytics';
type ReadingStateFilter = 'ALL' | 'NORMAL' | 'ALERTA' | 'FUGA' | 'ERROR';
type AlertFilter = 'ALL' | 'PENDING' | 'ACK' | 'ALERTA' | 'FUGA' | 'ERROR';
type DashboardDeviceView = {
  id: number;
  name: string | null;
  houseId: number | null;
  houseName: string | null;
  lastState: string;
  lastTs: string | null;
  latestReading: DashboardReading | null;
  isOnline: boolean;
  ipAddress: string | null;
  wifiSsid: string | null;
  internetConnected: boolean;
};
type RegisteredDevice = {
  id: number;
  name: string | null;
  house_id?: number | null;
  houseId?: number | null;
  status?: string | null;
  last_seen_at?: string | null;
  lastSeenAt?: string | null;
  ip_address?: string | null;
  ipAddress?: string | null;
  wifi_ssid?: string | null;
  wifiSsid?: string | null;
  internet_connected?: boolean;
  internetConnected?: boolean;
  House?: {
    id: number;
    name: string;
  } | null;
};
type DeviceCatalogResponse = {
  ok: boolean;
  devices: RegisteredDevice[];
};

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, DecimalPipe, DatePipe, TelemetryChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  @ViewChild('tabsScroller') private tabsScroller?: ElementRef<HTMLDivElement>;
  @ViewChild('deviceTabsScroller') private deviceTabsScroller?: ElementRef<HTMLDivElement>;
  private readonly dashboardTabKey = 'dashboard_active_tab';
  private readonly dashboardRangeKey = 'dashboard_range';
  private readonly dashboardReadingFilterKey = 'dashboard_reading_filter';
  private readonly dashboardAlertFilterKey = 'dashboard_alert_filter';
  private readonly dashboardDevicesCollapsedKey = 'dashboard_devices_ui_collapsed';
  private readonly api = inject(ApiService);
  private readonly dashboardService = inject(DashboardService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private reconnectTimer: number | null = null;
  private lastCriticalToastKey = '';

  readonly payload = signal<DashboardPayload | null>(null);
  readonly isLoading = signal(true);
  readonly historyLoading = signal(false);
  readonly transport = signal<'SSE' | 'snapshot' | 'offline' | 'polling'>('snapshot');
  readonly isReconnecting = signal(false);
  readonly actionMessage = signal('');
  readonly registeredDevices = signal<RegisteredDevice[]>([]);
  readonly activeTab = signal<DashboardTab>(this.restoreTab());
  readonly readingFilter = signal<ReadingStateFilter>(this.restoreReadingFilter());
  readonly alertFilter = signal<AlertFilter>(this.restoreAlertFilter());
  readonly canScrollTabsLeft = signal(false);
  readonly canScrollTabsRight = signal(false);
  readonly canScrollDeviceTabsLeft = signal(false);
  readonly canScrollDeviceTabsRight = signal(false);
  readonly selectedRange = signal<TimeRange>(this.restoreRange());
  readonly selectedDeviceId = signal<number | null>(null);
  readonly historicalReadings = signal<HistoryReading[]>([]);
  readonly devicesUiCollapsed = signal(this.restoreDevicesUiCollapsed());

  readonly uniqueDevices = computed(() => {
    const payload = this.payload();
    const map = new Map<number, DashboardDeviceView>();

    for (const device of this.registeredDevices()) {
      this.upsertDeviceView(map, this.toRegisteredDeviceView(device));
    }

    for (const device of payload?.devices || []) {
      this.upsertDeviceView(map, this.toDeviceView(device));
    }

    if (payload?.latestReading?.deviceId) {
      this.upsertDeviceView(map, this.toReadingDeviceView(payload.latestReading));
    }

    const readings = payload?.recentReadings || [];
    for (const r of readings) {
      if (!r.deviceId) continue;
      this.upsertDeviceView(map, this.toReadingDeviceView(r));
    }
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  });

  readonly hasMultipleDevices = computed(() => this.uniqueDevices().length > 1);

  readonly devicesSummaryShort = computed(() => {
    const id = this.selectedDeviceId();
    const list = this.uniqueDevices();
    if (id != null) {
      const d = list.find((device) => device.id === id);
      return d?.name?.trim() || `Dispositivo #${id}`;
    }
    if (list.length === 1) {
      const only = list[0];
      return only.name?.trim() || `Dispositivo #${only.id}`;
    }
    return `Todos (${list.length} dispositivos)`;
  });
  readonly selectedDevice = computed(() => {
    const selectedId = this.selectedDeviceId();
    if (!selectedId) return null;
    return this.uniqueDevices().find((device) => device.id === selectedId) || null;
  });

  readonly deviceCards = computed(() => {
    const devices = this.uniqueDevices();
    if (devices.length <= 1) return [];
    return devices.map((device) => {
      const reading = device.latestReading;
      return {
        device,
        reading,
        flow: reading?.flow_lmin ?? 0,
        pressure: reading?.pressure_kpa ?? 0,
        risk: reading?.risk ?? 0,
        state: reading?.state ?? device.lastState,
        isOnline: device.isOnline,
        ipAddress: device.ipAddress,
        wifiSsid: device.wifiSsid,
        internetConnected: device.internetConnected
      };
    });
  });

  readonly deviceScopedReadings = computed(() => {
    const deviceId = this.selectedDeviceId();
    const readings = this.payload()?.recentReadings || [];
    if (!deviceId) return readings;
    return readings.filter((r: DashboardReading) => r.deviceId === deviceId);
  });

  readonly deviceScopedAlerts = computed(() => {
    const deviceId = this.selectedDeviceId();
    const alerts = this.payload()?.recentAlerts || [];
    if (!deviceId) return alerts;
    return alerts.filter((a: DashboardAlert) => a.deviceId === deviceId);
  });

  readonly latestReading = computed(() => {
    const payload = this.payload();
    const selectedId = this.selectedDeviceId();
    if (!payload) return null;
    if (!selectedId) return payload.latestReading;
    return this.selectedDevice()?.latestReading ?? this.latestReadingFrom(payload.recentReadings, selectedId);
  });

  readonly currentState = computed(() => {
    const selected = this.selectedDevice();
    if (selected) return this.latestReading()?.state || selected.lastState || 'SIN_DATOS';
    if (this.hasMultipleDevices()) return this.aggregateDeviceState();
    return this.payload()?.currentState || this.latestReading()?.state || 'SIN_DATOS';
  });
  readonly scopedLastSeenAt = computed(() => {
    const selected = this.selectedDevice();
    if (selected) return this.latestReading()?.ts || selected.lastTs || null;
    if (this.hasMultipleDevices()) {
      return (
        this.uniqueDevices()
          .map((device) => device.lastTs)
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => this.timestampMs(b) - this.timestampMs(a))[0] || null
      );
    }
    return this.payload()?.lastSeenAt || this.latestReading()?.ts || null;
  });
  readonly scopedDeviceOnline = computed(() => {
    const selected = this.selectedDevice();
    if (selected) return selected.isOnline;
    if (this.hasMultipleDevices()) return this.uniqueDevices().some((device) => device.isOnline);
    return Boolean(this.payload()?.deviceOnline);
  });
  readonly highlightedDevice = computed(() => {
    const selected = this.selectedDevice();
    if (selected) return selected;
    return (
      [...this.uniqueDevices()]
        .sort((a, b) => {
          const stateDiff = this.statePriority(b.lastState) - this.statePriority(a.lastState);
          if (stateDiff) return stateDiff;
          return this.timestampMs(b.lastTs) - this.timestampMs(a.lastTs);
        })
        .find((device) => this.statePriority(device.lastState) >= this.statePriority('ALERTA')) || null
    );
  });
  readonly highlightedReading = computed(() => {
    const device = this.highlightedDevice();
    return device ? device.latestReading : this.latestReading();
  });

  readonly activeAlerts = computed(() => this.deviceScopedAlerts().filter((alert: DashboardAlert) => !alert.acknowledged));
  readonly averageRisk = computed(() => {
    const readings = this.deviceScopedReadings();
    if (!readings.length) return 0;
    return Math.round(readings.reduce((sum: number, reading: DashboardReading) => sum + Number(reading.risk || 0), 0) / readings.length);
  });
  readonly filteredReadings = computed(() => {
    const filter = this.readingFilter();
    const readings = this.deviceScopedReadings();
    if (filter === 'ALL') return readings;
    return readings.filter((reading: DashboardReading) => reading.state === filter);
  });
  readonly filteredAlerts = computed(() => {
    const filter = this.alertFilter();
    const alerts = this.deviceScopedAlerts();
    switch (filter) {
      case 'PENDING':
        return alerts.filter((alert: DashboardAlert) => !alert.acknowledged);
      case 'ACK':
        return alerts.filter((alert: DashboardAlert) => alert.acknowledged);
      case 'ALERTA':
      case 'FUGA':
      case 'ERROR':
        return alerts.filter((alert: DashboardAlert) => alert.severity === filter);
      default:
        return alerts;
    }
  });
  readonly flowSeries = computed(() => this.buildSeries('flow_lmin'));
  readonly pressureSeries = computed(() => this.buildSeries('pressure_kpa'));
  readonly flowChartPoints = computed(() => this.buildChartPoints('flow_lmin'));
  readonly pressureChartPoints = computed(() => this.buildChartPoints('pressure_kpa'));
  readonly riskChartPoints = computed(() => this.buildChartPoints('risk'));
  readonly heroTone = computed(() => this.resolveTone(this.currentState()));
  readonly lastPacketLabel = computed(() => this.relativeTime(this.scopedLastSeenAt()));
  readonly deviceHealth = computed(() => {
    const latest = this.latestReading();
    const device = this.selectedDevice();
    const isOnline = this.scopedDeviceOnline();
    if (!device && this.hasMultipleDevices()) {
      const devices = this.uniqueDevices();
      const houses = Array.from(new Set(devices.map((item) => item.houseName).filter(Boolean)));
      return {
        deviceName: `${devices.length} dispositivos`,
        houseName: houses.length === 1 ? houses[0] || 'Sin casa' : houses.length > 1 ? `${houses.length} casas` : 'Sin casa',
        mode: isOnline ? 'Online' : 'En observacion',
        alerts: this.activeAlerts().length,
        firmwareHint: 'Vista general'
      };
    }
    return {
      deviceName: latest?.deviceName || device?.name || 'Sin dispositivo',
      houseName: latest?.houseName || device?.houseName || 'Sin casa',
      mode: isOnline ? 'Online' : 'En observacion',
      alerts: this.activeAlerts().length,
      firmwareHint: latest?.deviceId || device?.id ? `Nodo #${latest?.deviceId || device?.id}` : 'Sin identificador'
    };
  });
  readonly connectionLabel = computed(() => {
    if (this.transport() === 'SSE') return 'Enlace en vivo';
    if (this.transport() === 'snapshot') return 'Modo respaldo';
    return 'Sin conexion';
  });
  readonly ranges: Array<{ id: TimeRange; label: string }> = [
    { id: '1h', label: '1H' },
    { id: '6h', label: '6H' },
    { id: '24h', label: '24H' },
    { id: '7d', label: '7D' }
  ];
  readonly tabs: Array<{ id: DashboardTab; label: string; detail: string; icon: string }> = [
    { id: 'overview', label: 'Resumen', detail: 'Estado general y salud', icon: 'fa-solid fa-gauge-high' },
    { id: 'readings', label: 'Lecturas', detail: 'Timeline y paquetes', icon: 'fa-solid fa-list-ul' },
    { id: 'alerts', label: 'Alertas', detail: 'Eventos y respuesta', icon: 'fa-solid fa-triangle-exclamation' },
    { id: 'analytics', label: 'Analítica', detail: 'Histórico y curvas', icon: 'fa-solid fa-chart-line' }
  ];
  readonly readingFilters: Array<{ id: ReadingStateFilter; label: string }> = [
    { id: 'ALL', label: 'Todas' },
    { id: 'NORMAL', label: 'Normal' },
    { id: 'ALERTA', label: 'Alerta' },
    { id: 'FUGA', label: 'Fuga' },
    { id: 'ERROR', label: 'Error' }
  ];
  readonly alertFilters: Array<{ id: AlertFilter; label: string }> = [
    { id: 'ALL', label: 'Todas' },
    { id: 'PENDING', label: 'Pendientes' },
    { id: 'ACK', label: 'Confirmadas' },
    { id: 'ALERTA', label: 'Alerta' },
    { id: 'FUGA', label: 'Fuga' },
    { id: 'ERROR', label: 'Error' }
  ];
  readonly analyticsHighlights = computed(() => {
    const readings = this.chartReadings();
    const normalized = readings.map((reading) => ({
      flow: Number(reading.flow_lmin || 0),
      pressure: Number(reading.pressure_kpa || 0),
      risk: Number(reading.risk || 0),
      state: reading.state
    }));
    if (!normalized.length) {
      return {
        peakPressure: 0,
        averageFlow: 0,
        highestRisk: 0,
        dominantState: 'SIN_DATOS'
      };
    }
    const stateCounts = normalized.reduce<Record<string, number>>((acc, reading) => {
      acc[reading.state] = (acc[reading.state] || 0) + 1;
      return acc;
    }, {});
    const dominantState =
      Object.entries(stateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'SIN_DATOS';
    return {
      peakPressure: Math.max(...normalized.map((reading) => reading.pressure)),
      averageFlow: normalized.reduce((sum, reading) => sum + reading.flow, 0) / normalized.length,
      highestRisk: Math.max(...normalized.map((reading) => reading.risk)),
      dominantState
    };
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.clearReconnectTimer());
    this.loadRegisteredDevices();
    this.loadSnapshot();
    queueMicrotask(() => this.updateTabsScrollState());
  }

  @HostListener('window:resize')
  protected onWindowResize() {
    this.updateTabsScrollState();
    this.updateDeviceTabsScrollState();
  }

  private loadSnapshot() {
    this.dashboardService
      .snapshot()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (payload) => {
          this.applyDashboardPayload(payload);
          this.isLoading.set(false);
          this.transport.set('polling');
          this.isReconnecting.set(false);
          void this.loadHistory();
          // Comenzar polling automático (3 segundos)
          this.startPolling();
          // Intentar SSE como fallback
          this.connectStream();
        },
        error: (error) => {
          this.isLoading.set(false);
          this.transport.set('offline');
          this.toast.error(resolveErrorMessage(error, 'No fue posible cargar el snapshot del dashboard.'));
        }
      });
  }

  private startPolling() {
    this.dashboardService
      .startPolling(3000) // Actualizar cada 3 segundos
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (payload) => {
          this.applyDashboardPayload(payload);
          if (this.transport() === 'offline' || this.transport() === 'snapshot') {
            this.transport.set('polling');
          }
          this.isReconnecting.set(false);
        },
        error: (error) => {
          console.warn('Polling error:', error);
          this.transport.set('offline');
          this.scheduleReconnect();
        }
      });
  }

  private connectStream() {
    this.dashboardService
      .liveStream()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (payload) => {
          this.applyDashboardPayload(payload);
          this.transport.set('SSE');
          this.isReconnecting.set(false);
          this.clearReconnectTimer();
          if (!this.historicalReadings().length) {
            void this.loadHistory();
          }
          // Detener polling si SSE se conecta exitosamente
          this.dashboardService.stopPolling();
        },
        error: () => {
          this.transport.set('polling');
          this.scheduleReconnect();
        }
      });
  }

  protected async acknowledgeAlert(alertId: number | string) {
    this.actionMessage.set('Confirmando alerta...');
    try {
      await firstValueFrom(this.api.patch(`/api/alerts/${alertId}/ack`, {}));
      this.payload.update((payload) => {
        if (!payload) return payload;
        return {
          ...payload,
          recentAlerts: payload.recentAlerts.map((alert: DashboardAlert) =>
            String(alert.id) === String(alertId) ? { ...alert, acknowledged: true } : alert
          )
        };
      });
      this.actionMessage.set('Alerta confirmada. El stream seguira sincronizando el estado.');
      this.toast.success('Alerta confirmada correctamente.');
    } catch (error) {
      const message = resolveErrorMessage(error, 'No fue posible confirmar la alerta en este momento.');
      this.actionMessage.set(message);
      this.toast.error(message);
    }
  }

  /** Claves estables para @for (Angular exige track único; id puede repetirse o faltar). */
  protected readingTrackKey(index: number, reading: DashboardReading): string {
    const idPart = reading.id != null && reading.id !== '' ? String(reading.id) : `i${index}`;
    return `${idPart}-${reading.deviceId}-${reading.ts}`;
  }

  protected alertTrackKey(index: number, alert: DashboardAlert): string {
    const idPart = alert.id != null && alert.id !== '' ? String(alert.id) : `i${index}`;
    return `${idPart}-${alert.deviceId}-${alert.ts}`;
  }

  protected readonly Math = Math;

  protected changeRange(range: TimeRange) {
    if (this.selectedRange() === range) return;
    this.selectedRange.set(range);
    localStorage.setItem(this.dashboardRangeKey, range);
    void this.loadHistory();
  }

  protected changeTab(tab: DashboardTab) {
    this.activeTab.set(tab);
    localStorage.setItem(this.dashboardTabKey, tab);
    this.scrollActiveTabIntoView();
  }

  protected changeReadingFilter(filter: ReadingStateFilter) {
    this.readingFilter.set(filter);
    localStorage.setItem(this.dashboardReadingFilterKey, filter);
  }

  protected changeAlertFilter(filter: AlertFilter) {
    this.alertFilter.set(filter);
    localStorage.setItem(this.dashboardAlertFilterKey, filter);
  }

  protected selectDevice(deviceId: number | null) {
    this.selectedDeviceId.set(deviceId);
    void this.loadHistory();
    queueMicrotask(() => this.updateDeviceTabsScrollState());
  }

  protected scrollTabs(direction: 'left' | 'right') {
    const host = this.tabsScroller?.nativeElement;
    if (!host) return;
    const amount = Math.max(220, Math.round(host.clientWidth * 0.55));
    host.scrollBy({
      left: direction === 'right' ? amount : -amount,
      behavior: 'smooth'
    });
    window.setTimeout(() => this.updateTabsScrollState(), 220);
  }

  protected scrollDeviceTabs(direction: 'left' | 'right') {
    const host = this.deviceTabsScroller?.nativeElement;
    if (!host) return;
    const amount = Math.max(220, Math.round(host.clientWidth * 0.55));
    host.scrollBy({
      left: direction === 'right' ? amount : -amount,
      behavior: 'smooth'
    });
    window.setTimeout(() => this.updateDeviceTabsScrollState(), 220);
  }

  protected onTabsScroll() {
    this.updateTabsScrollState();
  }

  protected onDeviceTabsScroll() {
    this.updateDeviceTabsScrollState();
  }

  protected toggleDevicesUiCollapsed(): void {
    const next = !this.devicesUiCollapsed();
    this.devicesUiCollapsed.set(next);
    localStorage.setItem(this.dashboardDevicesCollapsedKey, next ? '1' : '0');
    if (!next) {
      queueMicrotask(() => this.updateDeviceTabsScrollState());
    }
  }

  protected tabBadge(tab: DashboardTab) {
    switch (tab) {
      case 'readings':
        return this.deviceScopedReadings().length || 0;
      case 'alerts':
        return this.activeAlerts().length;
      case 'analytics':
        return this.historicalReadings().length;
      default:
        return null;
    }
  }

  private toDeviceView(device: DashboardDeviceSummary): DashboardDeviceView {
    return {
      id: device.id,
      name: device.name || device.latestReading?.deviceName || null,
      houseId: device.houseId || device.latestReading?.houseId || null,
      houseName: device.houseName || device.latestReading?.houseName || null,
      lastState: device.lastState || device.latestReading?.state || device.status || 'SIN_DATOS',
      lastTs: device.latestReading?.ts || device.lastSeenAt || null,
      latestReading: device.latestReading || null,
      isOnline: Boolean(device.online),
      ipAddress: device.ipAddress || null,
      wifiSsid: device.wifiSsid || null,
      internetConnected: Boolean(device.internetConnected ?? device.online)
    };
  }

  private toRegisteredDeviceView(device: RegisteredDevice): DashboardDeviceView {
    const house = device.House || null;
    const houseId = device.houseId ?? device.house_id ?? house?.id ?? null;
    const lastSeenAt = device.lastSeenAt ?? device.last_seen_at ?? null;
    return {
      id: device.id,
      name: device.name || null,
      houseId,
      houseName: house?.name || null,
      lastState: device.status || 'SIN_DATOS',
      lastTs: lastSeenAt,
      latestReading: null,
      isOnline: Boolean(device.internetConnected ?? device.internet_connected) && this.isOnlineAt(lastSeenAt),
      ipAddress: device.ipAddress ?? device.ip_address ?? null,
      wifiSsid: device.wifiSsid ?? device.wifi_ssid ?? null,
      internetConnected: Boolean(device.internetConnected ?? device.internet_connected)
    };
  }

  private toReadingDeviceView(reading: DashboardReading): DashboardDeviceView {
    return {
      id: reading.deviceId,
      name: reading.deviceName || null,
      houseId: reading.houseId || null,
      houseName: reading.houseName || null,
      lastState: reading.state,
      lastTs: reading.ts,
      latestReading: reading,
      isOnline: this.isOnlineAt(reading.ts),
      ipAddress: null,
      wifiSsid: null,
      internetConnected: this.isOnlineAt(reading.ts)
    };
  }

  private upsertDeviceView(map: Map<number, DashboardDeviceView>, candidate: DashboardDeviceView) {
    const existing = map.get(candidate.id);
    if (!existing) {
      map.set(candidate.id, candidate);
      return;
    }

    const candidateTs = this.timestampMs(candidate.lastTs);
    const existingTs = this.timestampMs(existing.lastTs);
    const candidateHasNewerTelemetry =
      Boolean(candidate.latestReading) && (!existing.latestReading || candidateTs >= existingTs);
    const candidateHasBetterStatus =
      candidateTs > existingTs || (existing.lastState === 'SIN_DATOS' && candidate.lastState !== 'SIN_DATOS');

    map.set(candidate.id, {
      id: existing.id,
      name: candidate.name || existing.name,
      houseId: candidate.houseId ?? existing.houseId,
      houseName: candidate.houseName || existing.houseName,
      lastState: candidateHasNewerTelemetry || candidateHasBetterStatus ? candidate.lastState : existing.lastState,
      lastTs: candidateTs >= existingTs && candidate.lastTs ? candidate.lastTs : existing.lastTs || candidate.lastTs,
      latestReading: candidateHasNewerTelemetry ? candidate.latestReading : existing.latestReading || candidate.latestReading,
      isOnline: existing.isOnline || candidate.isOnline,
      ipAddress: candidate.ipAddress || existing.ipAddress,
      wifiSsid: candidate.wifiSsid || existing.wifiSsid,
      internetConnected: existing.internetConnected || candidate.internetConnected
    });
  }

  private latestReadingFrom(readings: DashboardReading[], deviceId: number) {
    return readings.reduce<DashboardReading | null>((latest, reading) => {
      if (reading.deviceId !== deviceId) return latest;
      if (!latest || this.timestampMs(reading.ts) > this.timestampMs(latest.ts)) return reading;
      return latest;
    }, null);
  }

  private timestampMs(value: string | null | undefined) {
    if (!value) return 0;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private isOnlineAt(value: string | null | undefined) {
    const timestamp = this.timestampMs(value);
    return timestamp > 0 && Date.now() - timestamp <= 10000;
  }

  private statePriority(state: string | null | undefined) {
    switch (state) {
      case 'FUGA':
        return 5;
      case 'ERROR':
        return 4;
      case 'ALERTA':
        return 3;
      case 'NORMAL':
        return 2;
      case 'ACTIVO':
        return 1;
      default:
        return 0;
    }
  }

  private aggregateDeviceState() {
    return (
      [...this.uniqueDevices()]
        .sort((a, b) => this.statePriority(b.lastState) - this.statePriority(a.lastState))
        [0]?.lastState || this.payload()?.currentState || 'SIN_DATOS'
    );
  }

  private buildSeries(metric: 'flow_lmin' | 'pressure_kpa') {
    const readings = this.deviceScopedReadings();
    const values = readings.map((reading: DashboardReading) => Number(reading[metric] || 0));
    const peak = Math.max(...values, 1);

    return readings.map((reading: DashboardReading, index: number) => ({
      id: reading.id,
      value: Number(reading[metric] || 0),
      height: `${Math.max(12, Math.round((Number(reading[metric] || 0) / peak) * 100))}%`,
      delay: `${index * 45}ms`,
      state: reading.state
    }));
  }

  private buildChartPoints(metric: 'flow_lmin' | 'pressure_kpa' | 'risk') {
    const readings = this.chartReadings().slice(-12);
    return readings.map((reading) => ({
      value: Number(reading[metric] || 0),
      label: new Date(reading.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }));
  }

  private async loadHistory() {
    this.historyLoading.set(true);
    try {
      const selectedDeviceId = this.selectedDeviceId();
      const response = await firstValueFrom(
        this.dashboardService.readings({
          limit: this.selectedRange() === '7d' ? 140 : 96,
          from: this.buildFromDate(this.selectedRange()),
          deviceId: selectedDeviceId || undefined
        })
      );
      this.historicalReadings.set(response.readings || []);
    } catch (error) {
      this.historicalReadings.set([]);
      this.toast.warning(resolveErrorMessage(error, 'No fue posible cargar el historico. Se usara el snapshot reciente.'));
    } finally {
      this.historyLoading.set(false);
    }
  }

  private loadRegisteredDevices() {
    this.api
      .get<DeviceCatalogResponse>('/api/devices', { limit: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.registeredDevices.set(response.devices || []);
          this.ensureSelectedDeviceIsVisible();
          queueMicrotask(() => this.updateDeviceTabsScrollState());
        },
        error: (error) => {
          this.registeredDevices.set([]);
          this.toast.warning(resolveErrorMessage(error, 'No fue posible cargar el catalogo de dispositivos.'));
        }
      });
  }

  private applyDashboardPayload(payload: DashboardPayload) {
    this.payload.set(payload);
    this.ensureSelectedDeviceIsVisible();
    this.notifyCriticalPayload(payload);
    queueMicrotask(() => this.updateDeviceTabsScrollState());
  }

  private chartReadings() {
    const selectedDeviceId = this.selectedDeviceId();
    const readings = new Map<string, HistoryReading | DashboardReading>();
    const addReading = (reading: HistoryReading | DashboardReading | null | undefined) => {
      if (!reading) return;
      if (selectedDeviceId && reading.deviceId !== selectedDeviceId) return;
      const key = `${reading.deviceId}-${reading.ts}-${reading.id ?? ''}`;
      readings.set(key, reading);
    };

    this.historicalReadings().forEach(addReading);
    this.deviceScopedReadings().forEach(addReading);
    addReading(this.latestReading());

    return Array.from(readings.values()).sort((a, b) => this.timestampMs(a.ts) - this.timestampMs(b.ts));
  }

  private notifyCriticalPayload(payload: DashboardPayload) {
    const alert = [...(payload.recentAlerts || [])]
      .filter((item) => !item.acknowledged && this.isCriticalAlert(item))
      .sort((a, b) => this.statePriority(String(b.severity)) - this.statePriority(String(a.severity)) || this.timestampMs(b.ts) - this.timestampMs(a.ts))[0];

    if (alert) {
      const state = alert.severity === 'FUGA' || alert.severity === 'CRITICAL' ? 'FUGA' : 'ALERTA';
      const key = `alert-${alert.id}-${alert.severity}-${alert.ts}`;
      this.showCriticalToast(key, state, alert.message || 'Evento critico detectado.', alert.deviceName || 'Dispositivo');
      return;
    }

    const reading = payload.latestReading;
    const state = reading?.state || payload.currentState;
    if (state === 'FUGA' || state === 'ALERTA') {
      const key = `state-${reading?.deviceId || 'global'}-${state}`;
      const detail = reading
        ? `${reading.deviceName || 'Dispositivo'} reporta ${Number(reading.flow_lmin || 0).toFixed(2)} L/min y ${Number(reading.pressure_kpa || 0).toFixed(1)} kPa.`
        : `El sistema entro en estado ${state}.`;
      this.showCriticalToast(key, state, detail, reading?.deviceName || 'Dispositivo');
      return;
    }

    this.lastCriticalToastKey = '';
  }

  private isCriticalAlert(alert: DashboardAlert) {
    return alert.severity === 'FUGA' || alert.severity === 'ALERTA' || alert.severity === 'CRITICAL' || alert.severity === 'HIGH';
  }

  private showCriticalToast(key: string, state: 'FUGA' | 'ALERTA', message: string, deviceName: string) {
    if (this.lastCriticalToastKey === key) return;
    this.lastCriticalToastKey = key;

    if (state === 'FUGA') {
      this.toast.error(`${deviceName}: ${message}`, 'Fuga detectada');
      return;
    }

    this.toast.warning(`${deviceName}: ${message}`, 'Alerta activa');
  }

  private resolveTone(state: string) {
    switch (state) {
      case 'FUGA':
        return 'danger';
      case 'ALERTA':
        return 'alert';
      case 'NORMAL':
      case 'ACTIVO':
        return 'normal';
      case 'ERROR':
        return 'error';
      default:
        return 'muted';
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    this.isReconnecting.set(true);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.dashboardService
        .snapshot()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (payload) => {
            this.applyDashboardPayload(payload);
            this.transport.set('snapshot');
            this.connectStream();
          },
          error: () => {
            this.transport.set('offline');
            this.scheduleReconnect();
          }
        });
    }, 3000);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer === null) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.dashboardService.stopPolling();
  }

  private ensureSelectedDeviceIsVisible() {
    const selectedId = this.selectedDeviceId();
    if (!selectedId) return;
    if (this.uniqueDevices().some((device) => device.id === selectedId)) return;
    this.selectedDeviceId.set(null);
  }

  protected relativeTime(value: string | null) {
    if (!value) return 'Sin paquetes';
    const deltaSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (deltaSeconds < 5) return 'Hace instantes';
    if (deltaSeconds < 60) return `Hace ${deltaSeconds}s`;
    const minutes = Math.floor(deltaSeconds / 60);
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `Hace ${hours} h`;
  }

  private buildFromDate(range: TimeRange) {
    const date = new Date();
    switch (range) {
      case '1h':
        date.setHours(date.getHours() - 1);
        break;
      case '6h':
        date.setHours(date.getHours() - 6);
        break;
      case '24h':
        date.setDate(date.getDate() - 1);
        break;
      case '7d':
        date.setDate(date.getDate() - 7);
        break;
    }
    return date.toISOString();
  }

  private restoreTab(): DashboardTab {
    const saved = localStorage.getItem(this.dashboardTabKey);
    if (saved === 'overview' || saved === 'readings' || saved === 'alerts' || saved === 'analytics') {
      return saved;
    }
    return 'overview';
  }

  private restoreRange(): TimeRange {
    const saved = localStorage.getItem(this.dashboardRangeKey);
    if (saved === '1h' || saved === '6h' || saved === '24h' || saved === '7d') {
      return saved;
    }
    return '24h';
  }

  private restoreReadingFilter(): ReadingStateFilter {
    const saved = localStorage.getItem(this.dashboardReadingFilterKey);
    if (saved === 'ALL' || saved === 'NORMAL' || saved === 'ALERTA' || saved === 'FUGA' || saved === 'ERROR') {
      return saved;
    }
    return 'ALL';
  }

  private restoreAlertFilter(): AlertFilter {
    const saved = localStorage.getItem(this.dashboardAlertFilterKey);
    if (
      saved === 'ALL' ||
      saved === 'PENDING' ||
      saved === 'ACK' ||
      saved === 'ALERTA' ||
      saved === 'FUGA' ||
      saved === 'ERROR'
    ) {
      return saved;
    }
    return 'ALL';
  }

  private restoreDevicesUiCollapsed(): boolean {
    return localStorage.getItem(this.dashboardDevicesCollapsedKey) === '1';
  }

  private scrollActiveTabIntoView() {
    queueMicrotask(() => {
      const host = this.tabsScroller?.nativeElement;
      if (!host) return;
      const active = host.querySelector<HTMLElement>('.dashboard-tab--active');
      active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      window.setTimeout(() => this.updateTabsScrollState(), 220);
    });
  }

  private updateTabsScrollState() {
    const host = this.tabsScroller?.nativeElement;
    if (!host) return;
    const maxScrollLeft = Math.max(0, host.scrollWidth - host.clientWidth);
    this.canScrollTabsLeft.set(host.scrollLeft > 8);
    this.canScrollTabsRight.set(host.scrollLeft < maxScrollLeft - 8);
  }

  private updateDeviceTabsScrollState() {
    const host = this.deviceTabsScroller?.nativeElement;
    if (!host) return;
    const maxScrollLeft = Math.max(0, host.scrollWidth - host.clientWidth);
    this.canScrollDeviceTabsLeft.set(host.scrollLeft > 8);
    this.canScrollDeviceTabsRight.set(host.scrollLeft < maxScrollLeft - 8);
  }
}
