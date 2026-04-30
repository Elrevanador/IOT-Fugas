"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const initSchemaMigration = require("../src/db/migrations/20260420_0001_init_schema");
const deviceCredentialsMigration = require("../src/db/migrations/20260420_add_device_api_credentials");
const deviceMetadataMigration = require("../src/db/migrations/20260420_add_device_metadata");
const expandFullProjectMigration = require("../src/db/migrations/20260425_expand_full_project_schema");
const rbacResourcesMigration = require("../src/db/migrations/20260430_add_rbac_resources");
const userIdentityMigration = require("../src/db/migrations/20260430_add_user_identity_fields");

test("migracion inicial crea las tablas base cuando no existen", async () => {
  const createdTables = [];
  const addedIndexes = [];
  const describedTables = new Map();

  const queryInterface = {
    describeTable: async (tableName) => {
      if (!describedTables.has(tableName)) {
        throw new Error(`Tabla ${tableName} no existe`);
      }
      return describedTables.get(tableName);
    },
    createTable: async (tableName, definition) => {
      createdTables.push(tableName);
      describedTables.set(tableName, definition);
    },
    removeIndex: async () => {
      throw new Error("index no existe");
    },
    addIndex: async (tableName, fields, options) => {
      addedIndexes.push({ tableName, fields, name: options?.name });
    }
  };

  await initSchemaMigration.up({ queryInterface, transaction: {} });

  assert.deepEqual(createdTables, ["houses", "devices", "users", "readings", "alerts"]);
  assert.equal(addedIndexes.length > 0, true);
  assert.equal(
    addedIndexes.some((item) => item.tableName === "readings" && item.name === "readings_device_id_ts_idx"),
    true
  );
});

test("migracion de credenciales agrega columnas solo si faltan", async () => {
  const addedColumns = [];

  const queryInterface = {
    describeTable: async () => ({
      id: {},
      api_key_hash: {}
    }),
    addColumn: async (tableName, columnName) => {
      addedColumns.push({ tableName, columnName });
    }
  };

  await deviceCredentialsMigration.up({ queryInterface, transaction: {} });

  assert.deepEqual(addedColumns, [{ tableName: "devices", columnName: "api_key_hint" }]);
});

test("migracion de metadata agrega campos operativos del dispositivo", async () => {
  const addedColumns = [];
  let described = {
    id: {},
    api_key_hash: {},
    api_key_hint: {}
  };

  const queryInterface = {
    describeTable: async () => described,
    addColumn: async (tableName, columnName) => {
      addedColumns.push({ tableName, columnName });
      described = { ...described, [columnName]: {} };
    }
  };

  await deviceMetadataMigration.up({ queryInterface, transaction: {} });

  assert.deepEqual(addedColumns, [
    { tableName: "devices", columnName: "device_type" },
    { tableName: "devices", columnName: "firmware_version" },
    { tableName: "devices", columnName: "hardware_uid" },
    { tableName: "devices", columnName: "last_seen_at" }
  ]);
});

