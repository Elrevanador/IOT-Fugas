/**
 * Central type definitions for IoT Water Management System
 */

// ============================================================
// Authentication Types
// ============================================================

export interface AuthUser {
  id: number;
  nombre: string;
  email: string;
  role: 'admin' | 'resident' | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  ok: boolean;
  token: string;
  user?: AuthUser;
}

export interface RegisterPayload {
  nombre: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  ok: boolean;
  message?: string;
  user?: AuthUser;
}

export interface MeResponse {
  ok: boolean;
  user: AuthUser;
}

// ============================================================
// Dashboard Reading Types
// ============================================================

export interface DashboardReading {
  id: number | string;
  deviceId: number;
  deviceName: string | null;
  houseId: number | null;
  houseName: string | null;
  ts: string; // ISO date string
  flow_lmin: number;
  pressure_kpa: number;
  risk: number;
  state: 'NORMAL' | 'ALERTA' | 'FUGA' | 'ERROR' | 'SIN_DATOS';
  is_anomaly?: boolean;
  processed_at?: string;
}

export type HistoryReading = DashboardReading;

// ============================================================
// Dashboard Alert Types
// ============================================================

export interface DashboardAlert {
  id: number | string;
  deviceId: number;
  deviceName: string | null;
  houseId: number | null;
  houseName: string | null;
  ts: string; // ISO date string
  severity: 'ALERTA' | 'FUGA' | 'ERROR' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  acknowledged: boolean;
  ack_at: string | null;
}

// ============================================================
// Dashboard Device Summary Types
// ============================================================

export interface DashboardDeviceSummary {
  id: number;
  name: string | null;
  houseId: number | null;
  houseName: string | null;
  status: string | null;
  lastSeenAt: string | null;
  lastState: string;
  online: boolean;
  latestReading: DashboardReading | null;
}

// ============================================================
// Dashboard Payload Types
// ============================================================

export interface DashboardSummary {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  alertsCount: number;
  criticalAlerts: number;
  activeAlerts: number;
  lastUpdated?: Date;
  lastUpdate?: string;
}

export interface DashboardPayload {
  ok: boolean;
  latestReading: DashboardReading | null;
  recentReadings: DashboardReading[];
  recentAlerts: DashboardAlert[];
  devices: DashboardDeviceSummary[];
  deviceOnline: boolean;
  lastSeenAt: string | null;
  currentState: string;
  summary: DashboardSummary;
}

// ============================================================
// API Response Types
// ============================================================

export interface ReadingsResponse {
  ok: boolean;
  readings: HistoryReading[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface ApiErrorResponse {
  ok: false;
  msg?: string;
  message?: string;
  error?: unknown;
}

// ============================================================
// Device & Sensor Types
// ============================================================

export interface Device {
  id: number;
  name: string;
  house_id?: number | null;
  houseId?: number | null;
  status?: string | null;
  last_seen_at?: string | null;
  lastSeenAt?: string | null;
  House?: {
    id: number;
    name: string;
  } | null;
}

export interface DeviceCatalogResponse {
  ok: boolean;
  devices: Device[];
}

// ============================================================
// Sensor Reading Types
// ============================================================

export interface SensorReading {
  id: number;
  device_id: number;
  sensor_id?: number | null;
  ts: string;
  value: number;
  unit?: string;
}

// ============================================================
// Alert Types
// ============================================================

export interface Alert {
  id: number;
  device_id: number;
  severity: string;
  message: string;
  ts: string;
  acknowledged: boolean;
  ack_at?: string | null;
}

// ============================================================
// Incident Types
// ============================================================

export interface Incident {
  id: number;
  device_id: number;
  type: string;
  description: string;
  ts: string;
  status: 'OPEN' | 'RESOLVED';
}

// ============================================================
// House Types
// ============================================================

export interface House {
  id: number;
  name: string;
  address?: string;
  devices?: Device[];
}
