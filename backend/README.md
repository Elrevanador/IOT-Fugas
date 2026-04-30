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
TRUST_PROXY=1
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_LOGIN_RATE_LIMIT_MAX=10
AUTH_REGISTER_RATE_LIMIT_MAX=5
DATABASE_URL=mysql://USUARIO:PASSWORD@HOST:PUERTO/NOMBRE_DB
```

Nunca subas una URL real de base de datos ni secretos de Railway al repositorio. Las credenciales reales van solo en Variables de Railway.

Variables opcionales para generar cuentas temporales de validacion:

```env
DEMO_ADMIN_EMAIL=demo.admin@iot.local
DEMO_ADMIN_USERNAME=demo_admin
DEMO_ADMIN_PASSWORD=AdminDemo123!
DEMO_OPERATOR_EMAIL=demo.operador@iot.local
DEMO_OPERATOR_USERNAME=demo_operador
DEMO_OPERATOR_PASSWORD=OperadorDemo123!
DEMO_RESIDENT_EMAIL=demo.residente@iot.local
DEMO_RESIDENT_USERNAME=demo_residente
DEMO_RESIDENT_PASSWORD=Demo12345!
DEMO_DEVICE_API_KEY=dev_demo_iot_water_multi_123456
```

## Seguridad y operacion

- `POST /api/readings` acepta solo `x-device-key`.
- `POST /api/readings` acepta la clave global `INGEST_API_KEY` y tambien claves propias por dispositivo.
- El backend genera `X-Request-Id` en cada respuesta y acepta uno entrante si ya vienes trazando peticiones.
- `POST /api/auth/login` y `POST /api/auth/register` tienen rate limit por IP en memoria. Para confiar en IPs reenviadas por proxy configura `TRUST_PROXY`; por defecto queda desactivado.
- El modulo RBAC usa `users`, `roles`, `user_roles`, `resources` y `role_resources`. `GET /api/auth/me` devuelve `roles` y `permissions` para validar el acceso a modulos sin romper el campo `role` existente.
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
- `GET /api/resources`
- `POST /api/role-resources`
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

Para la entrega, sube el link publico del backend de Railway y credenciales de prueba de la aplicacion, no credenciales de MySQL ni secretos de Railway. Despues de ejecutar el seed demo puedes compartir:

```txt
Backend Railway: https://tu-backend.up.railway.app
Health check: https://tu-backend.up.railway.app/api/health

Administrador:
email: demo.admin@iot.local
username: demo_admin
password: AdminDemo123!

Operador:
email: demo.operador@iot.local
username: demo_operador
password: OperadorDemo123!

Residente:
email: demo.residente@iot.local
username: demo_residente
password: Demo12345!
```

La cuenta administradora permite validar usuarios, roles, recursos, permisos y modulos de administracion. La cuenta operadora y la residente sirven para validar restricciones de seguridad por rol. Cambia o elimina estas claves al terminar la revision.

Para crear los datos demo en Railway, ejecuta una sola vez:

```bash
ALLOW_DEMO_SEED=true npm run seed:demo
```

El comando queda bloqueado en `production` si no pasas `ALLOW_DEMO_SEED=true`.

## Migrar base completa a Railway

Las migraciones (`npm run migrate`) crean o actualizan tablas, pero no copian tus registros. Para llevarte la base local completa a MySQL de Railway usa un dump:

1. Crea el servicio MySQL en Railway y habilita/usa su conexion publica TCP para importar desde tu maquina.
2. En el servicio `backend` de Railway usa `DATABASE_URL=${{ MySQL.MYSQL_URL }}` o las variables `DB_*`.
3. Genera el backup local:

```bash
cd backend
npm run db:dump
```

El archivo queda en `backend/backups/` y contiene esquema + datos.

4. Crea un archivo local ignorado por Git:

```env
# backend/.env.railway.local
TARGET_DATABASE_URL=mysql://usuario:password@host-publico:puerto/base
```

Usa la URL real que Railway muestra para conexion publica/TCP Proxy, no el placeholder `${{ MySQL.MYSQL_URL }}`.

5. Importa el dump a Railway:

```bash
cd backend
npm run db:restore -- backups/NOMBRE_DEL_BACKUP.sql --yes
```

Si no pasas el nombre del archivo, el script usa el `.sql` mas reciente de `backend/backups/`.

Notas importantes:

- Haz esto antes de usar la app en produccion, o durante una ventana corta de mantenimiento.
- El restore reemplaza tablas/datos del destino con lo que haya en el dump.
- Los archivos `backend/backups/` y `backend/.env.railway.local` estan ignorados por Git para no subir datos ni credenciales.

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

El seed crea/actualiza una casa demo, usuarios admin/operador/residente, tres dispositivos con lecturas recientes y una alerta para validar el dashboard multi-dispositivo. En `production` queda bloqueado salvo que definas `ALLOW_DEMO_SEED=true`.

Tests:

```bash
npm test
```
