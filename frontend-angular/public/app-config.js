// Prioridad sobre `src/environments/environment.ts`.
// En local usa el environment de Angular; en despliegue pon aqui la URL del API solo si va en otro dominio.
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  apiBaseUrl: ''
};
