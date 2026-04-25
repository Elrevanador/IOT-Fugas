# Backend Railway

Este directorio ya puede vivir como repositorio independiente para desplegar solo el backend en Railway.

## Variables minimas

Usa `DATABASE_URL` o las variables `DB_*`.

Ejemplo con tu conexion MySQL de Railway:

```env
NODE_ENV=production
PORT=${PORT}
DB_SYNC_ALTER=false
DB_USE_SYNC=false
DB_RUN_MIGRATIONS=true
JWT_SECRET=cambia_esto_por_un_secreto_largo
INGEST_API_KEY=cambia_esto_por_una_clave_larga
FRONTEND_ORIGIN=https://tu-frontend.app
TRUST_PROXY=loopback
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_LOGIN_RATE_LIMIT_MAX=10
AUTH_REGISTER_RATE_LIMIT_MAX=5
DATABASE_URL=mysql://root:eqglpsLmtWwLplFwxaDJAROxeToqOizu@roundhouse.proxy.rlwy.net:51802/railway
```

## Seguridad y operacion

- `POST /api/readings` acepta solo `x-device-key`.
- `POST /api/readings` acepta la clave global `INGEST_API_KEY` y tambien claves propias por dispositivo.
- El backend genera `X-Request-Id` en cada respuesta y acepta uno entrante si ya vienes trazando peticiones.
- `POST /api/auth/login` y `POST /api/auth/register` tienen rate limit por IP en memoria. Para confiar en IPs reenviadas por proxy configura `TRUST_PROXY`; por defecto queda desactivado.
- El body JSON tiene limite de `32kb`.
- El stream `GET /api/public/dashboard/stream` acepta `?token=...` porque `EventSource` no envia `Authorization` de forma nativa. El resto de endpoints no aceptan JWT por query string.
- Puedes generar o rotar una credencial propia con `POST /api/devices/:id/credentials`. La respuesta devuelve `generatedApiKey` una sola vez.
- `DB_RUN_MIGRATIONS=true` ejecuta migraciones aditivas al arrancar. En `production`, `DB_USE_SYNC` queda desactivado por defecto y solo se activa si lo pones explicitamente en `true`.
- La migracion `20260420_0001_init_schema.js` crea el esquema base completo para bases nuevas. La recomendacion es operar con migraciones y dejar `DB_USE_SYNC=false` en despliegues estables.
- Este backend ya no sirve archivos del frontend. El despliegue esperado es frontend y backend separados.

## Consultas utiles

- `GET /api/readings?limit=50&page=1&deviceId=1&houseId=2&state=ALERTA&from=2026-04-20T00:00:00Z&until=2026-04-20T23:59:59Z`
- `GET /api/alerts?limit=50&page=1&deviceId=1&houseId=2&severity=FUGA&acknowledged=false`
- `GET /api/devices?limit=50&page=1&houseId=2&status=ACTIVO&search=esp32`
- `POST /api/devices/12/credentials`
- `GET /api/incidents?estado=ABIERTO&deviceId=12`
- `PUT /api/detection-config/12`
- `POST /api/valves/device/12/actions`
- `GET /api/commands/pending?deviceId=12` con `x-device-key`
- `POST /api/commands/44/response` con `x-device-key`

Las respuestas de listas incluyen `pagination` con `page`, `limit`, `total` y `totalPages`.

## Railway

1. Crea un repositorio nuevo solo con el contenido de `backend/`.
2. En Railway conecta ese repositorio.
3. Usa `npm install` como install command si Railway lo pide.
4. Usa `npm start` como start command.
5. Configura las variables del ejemplo anterior.

## Local

```bash
npm install
npm run dev
```

Health check: `GET /api/health`

Migraciones:

```bash
npm run migrate
```

Demo multi-dispositivo:

```bash
npm run seed:demo
```

El seed crea/actualiza una casa demo, un residente, tres dispositivos con lecturas recientes y una alerta para validar el dashboard multi-dispositivo. En `production` queda bloqueado salvo que definas `ALLOW_DEMO_SEED=true`.

Tests:

```bash
npm test
```
