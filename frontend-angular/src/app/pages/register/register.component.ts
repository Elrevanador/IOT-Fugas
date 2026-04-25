import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly isSubmitting = signal(false);
  readonly feedback = signal('Crea una cuenta operativa y luego entra al monitor.');
  readonly feedbackTone = signal<'info' | 'error' | 'success'>('info');

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });
  readonly passwordStrength = computed(() => {
    const password = this.form.controls.password.value || '';
    let score = 0;
    if (password.length >= 6) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    if (score <= 1) return 'basica';
    if (score <= 3) return 'media';
    return 'alta';
  });

  async submit() {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.feedback.set('Creando credencial operativa...');
    this.feedbackTone.set('info');

    try {
      await this.auth.register(this.form.getRawValue());
      this.feedback.set('Cuenta creada. Ahora entra al dashboard con tu acceso.');
      this.feedbackTone.set('success');
      setTimeout(() => void this.router.navigateByUrl('/login'), 600);
    } catch (error) {
      this.feedback.set(this.resolveErrorMessage(error));
      this.feedbackTone.set('error');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private resolveErrorMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      const payload = (error as { error?: { msg?: string } }).error;
      if (payload?.msg) return payload.msg;
    }

    if (error instanceof Error && error.message) return error.message;
    return 'No fue posible crear la cuenta.';
  }
}
