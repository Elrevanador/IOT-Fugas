# Proyecto Wokwi - Deteccion de Fugas con ESP32

Este proyecto conecta una simulacion ESP32 en Wokwi con un backend Node.js + MySQL y un panel web publico. No usa ThingSpeak y tampoco usa la carpeta `data/`: el flujo activo es firmware -> backend -> frontend, con backend y frontend desplegados como servicios separados o, en local, con una version same-origin servida desde el propio backend.

## Estructura principal

- `simulacion/simulacion.ino`: firmware del ESP32
- `frontend/`: UI canonica desplegada como sitio estatico
- `backend/`: API REST, autenticacion JWT, almacenamiento MySQL y copia same-origin de la UI en `backend/public/`
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
- Panel principal en su URL publica de frontend

## Flujo actual

1. El ESP32 mide flujo y presion cada 2 segundos.
2. La logica local calcula riesgo y estado (`NORMAL`, `ALERTA`, `FUGA`, `ERROR`).
3. El ESP32 publica la lectura a `POST /api/readings` con `x-device-key`.
4. El backend guarda lecturas y alertas en MySQL.
5. El frontend consulta `GET /api/public/dashboard` cada 2 segundos (URL del backend).
6. Los operadores pueden confirmar alertas desde el panel usando JWT.

## Wokwi en VS Code

1. Abre la carpeta `/home/duvan/IOt/simulacion`
2. No uses `F5`
3. Ejecuta `Wokwi: Start Simulator`

`simulacion/wokwi.toml` ahora carga directamente `build/simulacion.ino.bin`.

## Build reproducible

Si cambias `simulacion/simulacion.ino`, ejecuta:

```bash
./build_wokwi_bundle.sh
```

El script sincroniza las dependencias declaradas en `simulacion/libraries.txt` antes de compilar y prioriza las librerias locales en `simulacion/libraries/`, para evitar diferencias entre Wokwi y `arduino-cli` local.

La libreria `LiquidCrystal_I2C` se deja versionada dentro del proyecto para evitar el warning de arquitectura AVR que generan instalaciones antiguas de `LiquidCrystal I2C`.

Ese script genera:

- `simulacion/build/simulacion.ino.bin`
- `simulacion/build/simulacion.ino.elf`

Wokwi usa `simulacion/build/simulacion.ino.bin`, asi que ya no hay pasos extra de LittleFS ni binarios combinados.

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

En Railway configura las mismas variables como variables del servicio. `INGEST_API_KEY` debe coincidir con la constante `INGEST_API_KEY` de `simulacion/simulacion.ino`.

### Ejecutar

```bash
cd backend
npm install
npm run dev
```

- UI same-origin local: `http://localhost:3000/`
- API health: `http://localhost:3000/api/health`
- Frontend local separado:

```bash
cd frontend
npm install
npm run dev
```

- Frontend local separado: `http://localhost:8000/`
- La UI de `backend/public/` se sincroniza automaticamente desde `frontend/` cuando ejecutas `npm run dev` o `npm start` en `backend/`.
- Si usas la base Railway desde local, deja `DB_SYNC_ALTER=false` para no intentar alterar el esquema remoto al arrancar.

### Endpoints principales

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/public/dashboard`
- `POST /api/readings` (ESP32 -> backend, requiere `x-device-key`)
- `GET /api/readings`
- `GET /api/readings/latest`
- `GET /api/alerts`
- `PATCH /api/alerts/:id/ack`
- `GET /api/devices`

### Payload esperado del ESP32

```json
{
  "deviceName": "ESP32-WOKWI-01",
  "flow_lmin": 1.8,
  "pressure_kpa": 100.4,
  "risk": 62,
  "state": "ALERTA"
}
```

Header requerido:

```http
x-device-key: wokwi-dev-ingest-key
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
   - establece `FRONTEND_ORIGIN=http://localhost:8000,http://127.0.0.1:8000`
   - asegúrate de tener el backend local corriendo en `http://host.wokwi.internal:3000`
   - usa `INGEST_API_KEY=wokwi-dev-ingest-key`

