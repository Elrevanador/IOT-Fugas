import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { resolveErrorMessage } from '../../core/utils/error-message';
import { ModalComponent } from '../../shared/components/modal/modal.component';

interface House {
  id: number;
  name: string;
  code: string;
  address: string | null;
  owner_name: string | null;
  contact_phone: string | null;
  status: string;
  Users?: Array<{ id: number }>;
  Devices?: Array<{ id: number }>;
}

interface User {
  id: number;
  nombre: string;
  email: string;
  role: string;
  house_id: number | null;
  House?: House | null;
}

interface Role {
  id: number;
  code: string;
  nombre: string;
  descripcion: string | null;
  users?: User[];
}

interface UserRole {
  user_id: number;
  role_id: number;
  assigned_at: string;
  User?: User | null;
  Role?: Role | null;
}

interface Device {
  id: number;
  house_id: number | null;
  name: string;
  location: string | null;
  status: string;
  device_type: string | null;
  firmware_version: string | null;
  hardware_uid: string | null;
  last_seen_at: string | null;
  hasCustomApiKey: boolean;
  apiKeyHint: string | null;
  House?: House | null;
}

interface LocationItem {
  id: number;
  house_id: number;
  nombre: string;
  descripcion: string | null;
  area: string | null;
  piso: string | null;
  House?: House | null;
}

interface SensorItem {
  id: number;
  device_id: number;
  ubicacion_id: number | null;
  tipo: string;
  modelo: string | null;
  unidad: string | null;
  rango_min: number | null;
  rango_max: number | null;
  activo: boolean;
  Device?: Device | null;
  ubicacion?: LocationItem | null;
}

interface Reading {
  id: number;
  device_id: number;
  sensor_id: number | null;
  ts: string;
  flow_lmin: number;
  pressure_kpa: number;
  risk: number;
  state: string;
  Device?: Device | null;
}

interface AlertItem {
  id: number;
  ts: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  ack_at?: string | null;
  Device?: Device | null;
}

interface Incident {
  id: number;
  estado: string;
  detected_at: string;
  ended_at?: string | null;
  flow_promedio_lmin?: number | null;
  duracion_minutos?: number | null;
  volumen_estimado_l?: number | null;
  umbral_flow_lmin?: number | null;
  ventana_minutos?: number | null;
  resuelto_por_user_id?: number | null;
  resuelto_at?: string | null;
  observaciones?: string | null;
  Device?: Device | null;
}

interface Valve {
  id: number;
  device_id: number;
  estado: string;
  modo: string;
  ultima_accion_at: string | null;
  Device?: Device | null;
}

interface ValveAction {
  id: number;
  valvula_id: number;
  user_id: number | null;
  tipo: string;
  origen: string;
  estado_resultado: string;
  ts: string;
  detalle: string | null;
  Electrovalvula?: Valve | null;
  usuario?: Pick<User, 'id' | 'nombre' | 'email'> | null;
}

interface DetectionConfig {
  id: number;
  device_id: number;
  umbral_flow_lmin: number;
  ventana_minutos: number;
  umbral_presion_min_kpa: number | null;
  umbral_presion_max_kpa: number | null;
  auto_cierre_valvula: boolean;
  notificar_email: boolean;
  activo: boolean;
  updated_by_user_id: number | null;
  Device?: Device | null;
}

interface CommandItem {
  id: number;
  device_id: number;
  user_id: number | null;
  tipo: string;
  payload: unknown;
  estado: string;
  prioridad: string;
  created_at: string;
  sent_at: string | null;
  expires_at: string | null;
  Device?: Device | null;
  respuesta?: CommandResponse | null;
}

interface CommandResponse {
  id: number;
  comando_id: number;
  codigo_resultado: string;
  mensaje: string | null;
  payload: unknown;
  recibido_at: string;
  ComandoRemoto?: CommandItem | null;
}

interface SystemState {
  id: number;
  device_id: number;
  ts: string;
  estado: string;
  motivo: string | null;
  metadata: unknown;
  Device?: Device | null;
}

interface AuditItem {
  id: number;
  user_id: number | null;
  entidad: string;
  entidad_id: string | null;
  accion: string;
  detalle: unknown;
  ip: string | null;
  user_agent: string | null;
  ts: string;
  User?: Pick<User, 'id' | 'nombre' | 'email' | 'role'> | null;
}

type Scene =
  | 'houses'
  | 'users'
  | 'roles'
  | 'userRoles'
  | 'devices'
  | 'locations'
  | 'sensors'
  | 'readings'
  | 'alerts'
  | 'incidents'
  | 'valves'
  | 'valveActions'
  | 'detection'
  | 'commands'
  | 'responses'
  | 'states'
  | 'audit';

type DeviceStatusFilter = 'ALL' | 'ACTIVO' | 'NORMAL' | 'ALERTA' | 'FUGA' | 'ERROR' | 'INACTIVO' | 'MANTENIMIENTO';
type AlertSeverityFilter = 'ALL' | 'ALERTA' | 'FUGA' | 'ERROR';
type AlertAcknowledgedFilter = 'ALL' | 'PENDING' | 'ACK';
type ValveMode = 'AUTO' | 'MANUAL' | 'BLOQUEADA';
type DetailType = 'device' | 'alert' | 'incident' | 'valve' | 'command' | 'audit' | null;

