/**
 * Valores por defecto (plantilla docente + integración IoT).
 * `public/app-config.js` sigue teniendo prioridad en runtime si define `apiBaseUrl`.
 */
export const environment = {
  production: false,
  /** Base del API sin barra final (ej. http://localhost:3000) */
  apiBaseUrl: 'http://localhost:3000'
};
