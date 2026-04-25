import { CommonModule, UpperCasePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from './core/services/auth.service';
import { LoadingService } from './core/services/loading.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, UpperCasePipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly loading = inject(LoadingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private routeTimer: number | null = null;

  readonly isRouteAnimating = signal(false);
  readonly currentRoute = signal('Dashboard');
  readonly routeTone = computed(() => {
    switch (this.currentRoute()) {
      case 'Admin':
        return 'admin';
      case 'Entrar':
      case 'Registro':
        return 'access';
      default:
        return 'dashboard';
    }
  });

  constructor() {
    void this.auth.ensureSessionLoaded();
    this.syncRouteMeta(this.router.url);
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this.syncRouteMeta(event.urlAfterRedirects);
      });
  }

  async logout() {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  private syncRouteMeta(url: string) {
    this.currentRoute.set(this.resolveRouteName(url));
    this.isRouteAnimating.set(true);
    if (this.routeTimer !== null) {
      window.clearTimeout(this.routeTimer);
    }
    this.routeTimer = window.setTimeout(() => {
      this.isRouteAnimating.set(false);
      this.routeTimer = null;
    }, 520);
  }

  private resolveRouteName(url: string) {
    if (url.includes('/admin')) return 'Admin';
    if (url.includes('/login')) return 'Entrar';
    if (url.includes('/register')) return 'Registro';
    return 'Dashboard';
  }
}
