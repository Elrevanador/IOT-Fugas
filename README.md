# Proyecto Wokwi - Deteccion de Fugas con ESP32

Este proyecto conecta una simulacion ESP32 en Wokwi con un backend Node.js + MySQL y un panel web publico. No usa ThingSpeak y tampoco usa la carpeta `data/`: el flujo activo es firmware -> backend -> frontend, con backend y frontend desplegados como servicios separados.

## Estructura principal

- `simulacion/simulacion.ino`: firmware del ESP32
- `frontend-angular/`: UI oficial del proyecto (Angular 19) desplegada como sitio estatico
- `backend/`: API REST, autenticacion JWT y almacenamiento MySQL
- `simulacion/diagram.json`: circuito Wokwi
- `simulacion/wokwi.toml`: configuracion Wokwi para VS Code
- `simulacion/build_wokwi_bundle.sh`: recompila el firmware para Wokwi
- `simulacion/PROYECTO.md`: definicion del proyecto y responsabilidades del firmware

## Lo que incluye

- ESP32 Dev Module
- YF-S201 por pulsos en pin 27
- BMP180 por I2C
- LCD 16x2 por I2C
- LED verde, naranja y rojo
- Buzzer
- Envio HTTP directo al backend
- Panel principal (Angular) en su URL publica de frontend

## Flujo actual

1. El ESP32 mide flujo y presion cada 2 segundos.
2. La logica local calcula riesgo y estado (`NORMAL`, `ALERTA`, `FUGA`, `ERROR`).
3. El ESP32 publica la lectura a `POST /api/readings` con `x-device-key`.
4. El backend guarda lecturas y alertas en MySQL.
5. El frontend Angular consulta `GET /api/public/dashboard` y mantiene stream SSE contra la URL del backend.
6. Los operadores pueden confirmar alertas y enviar acciones de valvula desde el panel usando JWT.
7. El ESP32 simulado consulta `GET /api/commands/pending` y responde a `POST /api/commands/:id/response` con `x-device-key`.

## Wokwi en VS Code

1. Abre la carpeta `/home/duvan/IOt/simulacion`
2. No uses `F5`
3. Ejecuta `Wokwi: Start Simulator`

Si prefieres abrir todo `/home/duvan/IOt` como workspace, primero ejecuta:

```bash
cd /home/duvan/IOt/simulacion
./build_wokwi_bundle.sh
```

Ese script ahora deja una copia de `simulacion.ino.merged.bin` tanto en `simulacion/build/` como en `/home/duvan/IOt/build/`, para que la extension de Wokwi encuentre el firmware en ambos casos.

`simulacion/wokwi.toml` ahora carga directamente `build/simulacion.ino.bin`.

## Build reproducible

Si cambias `simulacion/simulacion.ino`, ejecuta:

```bash
./build_wokwi_bundle.sh
```

Puedes inyectar secretos/configuracion de compilacion sin editar el repo usando `ARDUINO_BUILD_PROPERTIES`. Ejemplo:

```bash
export ARDUINO_BUILD_PROPERTIES=$'build.extra_flags=-DINGEST_API_KEY_VALUE=\"tu_clave\" -DBACKEND_ALLOW_INSECURE_TLS=0'
./build_wokwi_bundle.sh
```

El script sincroniza las dependencias declaradas en `simulacion/libraries.txt` antes de compilar y prioriza las librerias locales en `simulacion/libraries/`, para evitar diferencias entre Wokwi y `arduino-cli` local.

La libreria `LiquidCrystal_I2C` se deja versionada dentro del proyecto para evitar el warning de arquitectura AVR que generan instalaciones antiguas de `LiquidCrystal I2C`.

Ese script genera:

- `simulacion/build/simulacion.ino.bin`
- `simulacion/build/simulacion.ino.elf`
- `simulacion/build/simulacion.ino.merged.bin`
- `build/simulacion.ino.merged.bin` si abriste el repo raiz

Wokwi usa `build/simulacion.ino.merged.bin` desde el folder que tenga abierto como workspace, asi que ya no necesitas ajustar rutas a mano.

## Backend + Frontend

### Requisitos

- Node.js 18+
- MySQL local o Railway

### Variables de entorno

