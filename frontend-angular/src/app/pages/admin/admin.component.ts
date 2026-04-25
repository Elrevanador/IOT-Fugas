import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
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

interface Device {
  id: number;
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

interface AlertItem {
  id: number;
  ts: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  ack_at?: string | null;
  Device?: {
    id: number;
    name: string;
    house_id: number | null;
    House?: House | null;
  } | null;
}

type Scene = 'houses' | 'users' | 'devices' | 'alerts';
type DeviceStatusFilter = 'ALL' | 'ACTIVO' | 'NORMAL' | 'ALERTA' | 'FUGA' | 'ERROR' | 'INACTIVO' | 'MANTENIMIENTO';
type AlertSeverityFilter = 'ALL' | 'ALERTA' | 'FUGA' | 'ERROR';
type AlertAcknowledgedFilter = 'ALL' | 'PENDING' | 'ACK';

@Component({
  selector: 'app-admin',
  imports: [CommonModule, ReactiveFormsModule, ModalComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly pageSize = 6;
  readonly auth = inject(AuthService);

  readonly houses = signal<House[]>([]);
  readonly users = signal<User[]>([]);
  readonly devices = signal<Device[]>([]);
  readonly alerts = signal<AlertItem[]>([]);
  readonly busy = signal(false);
  readonly activeScene = signal<Scene>('houses');
  readonly query = signal('');
  readonly page = signal(1);
  readonly deviceStatusFilter = signal<DeviceStatusFilter>('ALL');
  readonly alertSeverityFilter = signal<AlertSeverityFilter>('ALL');
  readonly alertAcknowledgedFilter = signal<AlertAcknowledgedFilter>('ALL');
  readonly selectedDevice = signal<Device | null>(null);
  readonly selectedAlert = signal<AlertItem | null>(null);
  readonly deviceCredential = signal<{ name: string; apiKey: string } | null>(null);
  readonly message = signal('Cargando consola administrativa...');

  // Modal states
  readonly showHouseModal = signal(false);
  readonly showUserModal = signal(false);
  readonly showDeviceModal = signal(false);

  readonly stats = computed(() => ({
    houses: this.houses().length,
    users: this.users().length,
    devices: this.devices().length,
    alerts: this.alerts().length,
    activeAlerts: this.alerts().filter((alert) => !alert.acknowledged).length
  }));

  readonly filteredHouses = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) return this.houses();
    return this.houses().filter((house) =>
      [house.name, house.code, house.address || '', house.owner_name || ''].some((value) =>
        value.toLowerCase().includes(term)
      )
    );
  });

