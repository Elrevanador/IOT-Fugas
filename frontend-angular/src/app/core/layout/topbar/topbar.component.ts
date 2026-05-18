import { CommonModule, UpperCasePipe } from '@angular/common';
import { Component, EventEmitter, Output, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { ConfirmService } from '../../services/confirm.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, UpperCasePipe, RouterLink],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss'
})
export class TopbarComponent {
  @Output() readonly toggleSidebarEvent = new EventEmitter<void>();

  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  private readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url.split('?')[0]),
      startWith(this.router.url.split('?')[0])
    ),
    { initialValue: this.router.url.split('?')[0] }
  );

  readonly pageHeading = computed(() => {
    const url = this.currentPath();
    if (url.startsWith('/profile')) {
      return { title: 'Mi cuenta', subtitle: 'Datos personales y seguridad' };
    }
    if (url.startsWith('/admin')) {
      return { title: 'Administración', subtitle: 'Usuarios, casas y configuración' };
    }
    return { title: 'Panel operativo', subtitle: 'Telemetría, alertas y administración del sistema IoT' };
  });

  toggleSidebar(): void {
    this.toggleSidebarEvent.emit();
  }

  async logout(): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: 'Cerrar sesión',
      message: 'Quieres salir de la consola operativa?',
      confirmText: 'Salir',
      cancelText: 'Cancelar',
      tone: 'info'
    });
    if (!confirmed) return;

    await this.auth.logout();
    this.toast.info('Sesion cerrada.');
    await this.router.navigateByUrl('/login');
  }

  protected initials(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U';
  }
}