Copia `backend/.env.example` a `backend/.env` y ajusta:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`
- `JWT_SECRET`
- `INGEST_API_KEY`
- `PORT`
- `FRONTEND_ORIGIN`
- `DB_SYNC_ALTER`

En Railway configura las mismas variables como variables del servicio. `INGEST_API_KEY` debe coincidir con la clave inyectada al compilar la simulacion (`INGEST_API_KEY_VALUE`).

### Ejecutar

```bash
cd backend
npm install
npm run dev
```

- API health: `http://localhost:3000/api/health`
- Frontend Angular local:

```bash
cd frontend-angular
npm install
npm run dev
```

- Frontend local en `http://localhost:8000/`
- La URL del backend se configura desde `frontend-angular/public/app-config.js` (`window.__APP_CONFIG__.apiBaseUrl`). Para despliegue, sustituye ese valor por la URL publica del backend.
- Si usas la base Railway desde local, deja `DB_SYNC_ALTER=false` para no intentar alterar el esquema remoto al arrancar.

### Endpoints principales

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/public/dashboard`
- `POST /api/readings` (ESP32 -> backend, requiere `x-device-key`)
- `GET /api/readings` (`limit`, `page`, `deviceId`, `houseId`, `state`, `from`, `until`)
- `GET /api/readings/latest`
- `GET /api/alerts` (`limit`, `page`, `deviceId`, `houseId`, `severity`, `acknowledged`)
- `PATCH /api/alerts/:id/ack`
- `GET /api/devices` (`limit`, `page`, `houseId`, `status`, `search`)
- `POST /api/devices/:id/credentials` (rota/genera credencial propia del dispositivo)
- `GET /api/locations` / `POST /api/locations`
- `GET /api/sensors` / `POST /api/sensors`
- `GET /api/incidents` / `PATCH /api/incidents/:id/status`
- `GET /api/valves` / `POST /api/valves/device/:deviceId/actions`
- `GET /api/detection-config/:deviceId` / `PUT /api/detection-config/:deviceId`
- `GET /api/commands` / `POST /api/commands`
- `GET /api/commands/pending` y `POST /api/commands/:id/response` (ESP32, requiere `x-device-key`)
- `GET /api/audit` (solo admin)

El backend devuelve `pagination` en listas paginadas y agrega `X-Request-Id` en cada respuesta para trazabilidad.

`POST /api/auth/login` y `POST /api/auth/register` tienen rate limit por IP configurable con:

- `AUTH_RATE_LIMIT_WINDOW_MS`
- `AUTH_LOGIN_RATE_LIMIT_MAX`
- `AUTH_REGISTER_RATE_LIMIT_MAX`

### Payload esperado del ESP32

```json
{
  "deviceId": 12,
  "houseId": 3,
  "deviceName": "ESP32-WOKWI-01",
  "hardwareUid": "HW-WOKWI-ESP32-01",
  "flow_lmin": 1.8,
  "pressure_kpa": 100.4,
  "risk": 62,
  "state": "ALERTA"
}
```

Header requerido:

```http
x-device-key: <tu_ingest_api_key>
```

El backend sigue aceptando la `INGEST_API_KEY` global y ahora tambien puede validar una clave propia por dispositivo si ya fue provisionada desde el panel/admin API.

Para un entorno con multiples casas y usuarios:

- crea primero la casa y el dispositivo desde el panel admin
- asigna el dispositivo a su `houseId`
- compila la simulacion con ese `DEVICE_ID_VALUE` o, como minimo, con `HOUSE_ID_VALUE` y `DEVICE_HARDWARE_UID_VALUE`
- si rotas una credencial propia del dispositivo, usa esa clave como `INGEST_API_KEY_VALUE`

Ejemplo de build local para enlazar la simulacion con una casa y dispositivo concretos:

```bash
export ARDUINO_BUILD_PROPERTIES=$'build.extra_flags=-DDEVICE_ID_VALUE=12 -DHOUSE_ID_VALUE=3 -DDEVICE_HARDWARE_UID_VALUE=\"HW-WOKWI-ESP32-01\" -DINGEST_API_KEY_VALUE=\"wokwi-dev-ingest-key\"'
./simulacion/build_wokwi_bundle.sh
```

## Modo local y modo público

El firmware soporta dos modos:

- `BACKEND_LOCAL`: usa `http://host.wokwi.internal:3000` para pruebas en Wokwi o desarrollo local.
- `BACKEND_PUBLIC`: usa la URL configurada en `BACKEND_BASE_URL_PUBLIC`, pensada para el backend desplegado en Railway.

