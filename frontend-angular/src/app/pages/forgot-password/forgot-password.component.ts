import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { resolveErrorMessage } from '../../core/utils/error-message';
import { backendPasswordValidator } from '../../core/validators/password-policy';

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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isSubmitting = signal(false);
  readonly isResetting = signal(false);
  readonly codeSent = signal(false);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly feedback = signal('Ingresa el correo de tu cuenta para solicitar un código de recuperación.');
  readonly feedbackTone = signal<'info' | 'error' | 'success'>('info');
  readonly devResetUrl = signal('');
  readonly devResetCode = signal('');

  readonly form = this.fb.nonNullable.group({
    email: [this.route.snapshot.queryParamMap.get('email') || '', [Validators.required, Validators.email, Validators.maxLength(254)]]
  });

  readonly resetForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    password: ['', [Validators.required, backendPasswordValidator()]],
    confirmPassword: ['', [Validators.required]]
  });

  async submit() {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      this.feedback.set('Ingresa un correo válido para continuar.');
      this.feedbackTone.set('error');
      return;
    }

    this.isSubmitting.set(true);
    this.feedback.set('Protegiendo la solicitud y generando el código temporal...');
    this.feedbackTone.set('info');
    this.devResetUrl.set('');
    this.devResetCode.set('');

    try {
      const response = await this.auth.forgotPassword(this.form.getRawValue());
      this.codeSent.set(true);
      this.feedback.set(response.msg || 'Solicitud recibida. Si la cuenta existe, enviaremos un código.');
      this.feedbackTone.set('success');
      this.toast.success('Solicitud recibida. Revisa el correo si la cuenta existe.');

      if (response.resetUrl) {
        this.devResetUrl.set(response.resetUrl);
      }
      if (response.resetCode) {
        this.devResetCode.set(response.resetCode);
        this.resetForm.patchValue({ code: response.resetCode });
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

  async submitReset() {
    if (this.resetForm.invalid || !this.passwordsMatch() || this.isResetting()) {
      this.resetForm.markAllAsTouched();
      this.feedback.set('Ingresa el código de 6 dígitos y confirma la nueva contraseña.');
      this.feedbackTone.set('error');
      return;
    }

    this.isResetting.set(true);
    this.feedback.set('Validando código y actualizando contraseña...');
    this.feedbackTone.set('info');

    try {
      const raw = this.resetForm.getRawValue();
      const response = await this.auth.resetPassword({
        email: this.form.controls.email.value,
        code: raw.code,
        password: raw.password,
        confirmPassword: raw.confirmPassword
      });

      this.feedback.set(response.msg || 'Contraseña actualizada correctamente.');
      this.feedbackTone.set('success');
      this.toast.success('Contraseña actualizada. Ya puedes iniciar sesión.');
      setTimeout(() => void this.router.navigateByUrl('/login'), 700);
    } catch (error) {
      const message = resolveErrorMessage(error, 'No fue posible actualizar la contraseña.');
      this.feedback.set(message);
      this.feedbackTone.set('error');
      this.toast.error(message);
    } finally {
      this.isResetting.set(false);
    }
  }

  protected passwordsMatch() {
    return this.resetForm.controls.password.value === this.resetForm.controls.confirmPassword.value;
  }

  protected passwordError() {
    const control = this.resetForm.controls.password;
    if (!control.touched && !control.dirty) return '';
    if (control.hasError('required')) return 'Ingresa una contraseña nueva.';
    const policy = control.getError('passwordPolicy');
    if (policy?.requiredLength) return 'La contraseña debe tener al menos 8 caracteres.';
    if (policy?.complexity) return 'Debe incluir mayúscula, minúscula, número y símbolo.';
    return '';
  }

  protected confirmPasswordError() {
    const control = this.resetForm.controls.confirmPassword;
    if (!control.touched && !control.dirty) return '';
    if (control.hasError('required')) return 'Confirma la contraseña.';
    if (!this.passwordsMatch()) return 'Las contraseñas no coinciden.';
    return '';
  }

  protected togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }

  protected toggleConfirmPasswordVisibility() {
    this.showConfirmPassword.update((value) => !value);
  }
}
