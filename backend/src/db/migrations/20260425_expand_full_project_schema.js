"use strict";

const { DataTypes } = require("sequelize");

// ---------- Helpers idempotentes ----------

const tableExists = async (queryInterface, tableName) => {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch {
    return false;
  }
};

const ensureTable = async (queryInterface, tableName, definition, options, transaction) => {
  if (await tableExists(queryInterface, tableName)) return;
  await queryInterface.createTable(tableName, definition, { ...options, transaction });
};

const ensureColumn = async (queryInterface, tableName, columnName, definition, transaction) => {
  try {
    const table = await queryInterface.describeTable(tableName);
    if (table[columnName]) return;
    await queryInterface.addColumn(tableName, columnName, definition, { transaction });
  } catch (err) {
    if (!/no.*exist/i.test(String(err && err.message))) throw err;
  }
};

const ensureIndex = async (queryInterface, tableName, fields, options, transaction) => {
  const name = options && options.name;
  if (name) {
    try {
      await queryInterface.removeIndex(tableName, name, { transaction });
    } catch {
      /* index did not exist */
    }
  }
  try {
    await queryInterface.addIndex(tableName, fields, { ...options, transaction });
  } catch (err) {
    if (!/duplicate|exists/i.test(String(err && err.message))) throw err;
  }
};

const seedRoles = async (sequelize, transaction) => {
  if (!sequelize || typeof sequelize.query !== "function") return;
  const baseRoles = [
    { code: "admin", nombre: "Administrador", descripcion: "Acceso total al sistema" },
    { code: "operator", nombre: "Operador", descripcion: "Gestiona dispositivos, alertas y comandos" },
    { code: "resident", nombre: "Residente", descripcion: "Consulta su vivienda y confirma alertas" },
    { code: "tecnico", nombre: "Tecnico de mantenimiento", descripcion: "Atiende incidentes de fuga" }
  ];

  for (const role of baseRoles) {
    try {
      await sequelize.query(
        "INSERT IGNORE INTO roles (code, nombre, descripcion, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
        { replacements: [role.code, role.nombre, role.descripcion], transaction }
      );
    } catch {
      /* dialecto sin INSERT IGNORE o fila existente: no critico */
    }
  }
};

// ---------- Migracion principal ----------

