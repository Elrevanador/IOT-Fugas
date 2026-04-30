import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { resolveErrorMessage } from '../../core/utils/error-message';

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
  private readonly toast = inject(ToastService);

  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly feedback = signal('Ingresa con una cuenta operativa para ver telemetria y alertas.');
  readonly feedbackTone = signal<'info' | 'error' | 'success'>('info');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  readonly emailHint = computed(() => {
    const value = this.form.controls.email.value || '';
    if (!value) return 'Esperando cuenta operativa';
    return value.includes('@') ? 'Correo listo para autenticar' : 'Username listo para autenticar';
  });

  async submit() {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      this.feedback.set('Completa correo o username y contrasena antes de entrar.');
      this.feedbackTone.set('error');
      this.toast.warning('Completa correo o username y contrasena antes de entrar.');
      return;
    }

    this.isSubmitting.set(true);
    this.feedback.set('Verificando credenciales y preparando consola...');
    this.feedbackTone.set('info');

    try {
      await this.auth.login(this.form.getRawValue());
      this.feedback.set('Sesion iniciada. Entrando al monitor...');
      this.feedbackTone.set('success');
      this.toast.success('Sesion iniciada correctamente.');
      const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') || '/dashboard';
      await this.router.navigateByUrl(redirectTo);
    } catch (error) {
      const message = resolveErrorMessage(error, 'No fue posible iniciar sesion. Intenta de nuevo.');
      this.feedback.set(message);
      this.feedbackTone.set('error');
      this.toast.error(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }
}
