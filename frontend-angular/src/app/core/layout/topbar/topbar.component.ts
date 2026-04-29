import { CommonModule, UpperCasePipe } from '@angular/common';
import { Component, EventEmitter, Output, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ConfirmService } from '../../services/confirm.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, UpperCasePipe],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss'
})
export class TopbarComponent {
  @Output() readonly toggleSidebarEvent = new EventEmitter<void>();

  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  toggleSidebar(): void {
    this.toggleSidebarEvent.emit();
  }

  async logout(): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: 'Cerrar sesion',
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
