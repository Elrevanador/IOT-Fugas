import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  id: number;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  tone: 'danger' | 'info';
}

type PendingConfirm = ConfirmRequest & {
  resolve: (value: boolean) => void;
};

@Injectable({
  providedIn: 'root'
})
export class ConfirmService {
  private nextId = 1;
  private pending: PendingConfirm | null = null;
  readonly request = signal<ConfirmRequest | null>(null);

  confirm(options: Partial<ConfirmRequest> & Pick<ConfirmRequest, 'title' | 'message'>): Promise<boolean> {
    if (this.pending) {
      this.pending.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      const pending: PendingConfirm = {
        id: this.nextId++,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || 'Confirmar',
        cancelText: options.cancelText || 'Cancelar',
        tone: options.tone || 'info',
        resolve
      };

      this.pending = pending;
      this.request.set(this.publicRequest(pending));
    });
  }

  respond(value: boolean) {
    if (!this.pending) return;
    const current = this.pending;
    this.pending = null;
    this.request.set(null);
    current.resolve(value);
  }

  private publicRequest(request: PendingConfirm): ConfirmRequest {
    return {
      id: request.id,
      title: request.title,
      message: request.message,
      confirmText: request.confirmText,
      cancelText: request.cancelText,
      tone: request.tone
    };
  }
}
