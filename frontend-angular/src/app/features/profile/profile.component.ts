import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { resolveErrorMessage } from '../../core/utils/error-message';
import { backendPasswordValidator } from '../../core/validators/password-policy';

@Component({
  selector: 'app-profile',
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly user = this.auth.currentUser;
  readonly savingProfile = signal(false);
  readonly savingPassword = signal(false);
  readonly showCurrentPassword = signal(false);
  readonly showNewPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly profileForm = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    apellido: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    username: [
      '',
      [Validators.required, Validators.minLength(3), Validators.maxLength(80), Validators.pattern(/^[a-zA-Z0-9._-]+$/)]
    ],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]]
  });

  readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, backendPasswordValidator()]],
    confirmPassword: ['', [Validators.required]]
  });

  readonly displayName = computed(() => {
    const u = this.user();
    if (!u) return 'Usuario';
    return [u.nombre, u.apellido].filter(Boolean).join(' ').trim() || u.email;
  });

  readonly roleLabel = computed(() => {
    const role = this.user()?.role || '';
    if (role === 'admin') return 'Administrador';
    if (role === 'operator') return 'Operador';
    if (role === 'resident') return 'Residente';
    return role;
  });

  async ngOnInit() {
    await this.auth.ensureFreshProfile();
  }

  constructor() {
    effect(() => {
      const u = this.user();
      if (!u) return;
      this.profileForm.patchValue(
        {
          nombre: u.nombre || '',
          apellido: u.apellido || '',
          username: u.username || '',
          email: u.email || ''
        },
        { emitEvent: false }
      );
    });
  }

  async saveProfile() {
    if (this.profileForm.invalid || this.savingProfile()) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.savingProfile.set(true);
    try {
      const raw = this.profileForm.getRawValue();
      const response = await this.auth.updateProfile({
        nombre: raw.nombre.trim(),
        apellido: raw.apellido.trim(),
        username: raw.username.trim().toLowerCase(),
        email: raw.email.trim().toLowerCase()
      });
      this.toast.success(response.msg || 'Perfil actualizado.');
    } catch (error) {
      this.toast.error(resolveErrorMessage(error, 'No fue posible actualizar el perfil.'));
    } finally {
      this.savingProfile.set(false);
    }
  }

  async savePassword() {
    if (this.passwordForm.invalid || !this.passwordsMatch() || this.savingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.savingPassword.set(true);
    try {
      const raw = this.passwordForm.getRawValue();
      const response = await this.auth.changePassword({
        currentPassword: raw.currentPassword,
        newPassword: raw.newPassword
      });
      this.passwordForm.reset();
      this.toast.success(response.msg || 'Contraseña actualizada.');
    } catch (error) {
      this.toast.error(resolveErrorMessage(error, 'No fue posible cambiar la contraseña.'));
    } finally {
      this.savingPassword.set(false);
    }
  }

  protected passwordsMatch() {
    return this.passwordForm.controls.newPassword.value === this.passwordForm.controls.confirmPassword.value;
  }

  protected initials(name: string) {
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'U'
    );
  }

  protected fieldError(controlName: 'nombre' | 'apellido' | 'username' | 'email') {
    const control = this.profileForm.controls[controlName];
    if (!control.touched && !control.dirty) return '';
    if (control.hasError('required')) return 'Campo requerido.';
    if (control.hasError('minlength')) return 'Valor demasiado corto.';
    if (control.hasError('maxlength')) return 'Valor demasiado largo.';
    if (control.hasError('email')) return 'Correo inválido.';
    if (control.hasError('pattern')) return 'Solo letras, números, punto, guion o guion bajo.';
    return '';
  }

  protected passwordFieldError(controlName: 'currentPassword' | 'newPassword' | 'confirmPassword') {
    const control = this.passwordForm.controls[controlName];
    if (!control.touched && !control.dirty) return '';
    if (control.hasError('required')) return 'Campo requerido.';
    if (controlName === 'newPassword') {
      const policy = control.getError('passwordPolicy');
      if (policy?.requiredLength) return 'Mínimo 8 caracteres.';
      if (policy?.complexity) return 'Mayúscula, minúscula, número y símbolo (@$!%*?&).';
    }
    if (controlName === 'confirmPassword' && !this.passwordsMatch()) return 'Las contraseñas no coinciden.';
    return '';
  }

  protected toggleVisibility(target: 'current' | 'new' | 'confirm') {
    if (target === 'current') this.showCurrentPassword.update((v) => !v);
    if (target === 'new') this.showNewPassword.update((v) => !v);
    if (target === 'confirm') this.showConfirmPassword.update((v) => !v);
  }
}
