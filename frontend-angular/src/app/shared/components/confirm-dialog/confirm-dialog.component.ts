import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (confirm.request(); as request) {
      <section class="confirm-overlay" aria-modal="true" role="dialog" [attr.aria-labelledby]="'confirm-title-' + request.id">
        <article class="confirm-panel" [attr.data-tone]="request.tone">
          <header>
            <div class="confirm-icon">
              <i class="fa-solid" [class.fa-triangle-exclamation]="request.tone === 'danger'" [class.fa-circle-info]="request.tone === 'info'" aria-hidden="true"></i>
            </div>
            <div>
              <h2 [id]="'confirm-title-' + request.id">{{ request.title }}</h2>
              <p>{{ request.message }}</p>
            </div>
          </header>
          <div class="confirm-actions">
            <button type="button" class="confirm-cancel" (click)="confirm.respond(false)">
              {{ request.cancelText }}
            </button>
            <button type="button" class="confirm-accept" (click)="confirm.respond(true)">
              {{ request.confirmText }}
            </button>
          </div>
        </article>
      </section>
    }
  `,
  styles: [`
    .confirm-overlay {
      position: fixed;
      inset: 0;
      z-index: 1300;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(2, 6, 23, 0.68);
      -webkit-backdrop-filter: blur(6px);
      backdrop-filter: blur(6px);
      animation: confirm-fade 160ms ease;
    }

    .confirm-panel {
      width: min(28rem, 100%);
      padding: 1rem;
      border-radius: 12px;
      background: #0f172a;
      border: 1px solid #1f2937;
      box-shadow: 0 24px 70px rgba(2, 6, 23, 0.55);
      color: #e5e7eb;
    }

    .confirm-panel header {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0.85rem;
      align-items: start;
    }

    .confirm-icon {
      display: grid;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 10px;
      background: rgba(20, 184, 166, 0.14);
      color: #5eead4;
    }

    .confirm-panel[data-tone='danger'] .confirm-icon {
      background: rgba(244, 63, 94, 0.14);
      color: #fda4af;
    }

    h2 {
      margin: 0;
      font-size: 1.05rem;
    }

    p {
      margin: 0.35rem 0 0;
      color: #94a3b8;
      font-size: 0.9rem;
      line-height: 1.45;
    }

    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.65rem;
      margin-top: 1rem;
      flex-wrap: wrap;
    }

    button {
      min-height: 2.35rem;
      padding: 0.55rem 0.85rem;
      border-radius: 8px;
      border: 1px solid #1f2937;
      font: inherit;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
    }

    .confirm-cancel {
      background: #0b1220;
      color: #cbd5e1;
    }

    .confirm-accept {
      background: #0d9488;
      border-color: #0d9488;
      color: white;
    }

    .confirm-panel[data-tone='danger'] .confirm-accept {
      background: #be123c;
      border-color: #be123c;
    }

    @keyframes confirm-fade {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  `]
})
export class ConfirmDialogComponent {
  readonly confirm = inject(ConfirmService);
}