test("migracion 20260425 crea todas las tablas del esquema extendido", async () => {
  const createdTables = [];
  const addedColumns = [];
  const addedIndexes = [];
  const seedInserts = [];
  const describedTables = new Map([
    ["users", { id: {} }],
    ["houses", { id: {} }],
    ["devices", { id: {} }],
    ["readings", { id: {} }],
    ["alerts", { id: {}, ts: {}, severity: {}, message: {}, acknowledged: {}, ack_at: {} }]
  ]);

  const queryInterface = {
    describeTable: async (tableName) => {
      if (!describedTables.has(tableName)) {
        throw new Error(`Tabla ${tableName} no existe`);
      }
      return describedTables.get(tableName);
    },
    createTable: async (tableName) => {
      createdTables.push(tableName);
      describedTables.set(tableName, { id: {} });
    },
    addColumn: async (tableName, columnName) => {
      addedColumns.push({ tableName, columnName });
      const current = describedTables.get(tableName) || {};
      describedTables.set(tableName, { ...current, [columnName]: {} });
    },
    removeIndex: async () => {
      throw new Error("index no existe");
    },
    addIndex: async (tableName, fields, options) => {
      addedIndexes.push({ tableName, fields, name: options && options.name });
    }
  };

  const sequelize = {
    query: async (sql, opts) => {
      seedInserts.push({ sql, replacements: opts && opts.replacements });
    }
  };

  await expandFullProjectMigration.up({ sequelize, queryInterface, transaction: {} });

  const expectedNewTables = [
    "roles",
    "user_roles",
    "ubicacion_instalacion",
    "sensores",
    "estado_sistema",
    "incidente_fuga",
    "electrovalvulas",
    "acciones_valvula",
    "configuracion_deteccion",
    "comandos_remotos",
    "respuestas_comando",
    "auditoria_sistema"
  ];
  assert.deepEqual(createdTables, expectedNewTables);

  const expectedAlertsColumns = ["incidente_id", "ack_by_user_id", "ack_note", "tipo"];
  for (const columnName of expectedAlertsColumns) {
    assert.equal(
      addedColumns.some((item) => item.tableName === "alerts" && item.columnName === columnName),
      true,
      `Falta columna alerts.${columnName}`
    );
  }
  assert.equal(
    addedColumns.some((item) => item.tableName === "readings" && item.columnName === "sensor_id"),
    true,
    "Falta columna readings.sensor_id"
  );

  assert.equal(
    addedIndexes.some((idx) => idx.name === "estado_sistema_device_ts_idx"),
    true
  );
  assert.equal(
    addedIndexes.some((idx) => idx.name === "incidente_device_detected_idx"),
    true
  );
  assert.equal(
    addedIndexes.some((idx) => idx.name === "comandos_device_estado_idx"),
    true
  );

  // Se deben haber sembrado los 4 roles base.
  assert.equal(seedInserts.length >= 4, true);
  const roleCodesSeeded = seedInserts.map((item) => item.replacements && item.replacements[0]);
  for (const code of ["admin", "operator", "resident", "tecnico"]) {
    assert.equal(roleCodesSeeded.includes(code), true, `Falta seed del rol ${code}`);
  }
});

test("migracion 20260425 es idempotente cuando las tablas ya existen", async () => {
  const createdTables = [];
  const addedColumns = [];

  const alertsFull = {
    id: {},
    incidente_id: {},
    ack_by_user_id: {},
    ack_note: {},
    tipo: {}
  };
  const readingsFull = { id: {}, sensor_id: {} };

  const existingTables = new Set([
    "users",
    "houses",
    "devices",
    "readings",
    "alerts",
    "roles",
    "user_roles",
    "ubicacion_instalacion",
    "sensores",
    "estado_sistema",
    "incidente_fuga",
    "electrovalvulas",
    "acciones_valvula",
    "configuracion_deteccion",
    "comandos_remotos",
    "respuestas_comando",
    "auditoria_sistema"
  ]);

  const queryInterface = {
    describeTable: async (tableName) => {
      if (!existingTables.has(tableName)) {
        throw new Error(`Tabla ${tableName} no existe`);
      }
      if (tableName === "alerts") return alertsFull;
      if (tableName === "readings") return readingsFull;
      return { id: {} };
    },
    createTable: async (tableName) => {
      createdTables.push(tableName);
    },
    addColumn: async (tableName, columnName) => {
      addedColumns.push({ tableName, columnName });
    },
    removeIndex: async () => {},
    addIndex: async () => {}
  };

  const sequelize = { query: async () => {} };

  await expandFullProjectMigration.up({ sequelize, queryInterface, transaction: {} });

  assert.deepEqual(createdTables, []);
  assert.deepEqual(addedColumns, []);
});