@Component({
  selector: 'app-admin',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ModalComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly pageSize = 7;
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly houses = signal<House[]>([]);
  readonly users = signal<User[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly userRoles = signal<UserRole[]>([]);
  readonly devices = signal<Device[]>([]);
  readonly locations = signal<LocationItem[]>([]);
  readonly sensors = signal<SensorItem[]>([]);
  readonly readings = signal<Reading[]>([]);
  readonly alerts = signal<AlertItem[]>([]);
  readonly incidents = signal<Incident[]>([]);
  readonly valves = signal<Valve[]>([]);
  readonly valveActions = signal<ValveAction[]>([]);
  readonly detectionConfigs = signal<DetectionConfig[]>([]);
  readonly commands = signal<CommandItem[]>([]);
  readonly responses = signal<CommandResponse[]>([]);
  readonly states = signal<SystemState[]>([]);
  readonly audit = signal<AuditItem[]>([]);

  readonly busy = signal(false);
  readonly activeScene = signal<Scene>('houses');
  readonly query = signal('');
  readonly page = signal(1);
  readonly deviceStatusFilter = signal<DeviceStatusFilter>('ALL');
  readonly alertSeverityFilter = signal<AlertSeverityFilter>('ALL');
  readonly alertAcknowledgedFilter = signal<AlertAcknowledgedFilter>('ALL');
  readonly selectedDevice = signal<Device | null>(null);
  readonly selectedAlert = signal<AlertItem | null>(null);
  readonly selectedIncident = signal<Incident | null>(null);
  readonly selectedValve = signal<Valve | null>(null);
  readonly selectedCommand = signal<CommandItem | null>(null);
  readonly selectedAudit = signal<AuditItem | null>(null);
  readonly deviceCredential = signal<{ name: string; apiKey: string } | null>(null);
  readonly message = signal('Cargando consola administrativa...');

  readonly showHouseModal = signal(false);
  readonly showUserModal = signal(false);
  readonly showRoleModal = signal(false);
  readonly showUserRoleModal = signal(false);
  readonly showDeviceModal = signal(false);
  readonly showLocationModal = signal(false);
  readonly showSensorModal = signal(false);
  readonly showConfigModal = signal(false);
  readonly showCommandModal = signal(false);
  readonly showStateModal = signal(false);

  readonly editingHouse = signal<House | null>(null);
  readonly editingUser = signal<User | null>(null);
  readonly editingRole = signal<Role | null>(null);
  readonly editingDevice = signal<Device | null>(null);
  readonly editingLocation = signal<LocationItem | null>(null);
  readonly editingSensor = signal<SensorItem | null>(null);
  readonly editingConfig = signal<DetectionConfig | null>(null);

  readonly houseForm = this.fb.nonNullable.group({
    id: [0],
    name: ['', [Validators.required, Validators.minLength(3)]],
    address: ['', [Validators.required, Validators.minLength(5)]],
    owner_name: ['', [Validators.required, Validators.minLength(3)]],
    contact_phone: ['', [Validators.required, Validators.minLength(7)]],
    status: ['ACTIVA', [Validators.required]]
  });

  readonly userForm = this.fb.nonNullable.group({
    id: [0],
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    houseId: [0],
    role: ['resident', [Validators.required]]
  });

  readonly roleForm = this.fb.nonNullable.group({
    id: [0],
    code: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(40)]],
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    descripcion: ['']
  });

  readonly userRoleForm = this.fb.nonNullable.group({
    userId: [0, [Validators.required, Validators.min(1)]],
    roleId: [0, [Validators.required, Validators.min(1)]]
  });

  readonly deviceForm = this.fb.nonNullable.group({
    id: [0],
    name: ['', [Validators.required, Validators.minLength(3)]],
    houseId: [null as number | null, [Validators.required, Validators.min(1)]],
    location: ['', [Validators.required, Validators.minLength(3)]],
    status: ['ACTIVO', [Validators.required]],
    deviceType: [''],
    firmwareVersion: [''],
    hardwareUid: ['']
  });

  readonly locationForm = this.fb.nonNullable.group({
    id: [0],
    houseId: [0, [Validators.required, Validators.min(1)]],
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    descripcion: [''],
    area: [''],
    piso: ['']
  });

  readonly sensorForm = this.fb.nonNullable.group({
    id: [0],
    deviceId: [0, [Validators.required, Validators.min(1)]],
    tipo: ['caudal', [Validators.required]],
    modelo: [''],
    unidad: [''],
    rangoMin: [''],
    rangoMax: [''],
    ubicacionId: [0],
    activo: [true]
  });

  readonly configForm = this.fb.nonNullable.group({
    deviceId: [0, [Validators.required, Validators.min(1)]],
    umbralFlow: [2, [Validators.required, Validators.min(0.01)]],
    ventanaMinutos: [30, [Validators.required, Validators.min(1), Validators.max(1440)]],
    presionMin: [''],
    presionMax: [''],
    autoCierre: [true],
    notificarEmail: [true],
    activo: [true]
  });

  readonly commandForm = this.fb.nonNullable.group({
    deviceId: [0, [Validators.required, Validators.min(1)]],
    tipo: ['SOLICITAR_ESTADO', [Validators.required]],
    prioridad: ['NORMAL', [Validators.required]],
    payload: [''],
    expiresAt: ['']
  });

  readonly stateForm = this.fb.nonNullable.group({
    deviceId: [0, [Validators.required, Validators.min(1)]],
    estado: ['NORMAL', [Validators.required]],
    motivo: [''],
    metadata: ['']
  });

  protected readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');
  protected readonly scenes = [
    { id: 'houses', label: 'Casas', detail: 'houses', icon: 'fa-solid fa-house' },
    { id: 'users', label: 'Usuarios', detail: 'users', icon: 'fa-solid fa-users' },
    { id: 'roles', label: 'Roles', detail: 'roles', icon: 'fa-solid fa-user-shield' },
    { id: 'userRoles', label: 'User roles', detail: 'user_roles', icon: 'fa-solid fa-id-badge' },
    { id: 'devices', label: 'Devices', detail: 'devices', icon: 'fa-solid fa-microchip' },
    { id: 'locations', label: 'Ubicaciones', detail: 'ubicacion_instalacion', icon: 'fa-solid fa-location-dot' },
    { id: 'sensors', label: 'Sensores', detail: 'sensores', icon: 'fa-solid fa-gauge-high' },
    { id: 'readings', label: 'Lecturas', detail: 'readings', icon: 'fa-solid fa-chart-simple' },
    { id: 'alerts', label: 'Alertas', detail: 'alerts', icon: 'fa-solid fa-triangle-exclamation' },
    { id: 'incidents', label: 'Incidentes', detail: 'incidente_fuga', icon: 'fa-solid fa-circle-exclamation' },
    { id: 'valves', label: 'Valvulas', detail: 'electrovalvulas', icon: 'fa-solid fa-water' },
    { id: 'valveActions', label: 'Acciones', detail: 'acciones_valvula', icon: 'fa-solid fa-list-check' },
    { id: 'detection', label: 'Deteccion', detail: 'configuracion_deteccion', icon: 'fa-solid fa-sliders' },
    { id: 'commands', label: 'Comandos', detail: 'comandos_remotos', icon: 'fa-solid fa-terminal' },
    { id: 'responses', label: 'Respuestas', detail: 'respuestas_comando', icon: 'fa-solid fa-reply' },
    { id: 'states', label: 'Estados', detail: 'estado_sistema', icon: 'fa-solid fa-signal' },
    { id: 'audit', label: 'Auditoria', detail: 'auditoria_sistema', icon: 'fa-solid fa-clipboard-check' }
  ] as const;

  readonly stats = computed(() => ({
    houses: this.houses().length,
    users: this.users().length,
    devices: this.devices().length,
    sensors: this.sensors().length,
    readings: this.readings().length,
    alerts: this.alerts().length,
    activeAlerts: this.alerts().filter((alert) => !alert.acknowledged).length,
    incidents: this.incidents().length,
    openIncidents: this.incidents().filter((inc) => inc.estado !== 'CERRADO').length,
    commands: this.commands().length,
    audit: this.audit().length
  }));

  readonly filteredHouses = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.houses().filter((house) =>
      this.matchesTerm(term, [house.name, house.code, house.address, house.owner_name, house.status])
    );
  });

  readonly filteredUsers = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.users().filter((user) =>
      this.matchesTerm(term, [user.nombre, user.email, user.role, user.House?.name])
    );
  });

  readonly filteredRoles = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.roles().filter((role) => this.matchesTerm(term, [role.code, role.nombre, role.descripcion]));
  });

  readonly filteredUserRoles = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.userRoles().filter((userRole) =>
      this.matchesTerm(term, [userRole.User?.nombre, userRole.User?.email, userRole.Role?.code, userRole.Role?.nombre])
    );
  });

  readonly filteredDevices = computed(() => {
    const term = this.query().trim().toLowerCase();
    const status = this.deviceStatusFilter();
    return this.devices().filter((device) => {
      const matchesStatus = status === 'ALL' || String(device.status || '').toUpperCase() === status;
      return matchesStatus && this.matchesTerm(term, [
        device.name,
        device.location,
        device.status,
        device.device_type,
        device.firmware_version,
        device.hardware_uid,
        device.House?.name
      ]);
    });
  });

  readonly filteredLocations = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.locations().filter((location) =>
      this.matchesTerm(term, [location.nombre, location.descripcion, location.area, location.piso, location.House?.name])
    );
  });

  readonly filteredSensors = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.sensors().filter((sensor) =>
      this.matchesTerm(term, [
        sensor.tipo,
        sensor.modelo,
        sensor.unidad,
        sensor.Device?.name,
        sensor.Device?.House?.name,
        sensor.ubicacion?.nombre,
        sensor.activo ? 'activo' : 'inactivo'
      ])
    );
  });

  readonly filteredReadings = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.readings().filter((reading) =>
      this.matchesTerm(term, [reading.state, reading.Device?.name, reading.Device?.House?.name, reading.sensor_id])
    );
  });

  readonly filteredAlerts = computed(() => {
    const term = this.query().trim().toLowerCase();
    const severity = this.alertSeverityFilter();
    const acknowledged = this.alertAcknowledgedFilter();
    return this.alerts().filter((alert) => {
      const matchesSeverity = severity === 'ALL' || alert.severity === severity;
      const matchesAck = acknowledged === 'ALL' || (acknowledged === 'ACK' ? alert.acknowledged : !alert.acknowledged);
      return matchesSeverity && matchesAck && this.matchesTerm(term, [
        alert.severity,
        alert.message,
        alert.Device?.name,
        alert.Device?.House?.name
      ]);
    });
  });

  readonly filteredIncidents = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.incidents().filter((incident) =>
      this.matchesTerm(term, [
        incident.estado,
        this.incidentSeverity(incident),
        this.incidentDescription(incident),
        incident.Device?.name,
        incident.Device?.House?.name
      ])
    );
  });

  readonly filteredValves = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.valves().filter((valve) =>
      this.matchesTerm(term, [valve.estado, valve.modo, valve.Device?.name, valve.Device?.House?.name])
    );
  });

  readonly filteredValveActions = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.valveActions().filter((action) =>
      this.matchesTerm(term, [
        action.tipo,
        action.origen,
        action.estado_resultado,
        action.detalle,
        action.Electrovalvula?.Device?.name,
        action.usuario?.nombre
      ])
    );
  });

  readonly filteredDetectionConfigs = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.detectionConfigs().filter((config) =>
      this.matchesTerm(term, [
        config.Device?.name,
        config.Device?.House?.name,
        config.activo ? 'activo' : 'inactivo',
        config.auto_cierre_valvula ? 'auto' : 'manual'
      ])
    );
  });

  readonly filteredCommands = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.commands().filter((command) =>
      this.matchesTerm(term, [
        command.tipo,
        command.estado,
        command.prioridad,
        command.Device?.name,
        command.Device?.House?.name,
        this.formatJson(command.payload)
      ])
    );
  });

  readonly filteredResponses = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.responses().filter((response) =>
      this.matchesTerm(term, [
        response.codigo_resultado,
        response.mensaje,
        response.ComandoRemoto?.tipo,
        response.ComandoRemoto?.Device?.name,
        this.formatJson(response.payload)
      ])
    );
  });

  readonly filteredStates = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.states().filter((state) =>
      this.matchesTerm(term, [
        state.estado,
        state.motivo,
        state.Device?.name,
        state.Device?.House?.name,
        this.formatJson(state.metadata)
      ])
    );
  });

  readonly filteredAudit = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.audit().filter((item) =>
      this.matchesTerm(term, [item.entidad, item.entidad_id, item.accion, item.User?.email, this.formatJson(item.detalle)])
    );
  });

  readonly paginatedHouses = computed(() => this.paginate(this.filteredHouses()));
  readonly paginatedUsers = computed(() => this.paginate(this.filteredUsers()));
  readonly paginatedRoles = computed(() => this.paginate(this.filteredRoles()));
  readonly paginatedUserRoles = computed(() => this.paginate(this.filteredUserRoles()));
  readonly paginatedDevices = computed(() => this.paginate(this.filteredDevices()));
  readonly paginatedLocations = computed(() => this.paginate(this.filteredLocations()));
  readonly paginatedSensors = computed(() => this.paginate(this.filteredSensors()));
  readonly paginatedReadings = computed(() => this.paginate(this.filteredReadings()));
  readonly paginatedAlerts = computed(() => this.paginate(this.filteredAlerts()));
  readonly paginatedIncidents = computed(() => this.paginate(this.filteredIncidents()));
  readonly paginatedValves = computed(() => this.paginate(this.filteredValves()));
  readonly paginatedValveActions = computed(() => this.paginate(this.filteredValveActions()));
  readonly paginatedDetectionConfigs = computed(() => this.paginate(this.filteredDetectionConfigs()));
  readonly paginatedCommands = computed(() => this.paginate(this.filteredCommands()));
  readonly paginatedResponses = computed(() => this.paginate(this.filteredResponses()));
  readonly paginatedStates = computed(() => this.paginate(this.filteredStates()));
  readonly paginatedAudit = computed(() => this.paginate(this.filteredAudit()));

  readonly pageItems = computed(() => this.currentPageItems());
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.currentCollectionSize() / this.pageSize)));

  readonly detailTitle = computed(() => {
    if (this.selectedDevice()) return this.selectedDevice()!.name;
    if (this.selectedAlert()) return `${this.selectedAlert()!.severity} #${this.selectedAlert()!.id}`;
    if (this.selectedIncident()) return `${this.incidentSeverity(this.selectedIncident()!)} #${this.selectedIncident()!.id}`;
    if (this.selectedValve()) return `Valvula #${this.selectedValve()!.id}`;
    if (this.selectedCommand()) return `Comando #${this.selectedCommand()!.id}`;
    if (this.selectedAudit()) return `${this.selectedAudit()!.entidad} #${this.selectedAudit()!.id}`;
    return 'Sin seleccion';
  });

  readonly detailType = computed<DetailType>(() => {
    if (this.selectedDevice()) return 'device';
    if (this.selectedAlert()) return 'alert';
    if (this.selectedIncident()) return 'incident';
    if (this.selectedValve()) return 'valve';
    if (this.selectedCommand()) return 'command';
    if (this.selectedAudit()) return 'audit';
    return null;
  });

  constructor() {
    void this.load();
  }

  protected setScene(scene: Scene) {
    this.activeScene.set(scene);
    this.page.set(1);
    this.clearSelection();
  }

  protected updateQuery(value: string) {
    this.query.set(value);
    this.page.set(1);
  }

  protected setDeviceStatusFilterFromInput(value: string) {
    this.deviceStatusFilter.set(value as DeviceStatusFilter);
    this.page.set(1);
  }

  protected setAlertSeverityFilterFromInput(value: string) {
    this.alertSeverityFilter.set(value as AlertSeverityFilter);
    this.page.set(1);
  }

  protected setAlertAcknowledgedFilterFromInput(value: string) {
    this.alertAcknowledgedFilter.set(value as AlertAcknowledgedFilter);
    this.page.set(1);
  }

  protected nextPage() {
    this.page.update((page) => Math.min(this.totalPages(), page + 1));
  }

  protected previousPage() {
    this.page.update((page) => Math.max(1, page - 1));
  }

  protected selectDevice(device: Device) {
    this.selectedDevice.set(device);
    this.selectedAlert.set(null);
    this.selectedIncident.set(null);
    this.selectedValve.set(null);
    this.selectedCommand.set(null);
    this.selectedAudit.set(null);
  }

  protected selectAlert(alert: AlertItem) {
    this.clearSelection();
    this.selectedAlert.set(alert);
  }

  protected selectIncident(incident: Incident) {
    this.clearSelection();
    this.selectedIncident.set(incident);
  }

  protected selectValve(valve: Valve) {
    this.clearSelection();
    this.selectedValve.set(valve);
  }

  protected selectCommand(command: CommandItem) {
    this.clearSelection();
    this.selectedCommand.set(command);
  }

  protected selectAudit(item: AuditItem) {
    this.clearSelection();
    this.selectedAudit.set(item);
  }

  protected clearSelection() {
    this.selectedDevice.set(null);
    this.selectedAlert.set(null);
    this.selectedIncident.set(null);
    this.selectedValve.set(null);
    this.selectedCommand.set(null);
    this.selectedAudit.set(null);
  }

  protected async submitHouse() {
    if (this.houseForm.invalid) {
      this.houseForm.markAllAsTouched();
      this.message.set('Revisa los campos de la casa antes de guardar.');
      return;
    }

    const raw = this.houseForm.getRawValue();
    const body = {
      name: raw.name.trim(),
      address: raw.address.trim(),
      owner_name: raw.owner_name.trim(),
      contact_phone: raw.contact_phone.trim(),
      status: raw.status
    };

    await this.runBusy(async () => {
      if (raw.id) {
        await firstValueFrom(this.api.put(`/api/houses/${raw.id}`, body));
        this.message.set('Casa actualizada correctamente.');
      } else {
        await firstValueFrom(this.api.post('/api/houses', body));
        this.message.set('Casa creada correctamente.');
      }
      this.closeHouseModal();
      await this.load(false);
    });
  }

  protected async submitUser() {
    const raw = this.userForm.getRawValue();
    const isEditing = Boolean(raw.id);
    const password = raw.password.trim();
    if (this.userForm.invalid || (!isEditing && password.length < 6) || (isEditing && password && password.length < 6)) {
      this.userForm.markAllAsTouched();
      this.message.set('Revisa los datos del usuario. La clave debe tener minimo 6 caracteres.');
      return;
    }

    const body: Record<string, unknown> = {
      nombre: raw.nombre.trim(),
      email: raw.email.trim(),
      role: raw.role
    };
    if (password) body['password'] = password;
    if (raw.houseId) body['houseId'] = raw.houseId;

    await this.runBusy(async () => {
      if (isEditing) {
        await firstValueFrom(this.api.put(`/api/users/${raw.id}`, body));
        this.message.set('Usuario actualizado correctamente.');
      } else {
        await firstValueFrom(this.api.post('/api/users', body));
        this.message.set('Usuario creado correctamente.');
      }
      this.closeUserModal();
      await this.load(false);
    });
  }

  protected async submitRole() {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      this.message.set('Revisa los campos del rol antes de guardar.');
      return;
    }

    const raw = this.roleForm.getRawValue();
    const body = {
      code: raw.code.trim().toLowerCase(),
      nombre: raw.nombre.trim(),
      descripcion: raw.descripcion.trim() || null
    };

    await this.runBusy(async () => {
      if (raw.id) {
        await firstValueFrom(this.api.put(`/api/roles/${raw.id}`, body));
        this.message.set('Rol actualizado correctamente.');
      } else {
        await firstValueFrom(this.api.post('/api/roles', body));
        this.message.set('Rol creado correctamente.');
      }
      this.closeRoleModal();
      await this.load(false);
    });
  }

  protected async submitUserRole() {
    if (this.userRoleForm.invalid) {
      this.userRoleForm.markAllAsTouched();
      this.message.set('Selecciona usuario y rol para crear la asignacion.');
      return;
    }

    const raw = this.userRoleForm.getRawValue();
    await this.runBusy(async () => {
      await firstValueFrom(this.api.post('/api/user-roles', raw));
      this.message.set('Rol asignado al usuario.');
      this.showUserRoleModal.set(false);
      this.resetUserRoleForm();
      await this.load(false);
    });
  }

  protected async submitDevice() {
    if (this.deviceForm.invalid) {
      this.deviceForm.markAllAsTouched();
      this.message.set('Completa el formulario del dispositivo para continuar.');
      return;
    }

    const raw = this.deviceForm.getRawValue();
    const body: Record<string, unknown> = {
      name: raw.name.trim(),
      houseId: raw.houseId ?? undefined,
      location: raw.location.trim(),
      status: raw.status,
      deviceType: raw.deviceType.trim() || undefined,
      firmwareVersion: raw.firmwareVersion.trim() || undefined,
      hardwareUid: raw.hardwareUid.trim() || undefined
    };

    await this.runBusy(async () => {
      if (raw.id) {
        await firstValueFrom(this.api.put(`/api/devices/${raw.id}`, body));
        this.message.set('Dispositivo actualizado correctamente.');
      } else {
        await firstValueFrom(this.api.post('/api/devices', body));
        this.message.set('Dispositivo creado correctamente.');
      }
      this.closeDeviceModal();
      await this.load(false);
    });
  }

  protected async submitLocation() {
    if (this.locationForm.invalid) {
      this.locationForm.markAllAsTouched();
      this.message.set('Completa los datos de la ubicacion.');
      return;
    }

    const raw = this.locationForm.getRawValue();
    const body = {
      houseId: raw.houseId,
      nombre: raw.nombre.trim(),
      descripcion: raw.descripcion.trim() || null,
      area: raw.area.trim() || null,
      piso: raw.piso.trim() || null
    };

    await this.runBusy(async () => {
      if (raw.id) {
        await firstValueFrom(this.api.put(`/api/locations/${raw.id}`, body));
        this.message.set('Ubicacion actualizada correctamente.');
      } else {
        await firstValueFrom(this.api.post('/api/locations', body));
        this.message.set('Ubicacion creada correctamente.');
      }
      this.closeLocationModal();
      await this.load(false);
    });
  }

  protected async submitSensor() {
    if (this.sensorForm.invalid) {
      this.sensorForm.markAllAsTouched();
      this.message.set('Completa los datos del sensor.');
      return;
    }

    const raw = this.sensorForm.getRawValue();
    const body: Record<string, unknown> = {
      tipo: raw.tipo,
      modelo: raw.modelo.trim() || undefined,
      unidad: raw.unidad.trim() || undefined,
      rango_min: this.numberOrUndefined(raw.rangoMin),
      rango_max: this.numberOrUndefined(raw.rangoMax),
      ubicacionId: raw.ubicacionId || undefined,
      activo: raw.activo
    };
    if (!raw.id) body['deviceId'] = raw.deviceId;

    await this.runBusy(async () => {
      if (raw.id) {
        await firstValueFrom(this.api.put(`/api/sensors/${raw.id}`, body));
        this.message.set('Sensor actualizado correctamente.');
      } else {
        await firstValueFrom(this.api.post('/api/sensors', body));
        this.message.set('Sensor creado correctamente.');
      }
      this.closeSensorModal();
      await this.load(false);
    });
  }

  protected async submitConfig() {
    if (this.configForm.invalid) {
      this.configForm.markAllAsTouched();
      this.message.set('Revisa la configuracion de deteccion.');
      return;
    }

    const raw = this.configForm.getRawValue();
    const body = {
      umbral_flow_lmin: Number(raw.umbralFlow),
      ventana_minutos: Number(raw.ventanaMinutos),
      umbral_presion_min_kpa: this.numberOrNull(raw.presionMin),
      umbral_presion_max_kpa: this.numberOrNull(raw.presionMax),
      auto_cierre_valvula: raw.autoCierre,
      notificar_email: raw.notificarEmail,
      activo: raw.activo
    };

    await this.runBusy(async () => {
      await firstValueFrom(this.api.put(`/api/detection-config/${raw.deviceId}`, body));
      this.message.set('Configuracion de deteccion actualizada.');
      this.closeConfigModal();
      await this.load(false);
    });
  }

  protected async submitCommand() {
    if (this.commandForm.invalid) {
      this.commandForm.markAllAsTouched();
      this.message.set('Selecciona dispositivo, tipo y prioridad para enviar el comando.');
      return;
    }

    const raw = this.commandForm.getRawValue();
    const payload = this.parseJsonOrNull(raw.payload, 'payload');
    if (!payload.ok) return;

    const body: Record<string, unknown> = {
      deviceId: raw.deviceId,
      tipo: raw.tipo,
      prioridad: raw.prioridad,
      payload: payload.value
    };
    if (raw.expiresAt) body['expiresAt'] = new Date(raw.expiresAt).toISOString();

    await this.runBusy(async () => {
      await firstValueFrom(this.api.post('/api/commands', body));
      this.message.set('Comando remoto encolado correctamente.');
      this.showCommandModal.set(false);
      this.resetCommandForm();
      await this.load(false);
    });
  }

  protected async submitState() {
    if (this.stateForm.invalid) {
      this.stateForm.markAllAsTouched();
      this.message.set('Selecciona dispositivo y estado para registrar el evento.');
      return;
    }

    const raw = this.stateForm.getRawValue();
    const metadata = this.parseJsonOrNull(raw.metadata, 'metadata');
    if (!metadata.ok) return;

    const body = {
      deviceId: raw.deviceId,
      estado: raw.estado,
      motivo: raw.motivo.trim() || null,
      metadata: metadata.value
    };

    await this.runBusy(async () => {
      await firstValueFrom(this.api.post('/api/system-states', body));
      this.message.set('Estado del sistema registrado.');
      this.showStateModal.set(false);
      this.resetStateForm();
      await this.load(false);
    });
  }

  protected editHouse(house: House) {
    this.editingHouse.set(house);
    this.houseForm.setValue({
      id: house.id,
      name: house.name,
      address: house.address || '',
      owner_name: house.owner_name || '',
      contact_phone: house.contact_phone || '',
      status: house.status || 'ACTIVA'
    });
    this.showHouseModal.set(true);
  }

  protected editUser(user: User) {
    this.editingUser.set(user);
    this.userForm.setValue({
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      password: '',
      houseId: user.house_id || 0,
      role: user.role || 'resident'
    });
    this.showUserModal.set(true);
  }

  protected editRole(role: Role) {
    this.editingRole.set(role);
    this.roleForm.setValue({
      id: role.id,
      code: role.code,
      nombre: role.nombre,
      descripcion: role.descripcion || ''
    });
    this.showRoleModal.set(true);
  }

  protected editDevice(device: Device) {
    this.editingDevice.set(device);
    this.selectDevice(device);
    this.deviceForm.setValue({
      id: device.id,
      name: device.name,
      houseId: device.House?.id || device.house_id || null,
      location: device.location || '',
      status: device.status || 'ACTIVO',
      deviceType: device.device_type || '',
      firmwareVersion: device.firmware_version || '',
      hardwareUid: device.hardware_uid || ''
    });
    this.showDeviceModal.set(true);
  }

  protected editLocation(location: LocationItem) {
    this.editingLocation.set(location);
    this.locationForm.setValue({
      id: location.id,
      houseId: location.house_id,
      nombre: location.nombre,
      descripcion: location.descripcion || '',
      area: location.area || '',
      piso: location.piso || ''
    });
    this.showLocationModal.set(true);
  }

  protected editSensor(sensor: SensorItem) {
    this.editingSensor.set(sensor);
    this.sensorForm.setValue({
      id: sensor.id,
      deviceId: sensor.device_id,
      tipo: sensor.tipo,
      modelo: sensor.modelo || '',
      unidad: sensor.unidad || '',
      rangoMin: sensor.rango_min == null ? '' : String(sensor.rango_min),
      rangoMax: sensor.rango_max == null ? '' : String(sensor.rango_max),
      ubicacionId: sensor.ubicacion_id || 0,
      activo: sensor.activo
    });
    this.showSensorModal.set(true);
  }

  protected editConfig(config: DetectionConfig) {
    this.editingConfig.set(config);
    this.configForm.setValue({
      deviceId: config.device_id,
      umbralFlow: config.umbral_flow_lmin,
      ventanaMinutos: config.ventana_minutos,
      presionMin: config.umbral_presion_min_kpa == null ? '' : String(config.umbral_presion_min_kpa),
      presionMax: config.umbral_presion_max_kpa == null ? '' : String(config.umbral_presion_max_kpa),
      autoCierre: config.auto_cierre_valvula,
      notificarEmail: config.notificar_email,
      activo: config.activo
    });
    this.showConfigModal.set(true);
  }

  protected async deleteHouse(house: House) {
    const confirmed = await this.confirmDanger('Eliminar casa', `Eliminar la casa ${house.name}? Esta accion no se puede deshacer.`);
    if (!confirmed) return;
    await this.runBusy(async () => {
      await firstValueFrom(this.api.delete(`/api/houses/${house.id}`));
      this.message.set('Casa eliminada correctamente.');
      await this.load(false);
    });
  }

  protected async deleteUser(user: User) {
    const confirmed = await this.confirmDanger('Eliminar usuario', `Eliminar el usuario ${user.nombre}?`);
    if (!confirmed) return;
    await this.runBusy(async () => {
      await firstValueFrom(this.api.delete(`/api/users/${user.id}`));
      this.message.set('Usuario eliminado correctamente.');
      await this.load(false);
    });
  }

  protected async deleteRole(role: Role) {
    const confirmed = await this.confirmDanger('Eliminar rol', `Eliminar el rol ${role.nombre}?`);
    if (!confirmed) return;
    await this.runBusy(async () => {
      await firstValueFrom(this.api.delete(`/api/roles/${role.id}`));
      this.message.set('Rol eliminado correctamente.');
      await this.load(false);
    });
  }

  protected async deleteUserRole(userRole: UserRole) {
    const confirmed = await this.confirmDanger('Quitar rol', 'Quitar esta asignacion de rol?');
    if (!confirmed) return;
    await this.runBusy(async () => {
      await firstValueFrom(this.api.delete(`/api/user-roles/${userRole.user_id}/${userRole.role_id}`));
      this.message.set('Asignacion de rol eliminada.');
      await this.load(false);
    });
  }

  protected async deleteDevice(device: Device) {
    const confirmed = await this.confirmDanger('Eliminar dispositivo', `Eliminar el dispositivo ${device.name}?`);
    if (!confirmed) return;
    await this.runBusy(async () => {
      await firstValueFrom(this.api.delete(`/api/devices/${device.id}`));
      this.message.set('Dispositivo eliminado correctamente.');
      await this.load(false);
    });
  }

  protected async deleteLocation(location: LocationItem) {
    const confirmed = await this.confirmDanger('Eliminar ubicacion', `Eliminar la ubicacion ${location.nombre}?`);
    if (!confirmed) return;
    await this.runBusy(async () => {
      await firstValueFrom(this.api.delete(`/api/locations/${location.id}`));
      this.message.set('Ubicacion eliminada correctamente.');
      await this.load(false);
    });
  }

  protected async deleteSensor(sensor: SensorItem) {
    const confirmed = await this.confirmDanger('Eliminar sensor', `Eliminar el sensor #${sensor.id}?`);
    if (!confirmed) return;
    await this.runBusy(async () => {
      await firstValueFrom(this.api.delete(`/api/sensors/${sensor.id}`));
      this.message.set('Sensor eliminado correctamente.');
      await this.load(false);
    });
  }

  protected async updateIncidentStatus(incident: Incident, status: string) {
    await this.runBusy(async () => {
      const response = await firstValueFrom(
        this.api.patch<{ incidente: Incident }>(`/api/incidents/${incident.id}/status`, { estado: status })
      );
      this.message.set(`Incidente #${incident.id} actualizado a ${status}.`);
      await this.load(false);
      this.selectedIncident.set(response.incidente || { ...incident, estado: status });
    });
  }

  protected async acknowledgeAlert(alert: AlertItem) {
    await this.runBusy(async () => {
      await firstValueFrom(this.api.patch(`/api/alerts/${alert.id}/ack`, {}));
      this.message.set(`Alerta #${alert.id} confirmada correctamente.`);
      await this.load(false);
      this.selectedAlert.update((selected) =>
        selected && selected.id === alert.id ? { ...selected, acknowledged: true, ack_at: new Date().toISOString() } : selected
      );
    });
  }

  protected async valveAction(device: Device, action: string) {
    const body: { tipo: string; modo?: ValveMode } = { tipo: action };
    if (action === 'CAMBIAR_MODO') {
      const mode = window.prompt('Modo de valvula: AUTO, MANUAL o BLOQUEADA', 'AUTO')?.trim().toUpperCase();
      if (!mode) return;
      if (mode !== 'AUTO' && mode !== 'MANUAL' && mode !== 'BLOQUEADA') {
        this.message.set('Modo invalido. Usa AUTO, MANUAL o BLOQUEADA.');
        return;
      }
      body.modo = mode;
    }

    await this.runBusy(async () => {
      await firstValueFrom(this.api.post(`/api/valves/device/${device.id}/actions`, body));
      this.message.set(`Accion ${action} enviada al dispositivo ${device.name}.`);
      await this.load(false);
    });
  }

  protected async valveActionFromValve(valve: Valve, action: string) {
    const device = valve.Device || this.devices().find((item) => item.id === valve.device_id);
    if (!device) {
      this.message.set('No encontre el dispositivo asociado a esta valvula.');
      return;
    }
    await this.valveAction(device, action);
  }

  protected async rotateCredential(device: Device) {
    await this.runBusy(async () => {
      const response = await firstValueFrom(
        this.api.post<{ generatedApiKey: string }>(`/api/devices/${device.id}/credentials`, {})
      );
      this.deviceCredential.set({ name: device.name, apiKey: response.generatedApiKey });
      this.message.set(`Credencial renovada para ${device.name}. Guardala en el firmware.`);
      this.selectDevice(device);
      await this.load(false);
    });
  }

  protected openCreateHouseModal() {
    this.resetHouseForm();
    this.showHouseModal.set(true);
  }

  protected openCreateUserModal() {
    this.resetUserForm();
    this.showUserModal.set(true);
  }

  protected openCreateRoleModal() {
    this.resetRoleForm();
    this.showRoleModal.set(true);
  }

  protected openCreateUserRoleModal() {
    this.resetUserRoleForm();
    this.showUserRoleModal.set(true);
  }

  protected openCreateDeviceModal() {
    this.resetDeviceForm();
    this.showDeviceModal.set(true);
  }

  protected openCreateLocationModal() {
    this.resetLocationForm();
    this.showLocationModal.set(true);
  }

  protected openCreateSensorModal() {
    this.resetSensorForm();
    this.showSensorModal.set(true);
  }

  protected openCreateCommandModal() {
    this.resetCommandForm();
    this.showCommandModal.set(true);
  }

  protected openCreateStateModal() {
    this.resetStateForm();
    this.showStateModal.set(true);
  }

  protected closeHouseModal() {
    this.showHouseModal.set(false);
    this.editingHouse.set(null);
  }

  protected closeUserModal() {
    this.showUserModal.set(false);
    this.editingUser.set(null);
  }

  protected closeRoleModal() {
    this.showRoleModal.set(false);
    this.editingRole.set(null);
  }

  protected closeDeviceModal() {
    this.showDeviceModal.set(false);
    this.editingDevice.set(null);
  }

  protected closeLocationModal() {
    this.showLocationModal.set(false);
    this.editingLocation.set(null);
  }

  protected closeSensorModal() {
    this.showSensorModal.set(false);
    this.editingSensor.set(null);
  }

  protected closeConfigModal() {
    this.showConfigModal.set(false);
    this.editingConfig.set(null);
  }

  protected resetHouseForm() {
    this.houseForm.reset({
      id: 0,
      name: '',
      address: '',
      owner_name: '',
      contact_phone: '',
      status: 'ACTIVA'
    });
  }

  protected resetUserForm() {
    this.userForm.reset({
      id: 0,
      nombre: '',
      email: '',
      password: '',
      houseId: 0,
      role: 'resident'
    });
  }

  protected resetRoleForm() {
    this.roleForm.reset({
      id: 0,
      code: '',
      nombre: '',
      descripcion: ''
    });
  }

  protected resetUserRoleForm() {
    this.userRoleForm.reset({ userId: 0, roleId: 0 });
  }

  protected resetDeviceForm() {
    this.deviceForm.reset({
      id: 0,
      name: '',
      houseId: null,
      location: '',
      status: 'ACTIVO',
      deviceType: '',
      firmwareVersion: '',
      hardwareUid: ''
    });
  }

  protected resetLocationForm() {
    this.locationForm.reset({
      id: 0,
      houseId: this.houses()[0]?.id || 0,
      nombre: '',
      descripcion: '',
      area: '',
      piso: ''
    });
  }

  protected resetSensorForm() {
    this.sensorForm.reset({
      id: 0,
      deviceId: this.devices()[0]?.id || 0,
      tipo: 'caudal',
      modelo: '',
      unidad: '',
      rangoMin: '',
      rangoMax: '',
      ubicacionId: 0,
      activo: true
    });
  }

  protected resetCommandForm() {
    this.commandForm.reset({
      deviceId: this.devices()[0]?.id || 0,
      tipo: 'SOLICITAR_ESTADO',
      prioridad: 'NORMAL',
      payload: '',
      expiresAt: ''
    });
  }

  protected resetStateForm() {
    this.stateForm.reset({
      deviceId: this.devices()[0]?.id || 0,
      estado: 'NORMAL',
      motivo: '',
      metadata: ''
    });
  }

  protected readonly trackById = (_index: number, item: { id: number }) => item.id;
  protected readonly trackByUserRole = (_index: number, item: UserRole) => `${item.user_id}:${item.role_id}`;

  protected incidentSeverity(incident: Incident) {
    if (incident.estado === 'ABIERTO' || incident.estado === 'CONFIRMADO') return 'FUGA';
    if (incident.estado === 'FALSO_POSITIVO') return 'ALERTA';
    return 'NORMAL';
  }

  protected incidentDescription(incident: Incident) {
    if (incident.observaciones) return incident.observaciones;

    const flow = incident.flow_promedio_lmin;
    const duration = incident.duracion_minutos;
    const volume = incident.volumen_estimado_l;
    const parts = [
      flow !== undefined && flow !== null ? `Flujo promedio ${Number(flow).toFixed(2)} L/min` : null,
      duration !== undefined && duration !== null ? `${duration} min` : null,
      volume !== undefined && volume !== null ? `${Number(volume).toFixed(1)} L estimados` : null
    ].filter(Boolean);

    return parts.length ? parts.join(' | ') : 'Incidente de fuga registrado por el sistema.';
  }

  protected incidentResolvedAt(incident: Incident) {
    return incident.ended_at || incident.resuelto_at || null;
  }

  protected formatJson(value: unknown) {
    if (value === undefined || value === null || value === '') return 'n/d';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  protected deviceName(deviceId: number | null | undefined) {
    if (!deviceId) return 'Sin dispositivo';
    return this.devices().find((device) => device.id === Number(deviceId))?.name || `Device #${deviceId}`;
  }

  protected houseName(houseId: number | null | undefined) {
    if (!houseId) return 'Sin casa';
    return this.houses().find((house) => house.id === Number(houseId))?.name || `Casa #${houseId}`;
  }

  protected locationName(locationId: number | null | undefined) {
    if (!locationId) return 'Sin ubicacion';
    return this.locations().find((location) => location.id === Number(locationId))?.nombre || `Ubicacion #${locationId}`;
  }

  private async load(showMessage = true) {
    if (this.auth.currentUser()?.role !== 'admin') {
      this.message.set('Tu cuenta no tiene permisos de administracion.');
      this.toast.warning('Tu cuenta no tiene permisos de administracion.');
      return;
    }

    await this.runBusy(async () => {
      const [
        houses,
        users,
        roles,
        userRoles,
        devices,
        locations,
        sensors,
        readings,
        alerts,
        incidents,
        valves,
        valveActions,
        commands,
        responses,
        states,
        audit
      ] = await Promise.all([
        firstValueFrom(this.api.get<{ houses: House[] }>('/api/houses')),
        firstValueFrom(this.api.get<{ users: User[] }>('/api/users')),
        firstValueFrom(this.api.get<{ roles: Role[] }>('/api/roles')),
        firstValueFrom(this.api.get<{ userRoles: UserRole[] }>('/api/user-roles')),
        firstValueFrom(this.api.get<{ devices: Device[] }>('/api/devices', { limit: 200 })),
        firstValueFrom(this.api.get<{ ubicaciones: LocationItem[] }>('/api/locations', { limit: 200 })),
        firstValueFrom(this.api.get<{ sensores: SensorItem[] }>('/api/sensors', { limit: 200 })),
        firstValueFrom(this.api.get<{ readings: Reading[] }>('/api/readings', { limit: 200 })),
        firstValueFrom(this.api.get<{ alerts: AlertItem[] }>('/api/alerts', { limit: 200 })),
        firstValueFrom(this.api.get<{ incidentes?: Incident[]; incidents?: Incident[] }>('/api/incidents', { limit: 200 })),
        firstValueFrom(this.api.get<{ valvulas: Valve[] }>('/api/valves', { limit: 200 })),
        firstValueFrom(this.api.get<{ acciones: ValveAction[] }>('/api/valves/actions', { limit: 200 })),
        firstValueFrom(this.api.get<{ comandos: CommandItem[] }>('/api/commands', { limit: 200 })),
        firstValueFrom(this.api.get<{ respuestas: CommandResponse[] }>('/api/commands/responses', { limit: 200 })),
        firstValueFrom(this.api.get<{ estados: SystemState[] }>('/api/system-states', { limit: 200 })),
        firstValueFrom(this.api.get<{ auditoria: AuditItem[] }>('/api/audit', { limit: 200 }))
      ]);

      const deviceList = devices.devices || [];
      const configs = await Promise.all(
        deviceList.map(async (device) => {
          const response = await firstValueFrom(
            this.api.get<{ config: DetectionConfig }>(`/api/detection-config/${device.id}`)
          );
          return { ...response.config, Device: device };
        })
      );

      this.houses.set(houses.houses || []);
      this.users.set(users.users || []);
      this.roles.set(roles.roles || []);
      this.userRoles.set(userRoles.userRoles || []);
      this.devices.set(deviceList);
      this.locations.set(locations.ubicaciones || []);
      this.sensors.set(sensors.sensores || []);
      this.readings.set(readings.readings || []);
      this.alerts.set(alerts.alerts || []);
      this.incidents.set(incidents.incidentes || incidents.incidents || []);
      this.valves.set(valves.valvulas || []);
      this.valveActions.set(valveActions.acciones || []);
      this.detectionConfigs.set(configs);
      this.commands.set(commands.comandos || []);
      this.responses.set(responses.respuestas || []);
      this.states.set(states.estados || []);
      this.audit.set(audit.auditoria || []);
      this.page.set(Math.min(this.page(), this.totalPages()));
      if (showMessage) {
        this.message.set('Consola sincronizada con todas las tablas principales del backend.');
      }
    });
  }

  private matchesTerm(term: string, values: Array<string | number | boolean | null | undefined>) {
    if (!term) return true;
    return values.some((value) => String(value ?? '').toLowerCase().includes(term));
  }

  private paginate<T>(items: T[]) {
    const page = this.page();
    const start = (page - 1) * this.pageSize;
    return items.slice(start, start + this.pageSize);
  }

  private currentPageItems() {
    switch (this.activeScene()) {
      case 'houses': return this.paginatedHouses().length;
      case 'users': return this.paginatedUsers().length;
      case 'roles': return this.paginatedRoles().length;
      case 'userRoles': return this.paginatedUserRoles().length;
      case 'devices': return this.paginatedDevices().length;
      case 'locations': return this.paginatedLocations().length;
      case 'sensors': return this.paginatedSensors().length;
      case 'readings': return this.paginatedReadings().length;
      case 'alerts': return this.paginatedAlerts().length;
      case 'incidents': return this.paginatedIncidents().length;
      case 'valves': return this.paginatedValves().length;
      case 'valveActions': return this.paginatedValveActions().length;
      case 'detection': return this.paginatedDetectionConfigs().length;
      case 'commands': return this.paginatedCommands().length;
      case 'responses': return this.paginatedResponses().length;
      case 'states': return this.paginatedStates().length;
      case 'audit': return this.paginatedAudit().length;
    }
  }

  private currentCollectionSize() {
    switch (this.activeScene()) {
      case 'houses': return this.filteredHouses().length;
      case 'users': return this.filteredUsers().length;
      case 'roles': return this.filteredRoles().length;
      case 'userRoles': return this.filteredUserRoles().length;
      case 'devices': return this.filteredDevices().length;
      case 'locations': return this.filteredLocations().length;
      case 'sensors': return this.filteredSensors().length;
      case 'readings': return this.filteredReadings().length;
      case 'alerts': return this.filteredAlerts().length;
      case 'incidents': return this.filteredIncidents().length;
      case 'valves': return this.filteredValves().length;
      case 'valveActions': return this.filteredValveActions().length;
      case 'detection': return this.filteredDetectionConfigs().length;
      case 'commands': return this.filteredCommands().length;
      case 'responses': return this.filteredResponses().length;
      case 'states': return this.filteredStates().length;
      case 'audit': return this.filteredAudit().length;
    }
  }

  private numberOrUndefined(value: string) {
    if (value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private numberOrNull(value: string) {
    if (value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseJsonOrNull(raw: string, label: string): { ok: true; value: unknown } | { ok: false; value: null } {
    const value = raw.trim();
    if (!value) return { ok: true, value: null };
    try {
      return { ok: true, value: JSON.parse(value) as unknown };
    } catch {
      this.message.set(`${label} debe ser JSON valido.`);
      return { ok: false, value: null };
    }
  }

  private async runBusy(task: () => Promise<void>) {
    this.busy.set(true);
    const previousMessage = this.message();
    try {
      await task();
      const currentMessage = this.message();
      if (currentMessage && currentMessage !== previousMessage) {
        this.toast.success(currentMessage);
      }
    } catch (error) {
      const message = resolveErrorMessage(error, 'No fue posible completar la operacion administrativa.');
      this.message.set(message);
      this.toast.error(message);
    } finally {
      this.busy.set(false);
    }
  }

  private confirmDanger(title: string, message: string) {
    return this.confirm.confirm({
      title,
      message,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      tone: 'danger'
    });
  }
}
