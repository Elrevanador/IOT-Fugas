# AquaSense Angular

Nueva interfaz Angular para el sistema AquaSense. Este frontend reemplaza progresivamente el frontend estático legado y se conecta al backend Node.js ya existente.

## Requisitos

- Node.js 18.19.1 o superior compatible con Angular 19
- Backend corriendo en `http://localhost:3000` o una URL pública equivalente

## Desarrollo local

```bash
cd frontend-angular
npm install
npm run dev
```

La app queda en:

- `http://localhost:8000`

## Configuración de API

La URL del backend se lee desde:

- `public/app-config.js`

Valor local por defecto:

```js
window.__APP_CONFIG__ = {
  apiBaseUrl: 'http://localhost:3000'
};
```

En despliegue puedes sustituir ese valor por la URL pública real del backend.

## Scripts

- `npm run dev`: `ng serve --port 8000`
- `npm start`: igual que `dev`
- `npm run build`: genera `dist/frontend-angular`
- `npm test`: suite Angular/Karma

## Estado actual

- Shell visual nuevo con fondo animado y loader global
- Login y registro conectados al backend
- Dashboard inicial con snapshot + SSE
- Vista admin inicial con resumen de casas, usuarios y dispositivos

## Siguiente fase sugerida

- Migrar CRUD administrativo completo
- Migrar gráficos e histórico fino del dashboard
- Añadir componentes compartidos reutilizables para tablas, alertas y estados vacíos