test("migracion 20260430 crea recursos y permisos RBAC", async () => {
  const createdTables = [];
  const addedIndexes = [];
  const seedQueries = [];
  const describedTables = new Map([
    ["roles", { id: {} }],
    ["users", { id: {} }]
  ]);

  const queryInterface = {
    describeTable: async (tableName) => {
      if (!describedTables.has(tableName)) {
        throw new Error(`Tabla ${tableName} no existe`);
      }
      return describedTables.get(tableName);
    },
    createTable: async (tableName, definition) => {
      createdTables.push(tableName);
      describedTables.set(tableName, definition);
    },
    addColumn: async () => {
      throw new Error("No deberia agregar columnas en tablas nuevas");
    },
    showIndex: async () => [],
    addIndex: async (tableName, fields, options) => {
      addedIndexes.push({ tableName, fields, name: options && options.name });
    }
  };

  const sequelize = {
    query: async (sql, opts) => {
      seedQueries.push({ sql, replacements: opts && opts.replacements });
    }
  };

  await rbacResourcesMigration.up({ sequelize, queryInterface, transaction: {} });

  assert.deepEqual(createdTables, ["resources", "role_resources"]);
  assert.equal(addedIndexes.some((idx) => idx.name === "resources_code_idx"), true);
  assert.equal(addedIndexes.some((idx) => idx.name === "role_resources_role_idx"), true);
  assert.equal(
    seedQueries.some((item) => item.replacements && item.replacements[0] === "dashboard"),
    true,
    "Falta seed del recurso dashboard"
  );
  assert.equal(
    seedQueries.some((item) => item.sql.includes("INSERT INTO role_resources")),
    true,
    "Falta seed de permisos por rol"
  );
});

test("migracion 20260430 agrega identidad de usuario", async () => {
  const addedColumns = [];
  const addedIndexes = [];
  let described = { id: {}, nombre: {}, email: {}, password_hash: {} };

  const queryInterface = {
    describeTable: async (tableName) => {
      if (tableName !== "users") throw new Error(`Tabla ${tableName} no existe`);
      return described;
    },
    addColumn: async (tableName, columnName) => {
      addedColumns.push({ tableName, columnName });
      described = { ...described, [columnName]: {} };
    },
    showIndex: async () => [],
    addIndex: async (tableName, fields, options) => {
      addedIndexes.push({ tableName, fields, name: options && options.name });
    }
  };

  await userIdentityMigration.up({ queryInterface, transaction: {} });

  assert.deepEqual(addedColumns, [
    { tableName: "users", columnName: "apellido" },
    { tableName: "users", columnName: "username" },
    { tableName: "users", columnName: "estado" }
  ]);
  assert.equal(addedIndexes.some((idx) => idx.name === "users_username_idx"), true);
  assert.equal(addedIndexes.some((idx) => idx.name === "users_estado_idx"), true);
});

test("migracion 20260430 es idempotente cuando RBAC ya existe", async () => {
  const createdTables = [];
  const addedColumns = [];
  const describedTables = new Map([
    ["resources", {
      id: {},
      code: {},
      nombre: {},
      backend_path: {},
      frontend_path: {},
      icono: {},
      orden: {},
      parent_id: {},
      estado: {},
      created_at: {},
      updated_at: {}
    }],
    ["role_resources", {
      role_id: {},
      resource_id: {},
      can_view: {},
      can_create: {},
      can_update: {},
      can_delete: {},
      assigned_at: {}
    }]
  ]);

  const queryInterface = {
    describeTable: async (tableName) => {
      if (!describedTables.has(tableName)) {
        throw new Error(`Tabla ${tableName} no existe`);
      }
      return describedTables.get(tableName);
    },
    createTable: async (tableName) => {
      createdTables.push(tableName);
    },
    addColumn: async (tableName, columnName) => {
      addedColumns.push({ tableName, columnName });
    },
    showIndex: async () => [
      { name: "resources_code_idx" },
      { name: "resources_parent_idx" },
      { name: "resources_estado_idx" },
      { name: "resources_orden_idx" },
      { name: "role_resources_resource_idx" },
      { name: "role_resources_role_idx" }
    ],
    addIndex: async () => {
      throw new Error("No deberia recrear indices existentes");
    }
  };

  const sequelize = { query: async () => {} };

  await rbacResourcesMigration.up({ sequelize, queryInterface, transaction: {} });

  assert.deepEqual(createdTables, []);
  assert.deepEqual(addedColumns, []);
});