Para que ambos escenarios funcionen correctamente:

1. En desarrollo local / Wokwi:
   - deja `BACKEND_MODE` en `BACKEND_LOCAL`
   - usa `NODE_ENV=development` en `backend/.env`
   - deja `DB_SYNC_ALTER=false` salvo que estes trabajando contra una base local desechable
   - deja `DB_USE_SYNC=true` y `DB_RUN_MIGRATIONS=true` para mantener el bootstrap local
   - establece `FRONTEND_ORIGIN=http://localhost:8000,http://127.0.0.1:8000`
   - asegúrate de tener el backend local corriendo en `http://host.wokwi.internal:3000`
   - usa una `INGEST_API_KEY` propia y segura (no de ejemplo)

2. En Railway:
   - cambia `BACKEND_MODE` a `BACKEND_PUBLIC`
   - actualiza `BACKEND_BASE_URL_PUBLIC` con la URL de tu backend de Railway
   - configura la misma `INGEST_API_KEY` en Railway y en el build de simulacion (macro `INGEST_API_KEY_VALUE`)
   - mantén `DB_RUN_MIGRATIONS=true`; cuando ya no dependas del bootstrap por `sync`, podrás pasar `DB_USE_SYNC=false`
   - para una base nueva, ejecuta primero `npm run migrate` o deja `DB_RUN_MIGRATIONS=true` en el arranque para que se cree el esquema base

El repositorio deja `BACKEND_LOCAL` como valor predeterminado para facilitar las pruebas locales. Cuando vuelvas a Railway, usa `BACKEND_PUBLIC` y la URL real del servicio.

## Modelo de datos extendido

El esquema de la base de datos cubre el ciclo completo de deteccion, almacenamiento historico, confirmacion de alertas y control remoto. Esta organizado en 18 tablas que se crean automaticamente con las migraciones en `backend/src/db/migrations/`.

### Tablas principales

| Tabla                      | Responsabilidad                                                                                   |
|----------------------------|---------------------------------------------------------------------------------------------------|
| `houses` (vivienda)        | Vivienda/unidad fisica monitoreada.                                                               |
| `ubicacion_instalacion`    | Puntos fisicos dentro de la vivienda (cocina, patio, etc.) para ubicar sensores.                  |
| `devices` (dispositivo_iot)| Nodo ESP32 con credenciales propias, firmware y ubicacion logica.                                 |
| `sensores`                 | Sensores individuales que cuelgan de un device (caudal, presion, valvula, temperatura).           |
| `readings` (lectura_caudal)| Telemetria cruda por lectura, vinculable a `sensor_id`.                                           |
| `estado_sistema`           | Historico de estados por device (`NORMAL`, `ALERTA`, `FUGA`, `MANTENIMIENTO`, `OFFLINE`).         |
| `incidente_fuga`           | Agregacion de eventos de fuga con duracion, volumen estimado y resolucion.                        |
| `alerts` (alerta)          | Alertas operativas; ahora con `incidente_id`, `ack_by_user_id`, `ack_note` y `tipo`.              |
| `electrovalvulas`          | Estado actual de la electrovalvula asociada a cada device (1:1 logica).                           |
| `acciones_valvula`         | Bitacora de aperturas/cierres/resets con origen (`MANUAL`, `AUTO_FUGA`, `PROGRAMADO`, `REMOTO`).  |
| `configuracion_deteccion`  | Umbrales por device: 2 L/min durante 30 min (configurable), presion, auto-cierre, notificaciones. |
| `comandos_remotos`         | Comandos enviados al device (`CERRAR_VALVULA`, `ABRIR_VALVULA`, `ACTUALIZAR_CONFIG`, etc.).       |
| `respuestas_comando`       | Respuesta 1:1 del device al comando remoto.                                                       |
| `users` (usuario)          | Cuentas de acceso al panel.                                                                       |
| `roles` (rol)              | Catalogo de roles (`admin`, `operator`, `resident`, `tecnico`).                                   |
| `user_roles`               | Relacion muchos-a-muchos usuario <-> rol.                                                         |
| `auditoria_sistema`        | Trazabilidad de acciones (usuario, entidad, accion, IP, user-agent, payload).                     |