module.exports = {
  up: async ({ sequelize, queryInterface, transaction }) => {
    // 1. Catalogo de roles + relacion muchos-a-muchos con usuarios.
    await ensureTable(
      queryInterface,
      "roles",
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
        nombre: { type: DataTypes.STRING(120), allowNull: false },
        descripcion: { type: DataTypes.STRING(255), allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    await ensureTable(
      queryInterface,
      "user_roles",
      {
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        role_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: "roles", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        assigned_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    // 2. Ubicaciones fisicas de instalacion (desacopla el device del lugar).
    await ensureTable(
      queryInterface,
      "ubicacion_instalacion",
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        house_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "houses", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        nombre: { type: DataTypes.STRING(120), allowNull: false },
        descripcion: { type: DataTypes.STRING(255), allowNull: true },
        area: { type: DataTypes.STRING(80), allowNull: true },
        piso: { type: DataTypes.STRING(40), allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    // 3. Sensores individuales asociados a un dispositivo IoT.
    await ensureTable(
      queryInterface,
      "sensores",
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        device_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "devices", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        ubicacion_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "ubicacion_instalacion", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        tipo: {
          type: DataTypes.ENUM("caudal", "presion", "valvula", "temperatura", "otro"),
          allowNull: false,
          defaultValue: "caudal"
        },
        modelo: { type: DataTypes.STRING(80), allowNull: true },
        unidad: { type: DataTypes.STRING(20), allowNull: true },
        rango_min: { type: DataTypes.FLOAT, allowNull: true },
        rango_max: { type: DataTypes.FLOAT, allowNull: true },
        activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    // 4. Historico del estado general del sistema por dispositivo.
    await ensureTable(
      queryInterface,
      "estado_sistema",
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        device_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "devices", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        ts: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        estado: {
          type: DataTypes.ENUM("NORMAL", "ALERTA", "FUGA", "MANTENIMIENTO", "OFFLINE"),
          allowNull: false,
          defaultValue: "NORMAL"
        },
        motivo: { type: DataTypes.STRING(180), allowNull: true },
        metadata: { type: DataTypes.JSON, allowNull: true }
      },
      {},
      transaction
    );

    // 5. Incidentes de fuga (agregados, no cada lectura).
    await ensureTable(
      queryInterface,
      "incidente_fuga",
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        device_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "devices", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        detected_at: { type: DataTypes.DATE, allowNull: false },
        ended_at: { type: DataTypes.DATE, allowNull: true },
        flow_promedio_lmin: { type: DataTypes.FLOAT, allowNull: true },
        duracion_minutos: { type: DataTypes.INTEGER, allowNull: true },
        volumen_estimado_l: { type: DataTypes.FLOAT, allowNull: true },
        estado: {
          type: DataTypes.ENUM("ABIERTO", "CONFIRMADO", "FALSO_POSITIVO", "CERRADO"),
          allowNull: false,
          defaultValue: "ABIERTO"
        },
        umbral_flow_lmin: { type: DataTypes.FLOAT, allowNull: true },
        ventana_minutos: { type: DataTypes.INTEGER, allowNull: true },
        resuelto_por_user_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        resuelto_at: { type: DataTypes.DATE, allowNull: true },
        observaciones: { type: DataTypes.TEXT, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    // 6. Electrovalvulas asociadas al dispositivo (1:1 logica).
    await ensureTable(
      queryInterface,
      "electrovalvulas",
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        device_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: "devices", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        estado: {
          type: DataTypes.ENUM("ABIERTA", "CERRADA", "DESCONOCIDO"),
          allowNull: false,
          defaultValue: "DESCONOCIDO"
        },
        modo: {
          type: DataTypes.ENUM("AUTO", "MANUAL", "BLOQUEADA"),
          allowNull: false,
          defaultValue: "AUTO"
        },
        ultima_accion_at: { type: DataTypes.DATE, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    // 7. Bitacora de acciones sobre la electrovalvula.
    await ensureTable(
      queryInterface,
      "acciones_valvula",
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        valvula_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "electrovalvulas", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        tipo: {
          type: DataTypes.ENUM("ABRIR", "CERRAR", "RESETEAR", "CAMBIAR_MODO"),
          allowNull: false
        },
        origen: {
          type: DataTypes.ENUM("MANUAL", "AUTO_FUGA", "PROGRAMADO", "REMOTO"),
          allowNull: false,
          defaultValue: "MANUAL"
        },
        estado_resultado: {
          type: DataTypes.ENUM("PENDIENTE", "EXITOSO", "ERROR"),
          allowNull: false,
          defaultValue: "PENDIENTE"
        },
        ts: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        detalle: { type: DataTypes.STRING(255), allowNull: true }
      },
      {},
      transaction
    );

    // 8. Configuracion de deteccion de fuga (umbral 2 L/min durante 30 min, etc).
    await ensureTable(
      queryInterface,
      "configuracion_deteccion",
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        device_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: "devices", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        umbral_flow_lmin: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 2.0 },
        ventana_minutos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
        umbral_presion_min_kpa: { type: DataTypes.FLOAT, allowNull: true },
        umbral_presion_max_kpa: { type: DataTypes.FLOAT, allowNull: true },
        auto_cierre_valvula: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        notificar_email: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        updated_by_user_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    // 9. Comandos remotos enviados al dispositivo.
    await ensureTable(
      queryInterface,
      "comandos_remotos",
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        device_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "devices", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        tipo: {
          type: DataTypes.ENUM(
            "CERRAR_VALVULA",
            "ABRIR_VALVULA",
            "ACTUALIZAR_CONFIG",
            "ESCANEAR_WIFI",
            "REINICIAR",
            "SOLICITAR_ESTADO",
            "OTRO"
          ),
          allowNull: false
        },
        payload: { type: DataTypes.JSON, allowNull: true },
        estado: {
          type: DataTypes.ENUM("PENDIENTE", "ENVIADO", "EJECUTADO", "ERROR", "EXPIRADO"),
          allowNull: false,
          defaultValue: "PENDIENTE"
        },
        prioridad: {
          type: DataTypes.ENUM("BAJA", "NORMAL", "ALTA", "CRITICA"),
          allowNull: false,
          defaultValue: "NORMAL"
        },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        sent_at: { type: DataTypes.DATE, allowNull: true },
        expires_at: { type: DataTypes.DATE, allowNull: true }
      },
      {},
      transaction
    );

    // 10. Respuestas del dispositivo a los comandos remotos.
    await ensureTable(
      queryInterface,
      "respuestas_comando",
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        comando_id: {
          type: DataTypes.BIGINT,
          allowNull: false,
          unique: true,
          references: { model: "comandos_remotos", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        codigo_resultado: { type: DataTypes.STRING(40), allowNull: false },
        mensaje: { type: DataTypes.STRING(255), allowNull: true },
        payload: { type: DataTypes.JSON, allowNull: true },
        recibido_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    // 11. Auditoria general del sistema (trazabilidad de acciones).
    await ensureTable(
      queryInterface,
      "auditoria_sistema",
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        entidad: { type: DataTypes.STRING(80), allowNull: false },
        entidad_id: { type: DataTypes.STRING(80), allowNull: true },
        accion: { type: DataTypes.STRING(80), allowNull: false },
        detalle: { type: DataTypes.JSON, allowNull: true },
        ip: { type: DataTypes.STRING(64), allowNull: true },
        user_agent: { type: DataTypes.STRING(255), allowNull: true },
        ts: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    // ---------- Extensiones a tablas existentes ----------

    await ensureColumn(
      queryInterface,
      "alerts",
      "incidente_id",
      {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "incidente_fuga", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      transaction
    );
    await ensureColumn(
      queryInterface,
      "alerts",
      "ack_by_user_id",
      {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      transaction
    );
    await ensureColumn(
      queryInterface,
      "alerts",
      "ack_note",
      { type: DataTypes.STRING(500), allowNull: true },
      transaction
    );
    await ensureColumn(
      queryInterface,
      "alerts",
      "tipo",
      { type: DataTypes.STRING(40), allowNull: false, defaultValue: "FUGA" },
      transaction
    );

    await ensureColumn(
      queryInterface,
      "readings",
      "sensor_id",
      {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "sensores", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      transaction
    );

    // ---------- Indices para historico, dashboard y trazabilidad ----------

    await ensureIndex(queryInterface, "roles", ["code"], { name: "roles_code_idx", unique: true }, transaction);
    await ensureIndex(queryInterface, "user_roles", ["role_id"], { name: "user_roles_role_id_idx" }, transaction);
    await ensureIndex(
      queryInterface,
      "ubicacion_instalacion",
      ["house_id"],
      { name: "ubicacion_house_id_idx" },
      transaction
    );
    await ensureIndex(queryInterface, "sensores", ["device_id"], { name: "sensores_device_id_idx" }, transaction);
    await ensureIndex(queryInterface, "sensores", ["tipo"], { name: "sensores_tipo_idx" }, transaction);
    await ensureIndex(
      queryInterface,
      "estado_sistema",
      ["device_id", "ts"],
      { name: "estado_sistema_device_ts_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "estado_sistema",
      ["estado"],
      { name: "estado_sistema_estado_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "incidente_fuga",
      ["device_id", "detected_at"],
      { name: "incidente_device_detected_idx" },
      transaction
    );
    await ensureIndex(queryInterface, "incidente_fuga", ["estado"], { name: "incidente_estado_idx" }, transaction);
    await ensureIndex(
      queryInterface,
      "acciones_valvula",
      ["valvula_id", "ts"],
      { name: "acciones_valvula_valvula_ts_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "acciones_valvula",
      ["tipo"],
      { name: "acciones_valvula_tipo_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "comandos_remotos",
      ["device_id", "estado"],
      { name: "comandos_device_estado_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "comandos_remotos",
      ["created_at"],
      { name: "comandos_created_at_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "comandos_remotos",
      ["tipo"],
      { name: "comandos_tipo_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "respuestas_comando",
      ["recibido_at"],
      { name: "respuestas_recibido_at_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "auditoria_sistema",
      ["entidad", "entidad_id"],
      { name: "auditoria_entidad_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "auditoria_sistema",
      ["ts"],
      { name: "auditoria_ts_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "auditoria_sistema",
      ["user_id"],
      { name: "auditoria_user_id_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "alerts",
      ["incidente_id"],
      { name: "alerts_incidente_id_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "alerts",
      ["tipo"],
      { name: "alerts_tipo_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "readings",
      ["sensor_id"],
      { name: "readings_sensor_id_idx" },
      transaction
    );

    // ---------- Datos iniciales ----------

    await seedRoles(sequelize, transaction);
  }
};
