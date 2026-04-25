import { CommonModule, DatePipe, DecimalPipe, JsonPipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { DashboardPayload, DashboardService, HistoryReading } from '../../core/services/dashboard.service';
import { TelemetryChartComponent } from '../../shared/components/telemetry-chart/telemetry-chart.component';

type TimeRange = '1h' | '6h' | '24h' | '7d';
type DashboardTab = 'overview' | 'readings' | 'alerts' | 'analytics';
type ReadingStateFilter = 'ALL' | 'NORMAL' | 'ALERTA' | 'FUGA' | 'ERROR';
type AlertFilter = 'ALL' | 'PENDING' | 'ACK' | 'ALERTA' | 'FUGA' | 'ERROR';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, DecimalPipe, JsonPipe, DatePipe, TelemetryChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  @ViewChild('tabsScroller') private tabsScroller?: ElementRef<HTMLDivElement>;
  private readonly dashboardTabKey = 'dashboard_active_tab';
  private readonly dashboardRangeKey = 'dashboard_range';
  private readonly dashboardReadingFilterKey = 'dashboard_reading_filter';
  private readonly dashboardAlertFilterKey = 'dashboard_alert_filter';
  private readonly api = inject(ApiService);
  private readonly dashboardService = inject(DashboardService);
  private readonly destroyRef = inject(DestroyRef);
  private reconnectTimer: number | null = null;

  readonly payload = signal<DashboardPayload | null>(null);
  readonly isLoading = signal(true);
  readonly historyLoading = signal(false);
  readonly transport = signal<'SSE' | 'snapshot' | 'offline'>('snapshot');
  readonly isReconnecting = signal(false);
  readonly actionMessage = signal('');
  readonly activeTab = signal<DashboardTab>(this.restoreTab());
  readonly readingFilter = signal<ReadingStateFilter>(this.restoreReadingFilter());
  readonly alertFilter = signal<AlertFilter>(this.restoreAlertFilter());
  readonly canScrollTabsLeft = signal(false);
  readonly canScrollTabsRight = signal(false);
  readonly selectedRange = signal<TimeRange>(this.restoreRange());
  readonly historicalReadings = signal<HistoryReading[]>([]);
  readonly latestReading = computed(() => this.payload()?.latestReading ?? null);
  readonly activeAlerts = computed(() => (this.payload()?.recentAlerts || []).filter((alert) => !alert.acknowledged));
  readonly averageRisk = computed(() => {
    const readings = this.payload()?.recentReadings || [];
    if (!readings.length) return 0;
    return Math.round(readings.reduce((sum, reading) => sum + Number(reading.risk || 0), 0) / readings.length);
  });
  readonly filteredReadings = computed(() => {
    const filter = this.readingFilter();
    const readings = this.payload()?.recentReadings || [];
    if (filter === 'ALL') return readings;
    return readings.filter((reading) => reading.state === filter);
  });
  readonly filteredAlerts = computed(() => {
    const filter = this.alertFilter();
    const alerts = this.payload()?.recentAlerts || [];
    switch (filter) {
      case 'PENDING':
        return alerts.filter((alert) => !alert.acknowledged);
      case 'ACK':
        return alerts.filter((alert) => alert.acknowledged);
      case 'ALERTA':
      case 'FUGA':
      case 'ERROR':
        return alerts.filter((alert) => alert.severity === filter);
      default:
        return alerts;
    }
  });
  readonly flowSeries = computed(() => this.buildSeries('flow_lmin'));
  readonly pressureSeries = computed(() => this.buildSeries('pressure_kpa'));
  readonly flowChartPoints = computed(() => this.buildChartPoints('flow_lmin'));
  readonly pressureChartPoints = computed(() => this.buildChartPoints('pressure_kpa'));
  readonly riskChartPoints = computed(() => this.buildChartPoints('risk'));
  readonly heroTone = computed(() => this.resolveTone(this.payload()?.currentState || 'SIN_DATOS'));
  readonly lastPacketLabel = computed(() => this.relativeTime(this.payload()?.lastSeenAt || null));
  readonly deviceHealth = computed(() => {
    const latest = this.latestReading();
    return {
      deviceName: latest?.deviceName || 'Sin dispositivo',
      houseName: latest?.houseName || 'Sin casa',
      mode: this.payload()?.deviceOnline ? 'Online' : 'En observacion',
      alerts: this.activeAlerts().length,
      firmwareHint: latest?.deviceId ? `Nodo #${latest.deviceId}` : 'Sin identificador'
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
  readonly tabs: Array<{ id: DashboardTab; label: string; detail: string }> = [
    { id: 'overview', label: 'Resumen', detail: 'Estado general y salud' },
    { id: 'readings', label: 'Lecturas', detail: 'Timeline y paquetes' },
    { id: 'alerts', label: 'Alertas', detail: 'Eventos y respuesta' },
    { id: 'analytics', label: 'Analitica', detail: 'Historico y curvas' }
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
    const readings = this.historicalReadings().length
      ? this.historicalReadings()
      : ((this.payload()?.recentReadings || []) as Array<HistoryReading | DashboardPayload['recentReadings'][number]>);
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
    this.loadSnapshot();
    queueMicrotask(() => this.updateTabsScrollState());
  }

  @HostListener('window:resize')
  protected onWindowResize() {
    this.updateTabsScrollState();
  }

  private loadSnapshot() {
    this.dashboardService
      .snapshot()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (payload) => {
          this.payload.set(payload);
          this.isLoading.set(false);
          this.transport.set('snapshot');
          this.isReconnecting.set(false);
          void this.loadHistory();
          this.connectStream();
        },
        error: () => {
          this.isLoading.set(false);
          this.transport.set('offline');
        }
      });
  }

  private connectStream() {
    this.dashboardService
      .liveStream()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (payload) => {
          this.payload.set(payload);
          this.transport.set('SSE');
          this.isReconnecting.set(false);
          this.clearReconnectTimer();
          if (!this.historicalReadings().length) {
            void this.loadHistory();
          }
        },
        error: () => {
          this.transport.set('snapshot');
          this.scheduleReconnect();
        }
      });
  }

  protected async acknowledgeAlert(alertId: number) {
    this.actionMessage.set('Confirmando alerta...');
    try {
      await firstValueFrom(this.api.patch(`/api/alerts/${alertId}/ack`, {}));
      this.payload.update((payload) => {
        if (!payload) return payload;
        return {
          ...payload,
          recentAlerts: payload.recentAlerts.map((alert) =>
            alert.id === alertId ? { ...alert, acknowledged: true } : alert
          )
        };
      });
      this.actionMessage.set('Alerta confirmada. El stream seguira sincronizando el estado.');
    } catch (error) {
      this.actionMessage.set(
        error instanceof Error ? error.message : 'No fue posible confirmar la alerta en este momento.'
      );
    }
  }

  protected trackByAlert = (_index: number, alert: { id: number }) => alert.id;
  protected trackByReading = (_index: number, reading: { id: number }) => reading.id;
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

  protected onTabsScroll() {
    this.updateTabsScrollState();
  }

  protected tabBadge(tab: DashboardTab) {
    switch (tab) {
      case 'readings':
        return this.payload()?.recentReadings.length || 0;
      case 'alerts':
        return this.activeAlerts().length;
      case 'analytics':
        return this.historicalReadings().length;
      default:
        return null;
    }
  }

  private buildSeries(metric: 'flow_lmin' | 'pressure_kpa') {
    const readings = this.payload()?.recentReadings || [];
    const values = readings.map((reading) => Number(reading[metric] || 0));
    const peak = Math.max(...values, 1);

    return readings.map((reading, index) => ({
      id: reading.id,
      value: Number(reading[metric] || 0),
      height: `${Math.max(12, Math.round((Number(reading[metric] || 0) / peak) * 100))}%`,
      delay: `${index * 45}ms`,
      state: reading.state
    }));
  }

  private buildChartPoints(metric: 'flow_lmin' | 'pressure_kpa' | 'risk') {
    const source = this.historicalReadings().length
      ? [...this.historicalReadings()].reverse()
      : [...(this.payload()?.recentReadings || [])];
    const readings = source.slice(-7);
    return readings.map((reading) => ({
      value: Number(reading[metric] || 0),
      label: new Date(reading.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));
  }

  private async loadHistory() {
    const latest = this.latestReading();
    if (!latest) return;

    this.historyLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.dashboardService.readings({
          limit: this.selectedRange() === '7d' ? 140 : 96,
          from: this.buildFromDate(this.selectedRange()),
          deviceId: latest.deviceId || undefined,
          houseId: latest.houseId || undefined
        })
      );
      this.historicalReadings.set(response.readings || []);
    } catch {
      this.historicalReadings.set([]);
    } finally {
      this.historyLoading.set(false);
    }
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
            this.payload.set(payload);
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
  }

  private relativeTime(value: string | null) {
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
}
