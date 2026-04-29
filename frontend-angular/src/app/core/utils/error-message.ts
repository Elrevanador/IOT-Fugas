import { HttpErrorResponse } from '@angular/common/http';

type ApiErrorPayload = {
  msg?: string;
  message?: string;
  errors?: Array<{ msg?: string; message?: string; field?: string }>;
};

export function resolveErrorMessage(error: unknown, fallback = 'No fue posible completar la operacion.'): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'No se pudo conectar con el backend. Revisa que la API este encendida y que la URL sea correcta.';
    }

    const payload = error.error as ApiErrorPayload | string | undefined;
    const message = resolvePayloadMessage(payload);
    if (message) return message;

    if (error.status === 401) return 'Tu sesion expiro o no tienes autorizacion para esta accion.';
    if (error.status === 403) return 'No tienes permisos para realizar esta accion.';
    if (error.status === 404) return 'El recurso solicitado no existe.';
    if (error.status === 409) return 'La accion entra en conflicto con datos existentes.';
    if (error.status >= 500) return 'El servidor tuvo un problema. Revisa el backend e intenta de nuevo.';
  }

  if (typeof error === 'object' && error !== null && 'error' in error) {
    const payload = (error as { error?: ApiErrorPayload | string }).error;
    const message = resolvePayloadMessage(payload);
    if (message) return message;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function resolvePayloadMessage(payload: ApiErrorPayload | string | undefined): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;

  const firstDetail = payload.errors?.find((item) => item.msg || item.message);
  const detailMessage = firstDetail?.msg || firstDetail?.message || '';
  const mainMessage = payload.msg || payload.message || '';

  if (mainMessage && detailMessage) return `${mainMessage}: ${detailMessage}`;
  return mainMessage || detailMessage;
}
