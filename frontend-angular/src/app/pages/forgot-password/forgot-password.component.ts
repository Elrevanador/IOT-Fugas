import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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
  private readonly recoveryEmailKey = 'passwordRecoveryEmail';
  private readonly initialEmail =
    this.route.snapshot.queryParamMap.get('email') || sessionStorage.getItem(this.recoveryEmailKey) || '';

  readonly isSubmitting = signal(false);
  readonly isVerifying = signal(false);
  readonly isResetting = signal(false);
  readonly codeSent = signal(Boolean(this.initialEmail));
  readonly codeVerified = signal(false);
  readonly verifiedCode = signal('');
  readonly codeDigits = signal(['', '', '', '', '', '']);
  readonly codeSlots = [0, 1, 2, 3, 4, 5];
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly feedback = signal(
    this.initialEmail
      ? 'Ingresa el código de 6 dígitos que llegó a tu correo.'
      : 'Ingresa el correo de tu cuenta para solicitar un código de recuperación.'
  );
  readonly feedbackTone = signal<'info' | 'error' | 'success'>('info');
  readonly devResetUrl = signal('');
  readonly devResetCode = signal('');

  readonly form = this.fb.nonNullable.group({
    email: [this.initialEmail, [Validators.required, Validators.email, Validators.maxLength(254)]]
  });

  readonly codeValue = computed(() => this.codeDigits().join(''));

  readonly resetForm = this.fb.nonNullable.group({
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
    this.feedback.set('Verificando correo...');
    this.feedbackTone.set('info');
    this.devResetUrl.set('');
    this.devResetCode.set('');

    try {
      const email = this.form.getRawValue().email;
      const checkResponse = await this.auth.checkEmail(email);

      if (!checkResponse.exists) {
        this.feedback.set('El correo no está registrado en el sistema.');
        this.feedbackTone.set('error');
        this.toast.error('Correo no registrado');
        return;
      }

      const response = await this.auth.forgotPassword({ email });
      sessionStorage.setItem(this.recoveryEmailKey, email);
      this.codeSent.set(true);
      this.codeVerified.set(false);
      this.verifiedCode.set('');
      this.resetCodeDigits();
      this.resetForm.reset({ password: '', confirmPassword: '' });
      this.feedback.set(response.msg || 'Se envió un código a tu correo.');
      this.feedbackTone.set('success');
      this.toast.success('Se envió un código a tu correo.');

      if (response.resetUrl) {
        this.devResetUrl.set(response.resetUrl);
      }
      if (response.resetCode) {
        this.devResetCode.set(response.resetCode);
        this.codeDigits.set(response.resetCode.split('').slice(0, 6));
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

  async verifyCode() {
    const code = this.codeValue();
    const email = this.form.controls.email.value;

    if (!/^\d{6}$/.test(code)) {
      this.feedback.set('Ingresa el código de 6 dígitos que llegó al correo.');
      this.feedbackTone.set('error');
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.feedback.set('Correo inválido.');
      this.feedbackTone.set('error');
      return;
    }

    if (this.isVerifying()) {
      return;
    }

    this.isVerifying.set(true);
    this.feedback.set('Validando código de recuperación...');
    this.feedbackTone.set('info');

    try {
      const response = await this.auth.verifyResetCode({
        email,
        code
      });
      this.verifiedCode.set(code);
      this.codeVerified.set(true);
      this.codeSent.set(false);
      this.feedback.set(response.msg || 'Código validado. Ahora crea tu nueva contraseña.');
      this.feedbackTone.set('success');
      this.toast.success('Código validado.');
    } catch (error) {
      const message = resolveErrorMessage(error, 'El código es inválido o expiró.');
      this.feedback.set(message);
      this.feedbackTone.set('error');
      this.toast.error(message);
    } finally {
      this.isVerifying.set(false);
    }
  }

  async submitReset() {
    if (this.resetForm.invalid || !this.passwordsMatch() || this.isResetting()) {
      this.resetForm.markAllAsTouched();
      this.feedback.set('Confirma la nueva contraseña antes de continuar.');
      this.feedbackTone.set('error');
      return;
    }

    if (!this.codeVerified() || !this.verifiedCode()) {
      this.feedback.set('Primero valida el código de recuperación.');
      this.feedbackTone.set('error');
      return;
    }

    this.isResetting.set(true);
    this.feedback.set('Actualizando contraseña...');
    this.feedbackTone.set('info');

    try {
      const raw = this.resetForm.getRawValue();
      const response = await this.auth.resetPassword({
        email: this.form.controls.email.value,
        code: this.verifiedCode(),
        password: raw.password,
        confirmPassword: raw.confirmPassword
      });

      this.feedback.set(response.msg || 'Contraseña actualizada correctamente.');
      this.feedbackTone.set('success');
      this.toast.success('Contraseña actualizada. Ya puedes iniciar sesión.');
      sessionStorage.removeItem(this.recoveryEmailKey);
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

  protected codeInputId(index: number) {
    return `reset-code-${index}`;
  }

  protected onCodeInput(event: Event, index: number) {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(-1);
    const nextDigits = [...this.codeDigits()];
    nextDigits[index] = value;
    this.codeDigits.set(nextDigits);
    input.value = value;

    if (value && index < this.codeSlots.length - 1) {
      document.getElementById(this.codeInputId(index + 1))?.focus();
    }
  }

  protected onCodeKeydown(event: KeyboardEvent, index: number) {
    if (event.key !== 'Backspace') return;
    const nextDigits = [...this.codeDigits()];
    if (nextDigits[index]) {
      nextDigits[index] = '';
      this.codeDigits.set(nextDigits);
      return;
    }
    if (index > 0) {
      document.getElementById(this.codeInputId(index - 1))?.focus();
    }
  }

  protected onCodePaste(event: ClipboardEvent) {
    const pasted = event.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6) || '';
    if (!pasted) return;
    event.preventDefault();
    const nextDigits = ['', '', '', '', '', ''];
    pasted.split('').forEach((digit, index) => {
      nextDigits[index] = digit;
    });
    this.codeDigits.set(nextDigits);
    document.getElementById(this.codeInputId(Math.min(pasted.length, 6) - 1))?.focus();
  }

  protected editCode() {
    this.codeVerified.set(false);
    this.verifiedCode.set('');
    this.codeSent.set(true);
    this.feedback.set('Revisa el código e intenta validarlo nuevamente.');
    this.feedbackTone.set('info');
  }

  async resendCode() {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.feedback.set('Reenviando código seguro...');
    this.feedbackTone.set('info');

    try {
      const email = this.form.getRawValue().email;
      const checkResponse = await this.auth.checkEmail(email);

      if (!checkResponse.exists) {
        this.feedback.set('El correo no está registrado en el sistema.');
        this.feedbackTone.set('error');
        this.toast.error('Correo no registrado');
        return;
      }

      const response = await this.auth.forgotPassword(this.form.getRawValue());
      sessionStorage.setItem(this.recoveryEmailKey, email);
      this.codeSent.set(true);
      this.codeVerified.set(false);
      this.verifiedCode.set('');
      this.resetCodeDigits();
      this.feedback.set(response.msg || 'Código reenviado. Revisa tu correo.');
      this.feedbackTone.set('success');
      this.toast.success('Código reenviado a tu correo.');

      if (response.resetCode) {
        this.devResetCode.set(response.resetCode);
        this.codeDigits.set(response.resetCode.split('').slice(0, 6));
      }
    } catch (error) {
      const message = resolveErrorMessage(error, 'No fue posible reenviar el código.');
      this.feedback.set(message);
      this.feedbackTone.set('error');
      this.toast.error(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private resetCodeDigits() {
    this.codeDigits.set(['', '', '', '', '', '']);
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
