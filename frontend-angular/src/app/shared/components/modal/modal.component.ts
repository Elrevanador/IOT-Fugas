import { CommonModule } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-overlay" [class.modal-overlay--visible]="isOpen()" (click)="onBackdropClick()">
      <div class="modal-panel" (click)="$event.stopPropagation()">
        <header class="modal-header">
          <h2>{{ title() }}</h2>
          <button type="button" class="modal-close" (click)="close.emit()" aria-label="Cerrar modal">
            ✕
          </button>
        </header>
        <div class="modal-body">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
      z-index: 1000;
    }

    .modal-overlay--visible {
      opacity: 1;
      pointer-events: all;
    }

    .modal-panel {
      background: #0a1220;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.3s ease;
    }

    @keyframes slideUp {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: #fff;
    }

    .modal-close {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.2s ease;
    }

    .modal-close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    .modal-body {
      padding: 20px;
    }
  `]
})
export class ModalComponent {
  readonly isOpen = input(false);
  readonly title = input('Modal');
  readonly allowBackdropClose = input(true);
  readonly close = output<void>();

  onBackdropClick(): void {
    if (this.allowBackdropClose()) {
      this.close.emit();
    }
  }
}
