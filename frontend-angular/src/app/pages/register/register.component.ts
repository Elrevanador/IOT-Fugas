import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { resolveErrorMessage } from '../../core/utils/error-message';
import { backendPasswordValidator } from '../../core/validators/password-policy';

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
  private readonly toast = inject(ToastService);

  readonly isSubmitting = signal(false);
  readonly feedback = signal('Crea una cuenta operativa y luego entra al monitor.');
  readonly feedbackTone = signal<'info' | 'error' | 'success'>('info');

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    apellido: ['', [Validators.required, Validators.minLength(2)]],
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80), Validators.pattern(/^[a-zA-Z0-9._-]+$/)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, backendPasswordValidator()]],
    confirmPassword: ['', [Validators.required]]
  });

  protected passwordStrength() {
    const password = this.passwordValue();
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[@$!%*?&]/.test(password)) score += 1;
    if (score <= 2) return 'basica';
    if (score <= 4) return 'media';
    return 'alta';
  }

  protected passwordHasMinLength() {
    return this.passwordValue().length >= 8;
  }

  protected passwordHasLowerAndUpper() {
    const password = this.passwordValue();
    return /[a-z]/.test(password) && /[A-Z]/.test(password);
  }

  protected passwordHasNumber() {
    return /\d/.test(this.passwordValue());
  }

  protected passwordHasSymbol() {
    return /[@$!%*?&]/.test(this.passwordValue());
  }

  async submit() {
    if (this.form.invalid || !this.passwordsMatch() || this.isSubmitting()) {
      this.form.markAllAsTouched();
      const message = this.firstInvalidMessage();
      this.feedback.set(message);
      this.feedbackTone.set('error');
      this.toast.warning(message);
      return;
    }

    this.isSubmitting.set(true);
    this.feedback.set('Creando credencial operativa...');
    this.feedbackTone.set('info');

    try {
      await this.auth.register(this.form.getRawValue());
      this.feedback.set('Cuenta creada. Ahora entra al dashboard con tu acceso.');
      this.feedbackTone.set('success');
      this.toast.success('Cuenta creada correctamente.');
      setTimeout(() => void this.router.navigateByUrl('/login'), 600);
    } catch (error) {
      const message = resolveErrorMessage(error, 'No fue posible crear la cuenta.');
      this.feedback.set(message);
      this.feedbackTone.set('error');
      this.toast.error(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected nombreError() {
    const control = this.form.controls.nombre;
    if (!this.shouldShowError(control)) return '';
    return this.resolveNombreError();
  }

  protected emailError() {
    const control = this.form.controls.email;
    if (!this.shouldShowError(control)) return '';
    return this.resolveEmailError();
  }

  protected apellidoError() {
    const control = this.form.controls.apellido;
    if (!this.shouldShowError(control)) return '';
    return this.resolveApellidoError();
  }

  protected usernameError() {
    const control = this.form.controls.username;
    if (!this.shouldShowError(control)) return '';
    return this.resolveUsernameError();
  }

  protected passwordError() {
    const control = this.form.controls.password;
    if (!this.shouldShowError(control)) return '';
    return this.resolvePasswordError();
  }

  protected confirmPasswordError() {
    const control = this.form.controls.confirmPassword;
    if (!this.shouldShowError(control) && (control.pristine || this.passwordsMatch())) return '';
    if (control.hasError('required')) return 'Confirma tu contrasena.';
    if (!this.passwordsMatch()) return 'Las contrasenas no coinciden.';
    return '';
  }

  private shouldShowError(control: AbstractControl) {
    return control.invalid && (control.touched || control.dirty);
  }

  private passwordValue() {
    return this.form.controls.password.value || '';
  }

  private firstInvalidMessage() {
    if (this.form.controls.nombre.invalid) return this.resolveNombreError();
    if (this.form.controls.apellido.invalid) return this.resolveApellidoError();
    if (this.form.controls.username.invalid) return this.resolveUsernameError();
    if (this.form.controls.email.invalid) return this.resolveEmailError();
    if (this.form.controls.password.invalid) return this.resolvePasswordError();
    if (this.form.controls.confirmPassword.invalid || !this.passwordsMatch()) return this.confirmPasswordError();
    return 'Revisa los datos antes de crear la cuenta.';
  }

  private resolveNombreError() {
    const control = this.form.controls.nombre;
    if (control.hasError('required')) return 'Ingresa tu nombre.';
    if (control.hasError('minlength')) return 'El nombre debe tener al menos 3 caracteres.';
    return 'Revisa el nombre ingresado.';
  }

  private resolveEmailError() {
    const control = this.form.controls.email;
    if (control.hasError('required')) return 'Ingresa tu correo.';
    if (control.hasError('email')) return 'Ingresa un correo valido.';
    return 'Revisa el correo ingresado.';
  }

  private resolveApellidoError() {
    const control = this.form.controls.apellido;
    if (control.hasError('required')) return 'Ingresa tu apellido.';
    if (control.hasError('minlength')) return 'El apellido debe tener al menos 2 caracteres.';
    return 'Revisa el apellido ingresado.';
  }

  private resolveUsernameError() {
    const control = this.form.controls.username;
    if (control.hasError('required')) return 'Ingresa un username.';
    if (control.hasError('minlength')) return 'El username debe tener al menos 3 caracteres.';
    if (control.hasError('maxlength')) return 'El username no puede superar 80 caracteres.';
    if (control.hasError('pattern')) return 'Usa solo letras, numeros, punto, guion o guion bajo.';
    return 'Revisa el username ingresado.';
  }

  private resolvePasswordError() {
    const control = this.form.controls.password;
    if (control.hasError('required')) return 'Ingresa una contrasena.';
    const policy = control.getError('passwordPolicy');
    if (policy?.requiredLength) return 'La contrasena debe tener al menos 8 caracteres.';
    if (policy?.complexity) {
      return 'Usa mayuscula, minuscula, numero y un simbolo: @$!%*?&.';
    }
    return 'Revisa la contrasena ingresada.';
  }

  private passwordsMatch() {
    return this.form.controls.password.value === this.form.controls.confirmPassword.value;
  }

}