### Diagrama ER (resumen)

```mermaid
erDiagram
    HOUSES ||--o{ DEVICES : contiene
    HOUSES ||--o{ UBICACION_INSTALACION : define
    HOUSES ||--o{ USERS : residen
    DEVICES ||--o{ SENSORES : integra
    DEVICES ||--|| ELECTROVALVULAS : controla
    DEVICES ||--|| CONFIGURACION_DETECCION : tiene
    DEVICES ||--o{ READINGS : reporta
    DEVICES ||--o{ ESTADO_SISTEMA : registra
    DEVICES ||--o{ INCIDENTE_FUGA : genera
    DEVICES ||--o{ ALERTS : emite
    DEVICES ||--o{ COMANDOS_REMOTOS : recibe
    UBICACION_INSTALACION ||--o{ SENSORES : ubica
    SENSORES ||--o{ READINGS : origina
    INCIDENTE_FUGA ||--o{ ALERTS : agrupa
    ELECTROVALVULAS ||--o{ ACCIONES_VALVULA : bitacora
    COMANDOS_REMOTOS ||--|| RESPUESTAS_COMANDO : responde
    USERS ||--o{ USER_ROLES : asigna
    ROLES ||--o{ USER_ROLES : agrupa
    USERS ||--o{ AUDITORIA_SISTEMA : audita
    USERS ||--o{ ACCIONES_VALVULA : ejecuta
    USERS ||--o{ COMANDOS_REMOTOS : envia
```

### Deteccion de fuga configurable

La tabla `configuracion_deteccion` permite ajustar por device:

- `umbral_flow_lmin` (default `2.0`) — caudal minimo continuo que dispara la deteccion.
- `ventana_minutos` (default `30`) — ventana temporal durante la que se evalua el umbral.
- `umbral_presion_min_kpa` / `umbral_presion_max_kpa` — rango valido de presion.
- `auto_cierre_valvula` — si se debe emitir automaticamente un `comando_remoto` de cierre ante fuga confirmada.
- `notificar_email` — si se debe generar notificacion.

Cuando un device supera el umbral durante toda la ventana, el backend:

1. Abrir un registro en `incidente_fuga` con `estado = ABIERTO`.
2. Crear la alerta asociada con `tipo = FUGA` y `incidente_id`.
3. Si `auto_cierre_valvula = true`, encolar un `comando_remoto` tipo `CERRAR_VALVULA`.
4. Escribir el cambio de estado en `estado_sistema`.
5. Registrar la accion en `auditoria_sistema`.

### Control remoto de la valvula

- `POST` al backend genera un registro en `comandos_remotos` con `estado = PENDIENTE`.
- El ESP32 consulta/recibe el comando, actua y responde → `respuestas_comando` con `codigo_resultado`.
- El estado actual de la valvula se persiste en `electrovalvulas` y cada accion queda en `acciones_valvula`.
- Los modos soportados son `AUTO`, `MANUAL` y `BLOQUEADA`.

### Confirmacion de alertas con trazabilidad

`PATCH /api/alerts/:id/ack` pobla ademas:

- `acknowledged = true`
- `ack_at = NOW()`
- `ack_by_user_id = <usuario autenticado>`
- `ack_note = <mensaje opcional>`

Todas las tablas criticas cuentan con indices compuestos (`device_id + ts`, `device_id + estado`, `device_id + detected_at`) para soportar consultas de dashboard e historicos de forma eficiente.

## Notas de operacion

- El frontend Angular es publico en lectura.
- El login solo se usa para confirmar alertas y acceder al panel admin.
- En local la UI vive en `http://localhost:8000/` y consume el backend por CORS.
- Si el backend falla, el ESP32 sigue detectando fugas y actuando localmente.
- No existe cola offline en v1: si un POST falla, se reintenta en el siguiente ciclo.
- No se usa `data/`, LittleFS ni una pagina web embebida en el ESP32.
- Para Railway, deja `NODE_ENV=production`, configura `PORT` desde la plataforma y establece `FRONTEND_ORIGIN` solo con la URL real del frontend permitido.

