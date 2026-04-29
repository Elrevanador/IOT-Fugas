import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="toast-stack" aria-live="polite" aria-label="Notificaciones">
      @for (toast of toastService.toasts(); track toast.id) {
        <article class="toast" [attr.data-tone]="toast.tone">
          <div class="toast__icon">
            <i
              class="fa-solid"
              [class.fa-circle-check]="toast.tone === 'success'"
              [class.fa-circle-exclamation]="toast.tone === 'error'"
              [class.fa-circle-info]="toast.tone === 'info'"
              [class.fa-triangle-exclamation]="toast.tone === 'warning'"
              aria-hidden="true"
            ></i>
          </div>
          <div class="toast__copy">
            <strong>{{ toast.title }}</strong>
            <p>{{ toast.message }}</p>
          </div>
          <button type="button" (click)="toastService.dismiss(toast.id)" aria-label="Cerrar notificacion">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </article>
      }
    </section>
  `,
  styles: [`
    .toast-stack {
      position: fixed;
      right: clamp(0.75rem, 2vw, 1.25rem);
      bottom: clamp(0.75rem, 2vw, 1.25rem);
      z-index: 1400;
      display: grid;
      gap: 0.65rem;
      width: min(25rem, calc(100vw - 1.5rem));
      pointer-events: none;
    }

    .toast {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: start;
      gap: 0.7rem;
      padding: 0.85rem;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.96);
      border: 1px solid #1f2937;
      box-shadow: 0 18px 48px rgba(2, 6, 23, 0.42);
      color: #e5e7eb;
      pointer-events: auto;
      animation: toast-in 180ms ease;
    }

    .toast[data-tone='success'] {
      border-color: rgba(52, 211, 153, 0.45);
    }

    .toast[data-tone='error'] {
      border-color: rgba(244, 114, 182, 0.55);
    }

    .toast[data-tone='warning'] {
      border-color: rgba(251, 191, 36, 0.5);
    }

    .toast__icon {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: 8px;
      background: rgba(20, 184, 166, 0.14);
      color: #5eead4;
    }

    .toast[data-tone='error'] .toast__icon {
      background: rgba(244, 63, 94, 0.14);
      color: #fda4af;
    }

    .toast[data-tone='warning'] .toast__icon {
      background: rgba(251, 191, 36, 0.14);
      color: #fbbf24;
    }

    .toast__copy {
      display: grid;
      gap: 0.15rem;
      min-width: 0;
    }

    .toast__copy strong {
      font-size: 0.9rem;
    }

    .toast__copy p {
      margin: 0;
      color: #94a3b8;
      font-size: 0.8rem;
      line-height: 1.4;
    }

    .toast button {
      width: 1.9rem;
      height: 1.9rem;
      display: grid;
      place-items: center;
      border: 1px solid #1f2937;
      border-radius: 8px;
      background: #0b1220;
      color: #94a3b8;
      cursor: pointer;
    }

    .toast button:hover {
      color: #e5e7eb;
      border-color: #334155;
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(0.5rem);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `]
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);
}
