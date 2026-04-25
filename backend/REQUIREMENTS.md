# Requisitos del Proyecto Backend

## Requisitos del Sistema

### Obligatorios
- **Node.js** >= v18.0.0
- **npm** >= v9.0.0
- **MySQL** >= v5.7 o **MariaDB** >= v10.3

### Verificar versiones instaladas
```bash
node --version
npm --version
mysql --version
```

## Dependencias del Proyecto

Las dependencias están definidas en `package.json` y se instalan automáticamente con `npm install`.

### Dependencias Principales
- **express** ^4.19.2 - Framework web
- **sequelize** ^6.37.3 - ORM para Node.js
- **mysql2** ^3.11.0 - Driver MySQL
- **jsonwebtoken** ^9.0.2 - Autenticación JWT
- **bcryptjs** ^2.4.3 - Hash de contraseñas
- **express-validator** ^7.2.0 - Validación de datos
- **dotenv** ^16.4.5 - Variables de entorno
- **cors** ^2.8.6 - CORS habilitado

## Instalación

### 1. Instalar dependencias
```bash
cd backend
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
```

Edita `.env` y configura según tu ambiente:

#### Local Development
```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=iot_user
DB_PASS=change_this_password
DB_NAME=iot_water
JWT_SECRET=tu_secreto_jwt_largo_aqui
INGEST_API_KEY=tu_clave_api_larga_aqui
FRONTEND_ORIGIN=http://localhost:8000,http://127.0.0.1:8000
```

#### Production (Railway)
```env
NODE_ENV=production
DATABASE_URL=mysql://usuario:password@host:puerto/base
JWT_SECRET=tu_secreto_jwt_largo_y_seguro
INGEST_API_KEY=tu_clave_api_larga_y_segura
FRONTEND_ORIGIN=https://tu-frontend.railway.app
TRUST_PROXY=loopback
```

### 3. Base de datos

#### Crear base de datos
```sql
CREATE DATABASE iot_water CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'iot_user'@'localhost' IDENTIFIED BY 'change_this_password';
GRANT ALL PRIVILEGES ON iot_water.* TO 'iot_user'@'localhost';
FLUSH PRIVILEGES;
```

#### Ejecutar migraciones
```bash
npm run migrate
```

#### (Opcional) Seed de datos de demostración
```bash
npm run seed:demo
```

## Comandos Disponibles

```bash
# Desarrollo con auto-reload
npm run dev

# Producción
npm start

# Ejecutar migraciones
npm run migrate

# Seed de demostración
npm run seed:demo

# Tests
npm test
```

## Health Check

```bash
curl http://localhost:3000/api/health
```

## Variables de Entorno Clave

| Variable | Defecto | Descripción |
|----------|---------|-------------|
| `NODE_ENV` | development | Ambiente (development/production) |
| `PORT` | 3000 | Puerto del servidor |
| `DB_SYNC_ALTER` | false | Sincronizar modelos automáticamente |
| `DB_USE_SYNC` | true | Usar Sequelize sync en lugar de migraciones |
| `DB_RUN_MIGRATIONS` | true | Ejecutar migraciones al iniciar |
| `JWT_SECRET` | - | Secreto para firmar JWTs (requerido) |
| `INGEST_API_KEY` | - | Clave API para dispositivos (requerido) |
| `FRONTEND_ORIGIN` | - | Origins CORS permitidos |
| `DATABASE_URL` | - | URL de conexión completa (alternativa a DB_*) |

## Troubleshooting

### Error: "Cannot find module"
```bash
rm -rf node_modules package-lock.json
npm install
```

### Error: "Connection refused (localhost:3306)"
- Verifica que MySQL esté corriendo
- Comprueba credenciales en `.env`
- Verifica host/puerto: `DB_HOST` y `DB_PORT`

### Error: "ER_ACCESS_DENIED_FOR_USER"
- Usuario/contraseña incorrectos en `.env`
- Usuario no tiene permisos en la base de datos
- Ejecuta nuevamente el comando GRANT PRIVILEGES

### Puerto ya en uso
Cambia en `.env`:
```env
PORT=3001  # o cualquier puerto disponible
```

## Seguridad Importante

⚠️ **NUNCA** comitees `.env` con valores reales
- Usa `.env.example` como template
- Genera secretos complejos para `JWT_SECRET` e `INGEST_API_KEY`
- En producción, usa gestión de secretos (Railway, Vercel, etc.)

## Despliegue

Ver instrucciones en [README.md](./README.md) para Railway.
