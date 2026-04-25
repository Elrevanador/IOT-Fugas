# TODO - Expansión de esquema BD IoT agua

## Completado ✅

- [x] Crear migración nueva con tablas faltantes y relaciones:
  - [x] ubicacion_instalacion
  - [x] sensores
  - [x] estado_sistema
  - [x] incidente_fuga
  - [x] electrovalvulas
  - [x] acciones_valvula
  - [x] configuracion_deteccion
  - [x] comandos_remotos
  - [x] respuestas_comando
  - [x] roles
  - [x] user_roles
  - [x] auditoria_sistema
- [x] Extender tablas existentes (sin romper compatibilidad):
  - [x] `alerts` → `incidente_id`, `ack_by_user_id`, `ack_note`, `tipo`
  - [x] `readings` → `sensor_id`
- [x] Agregar índices para histórico/dashboard y trazabilidad
- [x] Seed automático de roles base (admin, operator, resident, tecnico)
- [x] Crear modelos Sequelize para las 12 nuevas tablas
- [x] Registrar asociaciones completas en `models/index.js`
- [x] Tests unitarios de la nueva migración (creación + idempotencia)
- [x] Ejecutar suite completa de backend (`npm test`) → 23/23 OK
- [x] Documentar nuevo modelo de datos en `README.md`
- [x] Controllers/rutas REST para ubicaciones, sensores, incidentes, válvulas, comandos remotos, configuración de detección y auditoría.
- [x] Endpoint de confirmación de alertas (PATCH `/alerts/:id/ack`) que registra `ack_by_user_id`/`ack_note`.
- [x] Servicio de detección de fuga conectado al ingreso de lecturas (2 L/min × 30 min por defecto) y apertura/cierre de `incidente_fuga`.
- [x] Integración backend para ESP32: consulta de `comandos_remotos` pendientes y recepción de `respuestas_comando`.

## Próximos pasos

- [ ] Panel Angular de historial, incidentes y control remoto.
- [ ] Migrar `users.role` (ENUM legacy) a tabla `user_roles` de forma gradual.