  readonly filteredUsers = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) return this.users();
    return this.users().filter((user) =>
      [user.nombre, user.email, user.role, user.House?.name || ''].some((value) =>
        value.toLowerCase().includes(term)
      )
    );
  });

  readonly filteredDevices = computed(() => {
    const term = this.query().trim().toLowerCase();
    const status = this.deviceStatusFilter();
    return this.devices().filter((device) => {
      const matchesTerm =
        !term ||
        [
          device.name,
          device.location || '',
          device.status || '',
          device.device_type || '',
          device.House?.name || ''
        ].some((value) => value.toLowerCase().includes(term));
      const matchesStatus = status === 'ALL' || String(device.status || '').toUpperCase() === status;
      return matchesTerm && matchesStatus;
    });
  });

  readonly filteredAlerts = computed(() => {
    const term = this.query().trim().toLowerCase();
    const severity = this.alertSeverityFilter();
    const acknowledged = this.alertAcknowledgedFilter();
    return this.alerts().filter((alert) => {
      const matchesTerm =
        !term ||
        [alert.severity, alert.message, alert.Device?.name || '', alert.Device?.House?.name || ''].some((value) =>
          value.toLowerCase().includes(term)
        );
      const matchesSeverity = severity === 'ALL' || alert.severity === severity;
      const matchesAck =
        acknowledged === 'ALL' || (acknowledged === 'ACK' ? alert.acknowledged : !alert.acknowledged);
      return matchesTerm && matchesSeverity && matchesAck;
    });
  });

  readonly paginatedHouses = computed(() => this.paginate(this.filteredHouses()));
  readonly paginatedUsers = computed(() => this.paginate(this.filteredUsers()));
  readonly paginatedDevices = computed(() => this.paginate(this.filteredDevices()));
  readonly paginatedAlerts = computed(() => this.paginate(this.filteredAlerts()));
  readonly pageItems = computed(() => {
    switch (this.activeScene()) {
      case 'houses':
        return this.paginatedHouses().length;
      case 'users':
        return this.paginatedUsers().length;
      case 'devices':
        return this.paginatedDevices().length;
      case 'alerts':
        return this.paginatedAlerts().length;
    }
  });

  readonly totalPages = computed(() => {
    const totalItems = this.currentCollectionSize();
    return Math.max(1, Math.ceil(totalItems / this.pageSize));
  });

  readonly detailTitle = computed(() => {
    if (this.selectedDevice()) return this.selectedDevice()!.name;
    if (this.selectedAlert()) return `${this.selectedAlert()!.severity} · #${this.selectedAlert()!.id}`;
    return 'Sin seleccion';
  });

  readonly detailType = computed<'device' | 'alert' | null>(() => {
    if (this.selectedDevice()) return 'device';
    if (this.selectedAlert()) return 'alert';
    return null;
  });

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

  readonly deviceForm = this.fb.nonNullable.group({
    id: [0],
    name: ['', [Validators.required, Validators.minLength(3)]],
    houseId: [0, [Validators.required]],
    location: ['', [Validators.required, Validators.minLength(3)]],
    status: ['ACTIVO', [Validators.required]],
    deviceType: [''],
    firmwareVersion: [''],
    hardwareUid: ['']
  });

  protected readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');
  protected readonly scenes = [
    { id: 'houses', label: 'Casas', detail: 'Territorio y clientes' },
    { id: 'users', label: 'Usuarios', detail: 'Accesos y roles' },
    { id: 'devices', label: 'Dispositivos', detail: 'Provisioning y claves' },
    { id: 'alerts', label: 'Alertas', detail: 'Eventos y respuesta' }
  ] as const;

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

  protected setDeviceStatusFilter(value: DeviceStatusFilter) {
    this.deviceStatusFilter.set(value);
    this.page.set(1);
  }

  protected setDeviceStatusFilterFromInput(value: string) {
    this.setDeviceStatusFilter(value as DeviceStatusFilter);
  }

  protected setAlertSeverityFilter(value: AlertSeverityFilter) {
    this.alertSeverityFilter.set(value);
    this.page.set(1);
  }

  protected setAlertSeverityFilterFromInput(value: string) {
    this.setAlertSeverityFilter(value as AlertSeverityFilter);
  }

  protected setAlertAcknowledgedFilter(value: AlertAcknowledgedFilter) {
    this.alertAcknowledgedFilter.set(value);
    this.page.set(1);
  }

  protected setAlertAcknowledgedFilterFromInput(value: string) {
    this.setAlertAcknowledgedFilter(value as AlertAcknowledgedFilter);
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
  }

  protected selectAlert(alert: AlertItem) {
    this.selectedAlert.set(alert);
    this.selectedDevice.set(null);
  }

  protected clearSelection() {
    this.selectedDevice.set(null);
    this.selectedAlert.set(null);
  }

  protected async acknowledgeAlert(alert: AlertItem) {
    await this.runBusy(async () => {
      await firstValueFrom(this.api.patch(`/api/alerts/${alert.id}/ack`, {}));
      this.message.set(`Alerta #${alert.id} confirmada correctamente.`);
      await this.load();
      this.selectedAlert.update((selected) =>
        selected && selected.id === alert.id ? { ...selected, acknowledged: true, ack_at: new Date().toISOString() } : selected
      );
    });
  }

  protected async submitHouse() {
    if (this.houseForm.invalid) {
      this.message.set('Revisa los campos de la casa antes de guardar.');
      this.houseForm.markAllAsTouched();
      return;
    }

    const raw = this.houseForm.getRawValue();
    const id = raw.id || 0;
    const body = {
      name: raw.name.trim(),
      address: raw.address.trim(),
      owner_name: raw.owner_name.trim(),
      contact_phone: raw.contact_phone.trim(),
      status: raw.status
    };

    await this.runBusy(async () => {
      if (id) {
        await firstValueFrom(this.api.put(`/api/houses/${id}`, body));
        this.message.set('Casa actualizada correctamente.');
      } else {
        await firstValueFrom(this.api.post('/api/houses', body));
        this.message.set('Casa creada correctamente.');
      }
      this.showHouseModal.set(false);
      this.resetHouseForm(false);
      await this.load();
    });
  }

  protected async submitUser() {
    const raw = this.userForm.getRawValue();
    const isEditing = Boolean(raw.id);
    const password = raw.password.trim();

    if (this.userForm.invalid || (!isEditing && password.length < 6) || (isEditing && password && password.length < 6)) {
      this.message.set('Revisa los datos del usuario. La clave debe tener minimo 6 caracteres.');
      this.userForm.markAllAsTouched();
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
      this.showUserModal.set(false);
      this.resetUserForm(false);
      await this.load();
    });
  }

  protected async submitDevice() {
    if (this.deviceForm.invalid) {
      this.message.set('Completa el formulario del dispositivo para continuar.');
      this.deviceForm.markAllAsTouched();
      return;
    }

    const raw = this.deviceForm.getRawValue();
    const body: Record<string, unknown> = {
      name: raw.name.trim(),
      houseId: raw.houseId,
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
      this.showDeviceModal.set(false);
      this.resetDeviceForm(false);
      await this.load();
    });
  }

  protected editHouse(house: House) {
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

  protected editDevice(device: Device) {
    this.selectDevice(device);
    this.deviceForm.setValue({
      id: device.id,
      name: device.name,
      houseId: device.House?.id || 0,
      location: device.location || '',
      status: device.status || 'ACTIVO',
      deviceType: device.device_type || '',
      firmwareVersion: device.firmware_version || '',
      hardwareUid: device.hardware_uid || ''
    });
    this.showDeviceModal.set(true);
  }

  protected async deleteHouse(house: House) {
    if (!window.confirm(`Eliminar la casa ${house.name}?`)) return;
    await this.runBusy(async () => {
      await firstValueFrom(this.api.delete(`/api/houses/${house.id}`));
      this.message.set('Casa eliminada correctamente.');
      await this.load();
    });
  }

  protected async deleteUser(user: User) {
    if (!window.confirm(`Eliminar el usuario ${user.nombre}?`)) return;
    await this.runBusy(async () => {
      await firstValueFrom(this.api.delete(`/api/users/${user.id}`));
      this.message.set('Usuario eliminado correctamente.');
      await this.load();
    });
  }

  protected async deleteDevice(device: Device) {
    if (!window.confirm(`Eliminar el dispositivo ${device.name}?`)) return;
    await this.runBusy(async () => {
      await firstValueFrom(this.api.delete(`/api/devices/${device.id}`));
      this.message.set('Dispositivo eliminado correctamente.');
      await this.load();
    });
  }

  protected async rotateCredential(device: Device) {
    await this.runBusy(async () => {
      const response = await firstValueFrom(
        this.api.post<{ generatedApiKey: string }>(`/api/devices/${device.id}/credentials`, {})
      );
      this.deviceCredential.set({ name: device.name, apiKey: response.generatedApiKey });
      this.message.set(`Credencial renovada para ${device.name}. Guardala en el firmware.`);
      this.selectDevice(device);
      await this.load();
    });
  }

  protected resetHouseForm(openModal = true) {
    this.houseForm.reset({
      id: 0,
      name: '',
      address: '',
      owner_name: '',
      contact_phone: '',
      status: 'ACTIVA'
    });
    this.showHouseModal.set(openModal);
  }

  protected resetUserForm(openModal = true) {
    this.userForm.reset({
      id: 0,
      nombre: '',
      email: '',
      password: '',
      houseId: 0,
      role: 'resident'
    });
    this.showUserModal.set(openModal);
  }

  protected resetDeviceForm(openModal = true) {
    this.deviceForm.reset({
      id: 0,
      name: '',
      houseId: 0,
      location: '',
      status: 'ACTIVO',
      deviceType: '',
      firmwareVersion: '',
      hardwareUid: ''
    });
    this.showDeviceModal.set(openModal);
  }

  protected readonly trackById = (_index: number, item: { id: number }) => item.id;

  private async load() {
    if (this.auth.currentUser()?.role !== 'admin') {
      this.message.set('Tu cuenta no tiene permisos de administracion.');
      return;
    }

    await this.runBusy(async () => {
      const [houses, users, devices, alerts] = await Promise.all([
        firstValueFrom(this.api.get<{ houses: House[] }>('/api/houses')),
        firstValueFrom(this.api.get<{ users: User[] }>('/api/users')),
        firstValueFrom(this.api.get<{ devices: Device[] }>('/api/devices', { limit: 200 })),
        firstValueFrom(this.api.get<{ alerts: AlertItem[] }>('/api/alerts', { limit: 200 }))
      ]);

      this.houses.set(houses.houses || []);
      this.users.set(users.users || []);
      this.devices.set(devices.devices || []);
      this.alerts.set(alerts.alerts || []);
      this.page.set(Math.min(this.page(), this.totalPages()));
      this.message.set('Consola sincronizada. Ya puedes operar casas, usuarios, dispositivos y alertas desde Angular.');
    });
  }

  private paginate<T>(items: T[]) {
    const page = this.page();
    const start = (page - 1) * this.pageSize;
    return items.slice(start, start + this.pageSize);
  }

  private currentCollectionSize() {
    switch (this.activeScene()) {
      case 'houses':
        return this.filteredHouses().length;
      case 'users':
        return this.filteredUsers().length;
      case 'devices':
        return this.filteredDevices().length;
      case 'alerts':
        return this.filteredAlerts().length;
    }
  }

  private async runBusy(task: () => Promise<void>) {
    this.busy.set(true);
    try {
      await task();
    } catch (error) {
      this.message.set(
        error instanceof Error ? error.message : 'No fue posible completar la operacion administrativa.'
      );
    } finally {
      this.busy.set(false);
    }
  }
}