## Despliegue separado (3 servicios)

1. **Backend (Railway):** despliega `backend/` y configura `DB_*`, `JWT_SECRET`, `INGEST_API_KEY`, `FRONTEND_ORIGIN`.
2. **Frontend Angular (Railway o hosting estatico):** sube `frontend-angular/`, ajusta `public/app-config.js` con la URL publica del backend y ejecuta `npm run build` para generar `dist/frontend-angular`.
3. **Simulacion (Wokwi):** usa `BACKEND_BASE_URL_PUBLIC` apuntando al backend y `INGEST_API_KEY` igual al backend.

## Railway con 3 servicios separados

Usa tres servicios dentro del mismo proyecto de Railway:

Nombra los servicios exactamente asi para poder copiar y pegar las variables sin cambios:

- `MySQL`
- `backend`
- `frontend-angular`

1. **MySQL**
   - Crea una base MySQL desde Railway.
   - Para importar datos desde tu maquina, usa la conexion publica/TCP Proxy del servicio MySQL.

2. **Backend**
   - Conecta el repo y establece `Root Directory` en `backend`.
   - Comando de inicio: deja `npm start`.
   - Genera un dominio publico para el servicio.
   - Variables recomendadas:
   - Puedes copiar [backend/.env.railway.example](/home/duvan/IOt/backend/.env.railway.example) al Raw Editor de Railway.

```env
NODE_ENV=production
DB_SYNC_ALTER=false
JWT_SECRET=pon_aqui_un_secreto_largo_y_random
INGEST_API_KEY=pon_una_clave_larga_y_random_para_dispositivos

DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASS=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}

FRONTEND_ORIGIN=https://TU-FRONTEND.up.railway.app
```

3. **Frontend Angular**
   - Conecta el mismo repo y establece `Root Directory` en `frontend-angular`.
   - Comando de build: `npm run build`.
   - Comando de inicio: sirve `dist/frontend-angular` con un hosting estatico o usa `npm start` si hay un runner configurado.
   - Antes del build, actualiza `public/app-config.js` con la URL publica del backend:

```js
window.__APP_CONFIG__ = {
  apiBaseUrl: 'https://TU-BACKEND.up.railway.app'
};
```

Flujo recomendado de configuracion:

1. Despliega primero `MySQL`.
2. Despliega `backend` y genera su dominio publico.
3. Despliega `frontend-angular` apuntando `apiBaseUrl` al dominio publico del backend.
4. Vuelve al `backend` y actualiza `FRONTEND_ORIGIN` con el dominio publico real del frontend.
5. En Wokwi, configura `BACKEND_BASE_URL_PUBLIC` con el dominio del backend y la misma `INGEST_API_KEY`.

Si usas exactamente los nombres `MySQL`, `backend` y `frontend-angular`, puedes dejar las referencias cruzadas asi:

- `backend`: `DB_HOST=${{MySQL.MYSQLHOST}}`, `FRONTEND_ORIGIN=https://${{frontend-angular.RAILWAY_PUBLIC_DOMAIN}}`
- `frontend-angular`: usa `apiBaseUrl = 'https://${{backend.RAILWAY_PUBLIC_DOMAIN}}'` en `public/app-config.js`

Pruebas minimas en Railway:

- `https://TU-BACKEND.../api/health`
- `https://TU-FRONTEND.../` (SPA Angular con rutas `/login`, `/register`, `/dashboard`, `/admin`)
- Verifica que el dashboard cargue datos y que login/register no fallen por CORS.

### Migrar la base completa a Railway

Las migraciones del backend crean el esquema, pero no copian los registros locales. Para subir tu base completa:

```bash
cd backend
npm run db:dump
```

Luego crea `backend/.env.railway.local` con la URL publica real de MySQL en Railway:

```env
TARGET_DATABASE_URL=mysql://usuario:password@host-publico:puerto/base
```

Importa el backup:

```bash
npm run db:restore -- backups/NOMBRE_DEL_BACKUP.sql --yes
```

El restore reemplaza las tablas/datos del destino con el dump local, asi que conviene hacerlo antes de que el backend quede en uso real. Los backups y `.env.railway.local` estan ignorados por Git.
