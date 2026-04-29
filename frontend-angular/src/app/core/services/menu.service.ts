import { Injectable, computed, inject } from '@angular/core';

import { AuthService } from './auth.service';

/** Misma forma que la plantilla del docente (`frontend/frontend`) para el sidebar. */
export interface MenuItem {
  id: number;
  nombre: string;
  path: string;
  icono?: string;
  orden: number;
  padre: number | null;
  estado: string;
  items: MenuItem[];
}

@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly auth = inject(AuthService);

  /** Menú estático alineado con las rutas reales de este proyecto IoT. */
  readonly menu = computed<MenuItem[]>(() => {
    const base: MenuItem[] = [
      {
        id: 1,
        nombre: 'Dashboard',
        path: '/dashboard',
        icono: 'fa-solid fa-chart-line',
        orden: 1,
        padre: null,
        estado: 'ACTIVO',
        items: []
      }
    ];

    if (this.auth.isAdmin()) {
      base.push({
        id: 2,
        nombre: 'Administración',
        path: '/admin',
        icono: 'fa-solid fa-screwdriver-wrench',
        orden: 2,
        padre: null,
        estado: 'ACTIVO',
        items: []
      });
    }

    return base.sort((a, b) => a.orden - b.orden);
  });

  getMenu(): MenuItem[] {
    return this.menu();
  }

  hasAccess(fullPath: string): boolean {
    const normalized = fullPath.replace(/\/+$/, '') || '/';
    if (normalized === '/dashboard' || normalized.startsWith('/dashboard')) {
      return true;
    }
    if (normalized === '/admin' || normalized.startsWith('/admin')) {
      return this.auth.isAdmin();
    }
    return false;
  }
}
