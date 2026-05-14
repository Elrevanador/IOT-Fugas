import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { resolveErrorMessage } from '../../core/utils/error-message';

@Component({
  selector: 'app-forgot-password',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: '../login/login.component.scss'
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly isSubmitting = signal(false);
  readonly feedback = signal('Ingresa el correo de tu cuenta para solicitar un enlace de recuperación.');
  readonly feedbackTone = signal<'info' | 'error' | 'success'>('info');
  readonly devResetUrl = signal('');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]]
  });

  async submit() {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      this.feedback.set('Ingresa un correo válido para continuar.');
      this.feedbackTone.set('error');
      return;
    }

    this.isSubmitting.set(true);
    this.feedback.set('Protegiendo la solicitud y generando el enlace temporal...');
    this.feedbackTone.set('info');
    this.devResetUrl.set('');

    try {
      const response = await this.auth.forgotPassword(this.form.getRawValue());
      this.feedback.set(response.msg || 'Solicitud recibida. Si la cuenta existe, enviaremos instrucciones.');
      this.feedbackTone.set('success');
      this.toast.success('Solicitud recibida. Revisa el correo si la cuenta existe.');

      if (response.resetUrl) {
        this.devResetUrl.set(response.resetUrl);
      }
    } catch (error) {
      const message = resolveErrorMessage(error, 'No fue posible solicitar la recuperación.');
      this.feedback.set(message);
      this.feedbackTone.set('error');
      this.toast.error(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
