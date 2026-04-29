import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Misma regla que `backend/src/controllers/authController.js` (PASSWORD_REGEX + mensaje de 8 caracteres). */
export const BACKEND_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

export function backendPasswordValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const password = String(value);
    if (password.length < 8) {
      return { passwordPolicy: { requiredLength: true } };
    }
    if (!BACKEND_PASSWORD_REGEX.test(password)) {
      return { passwordPolicy: { complexity: true } };
    }
    return null;
  };
}
