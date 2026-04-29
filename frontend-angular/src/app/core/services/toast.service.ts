import { Injectable, signal } from '@angular/core';

import { resolveErrorMessage } from '../utils/error-message';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: number;
  tone: ToastTone;
  title: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<ToastMessage[]>([]);

  success(message: string, title = 'Listo') {
    this.show({ tone: 'success', title, message });
  }

  error(message: string, title = 'Error') {
    this.show({ tone: 'error', title, message, duration: 6500 });
  }

  info(message: string, title = 'Informacion') {
    this.show({ tone: 'info', title, message });
  }

  warning(message: string, title = 'Atencion') {
    this.show({ tone: 'warning', title, message, duration: 5600 });
  }

  fromError(error: unknown, fallback?: string) {
    this.error(resolveErrorMessage(error, fallback));
  }

  dismiss(id: number) {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private show(options: { tone: ToastTone; title: string; message: string; duration?: number }) {
    const toast: ToastMessage = {
      id: this.nextId++,
      tone: options.tone,
      title: options.title,
      message: options.message
    };
    this.toasts.update((toasts) => [toast, ...toasts].slice(0, 4));

    const duration = options.duration ?? 4200;
    if (duration > 0) {
      window.setTimeout(() => this.dismiss(toast.id), duration);
    }
  }
}
