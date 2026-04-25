"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const initSchemaMigration = require("../src/db/migrations/20260420_0001_init_schema");
const deviceCredentialsMigration = require("../src/db/migrations/20260420_add_device_api_credentials");
const deviceMetadataMigration = require("../src/db/migrations/20260420_add_device_metadata");

test("migracion inicial crea las tablas base cuando no existen", async () => {
  const createdTables = [];
  const addedIndexes = [];
  const describedTables = new Set();

  const queryInterface = {
    describeTable: async (tableName) => {
      if (!describedTables.has(tableName)) {
        throw new Error(`Tabla ${tableName} no existe`);
      }
      return {};
    },
    createTable: async (tableName) => {
      createdTables.push(tableName);
      describedTables.add(tableName);
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
