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
  private readonly recoveryPendingKey = 'passwordRecoveryCodePending';
  private readonly recoveryVerifiedCodeKey = 'passwordRecoveryVerifiedCode';
  private readonly emailFromQuery = this.normalizeEmail(this.route.snapshot.queryParamMap.get('email') || '');
  private readonly storedEmail = this.normalizeEmail(sessionStorage.getItem(this.recoveryEmailKey) || '');
  private readonly initialEmail = this.emailFromQuery || this.storedEmail;
  private readonly hasPendingRecovery =
    sessionStorage.getItem(this.recoveryPendingKey) === 'true' && Boolean(this.initialEmail);
  private readonly storedVerifiedCode = sessionStorage.getItem(this.recoveryVerifiedCodeKey) || '';

  readonly isSubmitting = signal(false);
  readonly isVerifying = signal(false);
  readonly isResetting = signal(false);
  readonly codeSent = signal(
    (Boolean(this.emailFromQuery) || this.hasPendingRecovery) && !this.storedVerifiedCode
  );
  readonly codeVerified = signal(Boolean(this.storedVerifiedCode));
  readonly verifiedCode = signal(this.storedVerifiedCode);
  readonly codeDigits = signal(['', '', '', '', '', '']);
  readonly codeSlots = [0, 1, 2, 3, 4, 5];
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly feedback = signal(
    this.codeVerified()
      ? 'Código validado. Crea tu nueva contraseña.'
      : this.codeSent()
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

  async submit(event?: Event) {
    event?.preventDefault();
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      this.feedback.set('Ingresa un correo válido para continuar.');
      this.feedbackTone.set('error');
      return;
    }

    this.isSubmitting.set(true);
    this.feedback.set('Enviando código de recuperación...');
    this.feedbackTone.set('info');
    this.devResetUrl.set('');
    this.devResetCode.set('');

    try {
      const email = this.normalizeEmail(this.form.getRawValue().email);
      this.form.controls.email.setValue(email);
      const response = await this.auth.forgotPassword({ email });
      this.markRecoveryPending(email);
      this.codeSent.set(true);
      this.codeVerified.set(false);
      this.verifiedCode.set('');
      this.resetCodeDigits();
      this.resetForm.reset({ password: '', confirmPassword: '' });
      this.feedback.set(response.msg || 'Si la cuenta existe, enviaremos un código a tu correo.');
      this.feedbackTone.set('success');
      this.toast.success('Solicitud enviada. Revisa tu correo.');

      this.applyDevRecoveryHints(response);
    } catch (error) {
      const message = resolveErrorMessage(error, 'No fue posible solicitar la recuperación.');
      this.feedback.set(message);
      this.feedbackTone.set('error');
      this.toast.error(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async verifyCode(event?: Event) {
    event?.preventDefault();
    await this.runVerifyCode();
  }

  private async runVerifyCode() {
    const code = this.codeValue();
    const email = this.normalizeEmail(this.form.controls.email.value);

    if (!/^\d{6}$/.test(code)) {
      this.feedback.set('Ingresa el código de 6 dígitos que llegó al correo.');
      this.feedbackTone.set('error');
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.feedback.set('Correo inválido. Vuelve al paso anterior e ingrésalo de nuevo.');
      this.feedbackTone.set('error');
      return;
    }

    if (this.isVerifying() || this.codeVerified()) {
      return;
    }

    this.isVerifying.set(true);
    this.feedback.set('Validando código de recuperación...');
    this.feedbackTone.set('info');

    try {
      const response = await this.auth.verifyResetCode({ email, code });
      sessionStorage.setItem(this.recoveryVerifiedCodeKey, code);
      this.verifiedCode.set(code);
      this.codeVerified.set(true);
      this.codeSent.set(false);
      this.feedback.set(response.msg || 'Código validado. Ahora crea tu nueva contraseña.');
      this.feedbackTone.set('success');
      this.toast.success('Código validado.');
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true
      });
    } catch (error) {
      const message = resolveErrorMessage(error, 'El código es inválido o expiró.');
      this.feedback.set(message);
      this.feedbackTone.set('error');
      this.toast.error(message);
    } finally {
      this.isVerifying.set(false);
    }
  }

  async submitReset(event?: Event) {
    event?.preventDefault();
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
        email: this.normalizeEmail(this.form.controls.email.value),
        code: this.verifiedCode(),
        password: raw.password,
        confirmPassword: raw.confirmPassword
      });

      this.feedback.set(response.msg || 'Contraseña actualizada correctamente.');
      this.feedbackTone.set('success');
      this.toast.success('Contraseña actualizada. Ya puedes iniciar sesión.');
      this.clearRecoverySession();
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
    const digitsOnly = input.value.replace(/\D/g, '');

    if (digitsOnly.length > 1) {
      this.applyCodeDigits(digitsOnly);
      void this.tryAutoVerify();
      return;
    }

    const value = digitsOnly.slice(-1);
    const nextDigits = [...this.codeDigits()];
    nextDigits[index] = value;
    this.codeDigits.set(nextDigits);
    input.value = value;

    if (value && index < this.codeSlots.length - 1) {
      document.getElementById(this.codeInputId(index + 1))?.focus();
    }

    void this.tryAutoVerify();
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
    const pasted = event.clipboardData?.getData('text')?.replace(/\D/g, '') || '';
    if (!pasted) return;
    event.preventDefault();
    this.applyCodeDigits(pasted);
    void this.tryAutoVerify();
  }

  protected onCodeFormSubmit(event: Event) {
    event.preventDefault();
    void this.runVerifyCode();
  }

  protected editCode() {
    sessionStorage.removeItem(this.recoveryVerifiedCodeKey);
    this.codeVerified.set(false);
    this.verifiedCode.set('');
    this.codeSent.set(true);
    this.resetCodeDigits();
    this.feedback.set('Revisa el código e intenta validarlo nuevamente.');
    this.feedbackTone.set('info');
  }

  protected changeEmail() {
    this.codeSent.set(false);
    this.codeVerified.set(false);
    this.verifiedCode.set('');
    this.resetCodeDigits();
    this.clearRecoverySession();
    this.devResetUrl.set('');
    this.devResetCode.set('');
    this.feedback.set('Ingresa el correo de tu cuenta para solicitar un código de recuperación.');
    this.feedbackTone.set('info');
  }

  async resendCode(event?: Event) {
    event?.preventDefault();
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.feedback.set('Reenviando código seguro...');
    this.feedbackTone.set('info');

    try {
      const email = this.normalizeEmail(this.form.getRawValue().email);
      this.form.controls.email.setValue(email);
      const response = await this.auth.forgotPassword({ email });
      this.markRecoveryPending(email);
      this.codeSent.set(true);
      this.codeVerified.set(false);
      this.verifiedCode.set('');
      this.resetCodeDigits();
      this.feedback.set(response.msg || 'Si la cuenta existe, enviaremos un código a tu correo.');
      this.feedbackTone.set('success');
      this.toast.success('Código reenviado. Revisa tu correo.');
      this.applyDevRecoveryHints(response);
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

  private normalizeEmail(value: string) {
    return String(value || '').trim().toLowerCase();
  }

  private markRecoveryPending(email: string) {
    sessionStorage.removeItem(this.recoveryVerifiedCodeKey);
    sessionStorage.setItem(this.recoveryEmailKey, email);
    sessionStorage.setItem(this.recoveryPendingKey, 'true');
  }

  private clearRecoverySession() {
    sessionStorage.removeItem(this.recoveryEmailKey);
    sessionStorage.removeItem(this.recoveryPendingKey);
    sessionStorage.removeItem(this.recoveryVerifiedCodeKey);
  }

  private applyCodeDigits(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    const nextDigits = ['', '', '', '', '', ''];
    digits.split('').forEach((digit, index) => {
      nextDigits[index] = digit;
    });
    this.codeDigits.set(nextDigits);
    this.syncCodeInputs(nextDigits);
    const focusIndex = Math.min(Math.max(digits.length - 1, 0), 5);
    document.getElementById(this.codeInputId(focusIndex))?.focus();
  }

  private syncCodeInputs(digits: string[]) {
    digits.forEach((digit, index) => {
      const input = document.getElementById(this.codeInputId(index)) as HTMLInputElement | null;
      if (input) input.value = digit;
    });
  }

  private async tryAutoVerify() {
    if (!/^\d{6}$/.test(this.codeValue()) || this.isVerifying() || this.codeVerified()) {
      return;
    }
    await this.runVerifyCode();
  }

  private applyDevRecoveryHints(response: { resetUrl?: string; resetCode?: string; emailDelivered?: boolean }) {
    if (response.resetUrl) {
      this.devResetUrl.set(response.resetUrl);
    }
    if (response.resetCode) {
      this.devResetCode.set(response.resetCode);
      this.codeDigits.set(response.resetCode.split('').slice(0, 6));
    }
    if (response.emailDelivered === false && !response.resetCode) {
      this.feedback.set(
        'No pudimos enviar el correo. Configura el proveedor de correo en el servidor o contacta al administrador.'
      );
      this.feedbackTone.set('error');
    }
  }

  protected passwordError() {
    const control = this.resetForm.controls.password;
    if (!control.touched && !control.dirty) return '';
    if (control.hasError('required')) return 'Ingresa una contraseña nueva.';
    const policy = control.getError('passwordPolicy');
    if (policy?.requiredLength) return 'La contraseña debe tener al menos 8 caracteres.';
    if (policy?.complexity) return 'Debe incluir mayúscula, minúscula, número y símbolo (@$!%*?&).';
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
