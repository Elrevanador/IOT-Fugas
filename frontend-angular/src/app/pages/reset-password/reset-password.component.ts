import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { resolveErrorMessage } from '../../core/utils/error-message';
import { backendPasswordValidator } from '../../core/validators/password-policy';

@Component({
  selector: 'app-reset-password',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: '../login/login.component.scss'
})
export class ResetPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly token = signal(this.route.snapshot.queryParamMap.get('token') || '');
  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly feedback = signal(
    this.token()
      ? 'Crea una contraseña nueva. El enlace solo sirve una vez y vence pronto.'
      : 'El enlace no trae token de recuperación.'
  );
  readonly feedbackTone = signal<'info' | 'error' | 'success'>(this.token() ? 'info' : 'error');

  readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, backendPasswordValidator()]],
    confirmPassword: ['', [Validators.required]]
  });

  async submit() {
    if (!this.token()) {
      this.feedback.set('El enlace de recuperación es inválido.');
      this.feedbackTone.set('error');
      return;
    }

    if (this.form.invalid || !this.passwordsMatch() || this.isSubmitting()) {
      this.form.markAllAsTouched();
      this.feedback.set('Revisa la contraseña y su confirmación.');
      this.feedbackTone.set('error');
      return;
    }

    this.isSubmitting.set(true);
    this.feedback.set('Actualizando contraseña de forma segura...');
    this.feedbackTone.set('info');

    try {
      const raw = this.form.getRawValue();
      const response = await this.auth.resetPassword({
        token: this.token(),
        password: raw.password,
        confirmPassword: raw.confirmPassword
      });
      this.feedback.set(response.msg || 'Contraseña actualizada correctamente.');
      this.feedbackTone.set('success');
      this.toast.success('Contraseña actualizada.');
      setTimeout(() => void this.router.navigateByUrl('/login'), 700);
    } catch (error) {
      const message = resolveErrorMessage(error, 'No fue posible actualizar la contraseña.');
      this.feedback.set(message);
      this.feedbackTone.set('error');
      this.toast.error(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected passwordError() {
    const control = this.form.controls.password;
    if (!control.touched && !control.dirty) return '';
    if (control.hasError('required')) return 'Ingresa una contraseña nueva.';
    const policy = control.getError('passwordPolicy');
    if (policy?.requiredLength) return 'La contraseña debe tener al menos 8 caracteres.';
    if (policy?.complexity) return 'Debe incluir mayúscula, minúscula, número y símbolo.';
    return '';
  }

  protected confirmPasswordError() {
    const control = this.form.controls.confirmPassword;
    if (!control.touched && !control.dirty) return '';
    if (control.hasError('required')) return 'Confirma la contraseña.';
    if (!this.passwordsMatch()) return 'Las contraseñas no coinciden.';
    return '';
  }

  protected passwordsMatch() {
    return this.form.controls.password.value === this.form.controls.confirmPassword.value;
  }

  protected togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }

  protected toggleConfirmPasswordVisibility() {
    this.showConfirmPassword.update((value) => !value);
  }
}
