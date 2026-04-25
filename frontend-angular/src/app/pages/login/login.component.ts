import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly feedback = signal('Ingresa con una cuenta operativa para ver telemetria y alertas.');
  readonly feedbackTone = signal<'info' | 'error' | 'success'>('info');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  readonly emailHint = computed(() => {
    const value = this.form.controls.email.value || '';
    if (!value) return 'Esperando cuenta operativa';
    return value.includes('@') ? 'Formato listo para autenticar' : 'Falta un correo valido';
  });

  async submit() {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.feedback.set('Verificando credenciales y preparando consola...');
    this.feedbackTone.set('info');

    try {
      await this.auth.login(this.form.getRawValue());
      this.feedback.set('Sesion iniciada. Entrando al monitor...');
      this.feedbackTone.set('success');
      const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') || '/dashboard';
      await this.router.navigateByUrl(redirectTo);
    } catch (error) {
      this.feedback.set(this.resolveErrorMessage(error));
      this.feedbackTone.set('error');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }

  private resolveErrorMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      const payload = (error as { error?: { msg?: string } }).error;
      if (payload?.msg) return payload.msg;
    }

    if (error instanceof Error && error.message) return error.message;
    return 'No fue posible iniciar sesion. Intenta de nuevo.';
  }
}