2. En Railway:
   - cambia `BACKEND_MODE` a `BACKEND_PUBLIC`
   - actualiza `BACKEND_BASE_URL_PUBLIC` con la URL de tu backend de Railway
   - configura la misma `INGEST_API_KEY` en las variables de entorno de Railway y en `simulacion/modulos/config.cpp`

El repositorio deja `BACKEND_LOCAL` como valor predeterminado para facilitar las pruebas locales, pero el despliegue Railway debe usar `BACKEND_PUBLIC` y la URL real del servicio.

## Notas de operacion

- El frontend es publico en lectura.
- El login solo se usa para confirmar alertas.
- En local puedes usar dos modos de UI:
  - `http://localhost:8000/` como frontend separado con CORS.
  - `http://localhost:3000/` como UI same-origin servida por Express.
- Si el backend falla, el ESP32 sigue detectando fugas y actuando localmente.
- No existe cola offline en v1: si un POST falla, se reintenta en el siguiente ciclo.
- No se usa `data/`, LittleFS ni una pagina web embebida en el ESP32.
- Para Railway, deja `NODE_ENV=production`, configura `PORT` desde la plataforma y establece `FRONTEND_ORIGIN` solo con la URL real del frontend permitido.

## Despliegue separado (3 servicios)

1. **Backend (Railway):** despliega `backend/` y configura `DB_*`, `JWT_SECRET`, `INGEST_API_KEY`, `FRONTEND_ORIGIN`.
2. **Frontend (Railway o hosting estatico):** sube `frontend/` y define `PUBLIC_API_BASE_URL` con la URL publica del backend para que la build genere `dist/config.js`.
3. **Simulacion (Wokwi):** usa `BACKEND_BASE_URL_PUBLIC` apuntando al backend y `INGEST_API_KEY` igual al backend.

## Railway con 3 servicios separados

Usa tres servicios dentro del mismo proyecto de Railway:

Nombra los servicios exactamente asi para poder copiar y pegar las variables sin cambios:

- `MySQL`
- `backend`
- `frontend`

1. **MySQL**
   - Crea una base MySQL desde Railway.

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
INGEST_API_KEY=debe_coincidir_con_wokwi

DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASS=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}

FRONTEND_ORIGIN=https://TU-FRONTEND.up.railway.app
```

3. **Frontend**
   - Conecta el mismo repo y establece `Root Directory` en `frontend`.
   - Comando de inicio: deja `npm start`.
   - Genera un dominio publico para el servicio.
   - Variables recomendadas:
   - Puedes copiar [frontend/.env.railway.example](/home/duvan/IOt/frontend/.env.railway.example) al Raw Editor de Railway.

```env
PUBLIC_API_BASE_URL=https://TU-BACKEND.up.railway.app
```

Flujo recomendado de configuracion:

1. Despliega primero `MySQL`.
2. Despliega `backend` y genera su dominio publico.
3. Despliega `frontend` usando `PUBLIC_API_BASE_URL` apuntando al dominio publico del backend.
4. Vuelve al `backend` y actualiza `FRONTEND_ORIGIN` con el dominio publico real del frontend.
5. En Wokwi, configura `BACKEND_BASE_URL_PUBLIC` con el dominio del backend y la misma `INGEST_API_KEY`.

Si usas exactamente los nombres `MySQL`, `backend` y `frontend`, puedes dejar las referencias cruzadas asi:

- `backend`: `DB_HOST=${{MySQL.MYSQLHOST}}`, `FRONTEND_ORIGIN=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}`
- `frontend`: `PUBLIC_API_BASE_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}`

Pruebas minimas en Railway:

- `https://TU-BACKEND.../api/health`
- `https://TU-FRONTEND.../register/`
- `https://TU-FRONTEND.../login/`
- `https://TU-FRONTEND.../dashboard/`
- Verifica que el dashboard cargue datos y que login/register no fallen por CORS.
