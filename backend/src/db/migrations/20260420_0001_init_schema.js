const { DataTypes } = require("sequelize");

const tableExists = async (queryInterface, tableName) => {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch {
    return false;
  }
};

const columnExists = async (queryInterface, tableName, columnName) => {
  try {
    const table = await queryInterface.describeTable(tableName);
    return !!table[columnName];
  } catch {
    return false;
  }
};

const ensureTable = async (queryInterface, tableName, definition, options, transaction) => {
  if (await tableExists(queryInterface, tableName)) {
    // Si la tabla existe, agregar columnas que falten
    for (const [colName, colDef] of Object.entries(definition)) {
      if (!(await columnExists(queryInterface, tableName, colName))) {
        await queryInterface.addColumn(tableName, colName, colDef, { transaction });
      }
    }
    return;
  }
  await queryInterface.createTable(tableName, definition, { ...options, transaction });
};

const indexExists = async (queryInterface, tableName, indexName) => {
  try {
    const indexes = await queryInterface.showIndex(tableName);
    return indexes.some(index => index.name === indexName);
  } catch {
    return false;
  }
};

const ensureIndex = async (queryInterface, tableName, fields, options, transaction) => {
  const name = options?.name;

  // Verificar que todas las columnas existan
  for (const field of fields) {
    if (!(await columnExists(queryInterface, tableName, field))) {
      return; // Saltar índice si la columna no existe
    }
  }

  // Verificar si el índice ya existe
  if (name && await indexExists(queryInterface, tableName, name)) {
    return; // El índice ya existe, no hacer nada
  }

  await queryInterface.addIndex(tableName, fields, { ...options, transaction });
};

module.exports = {
  up: async ({ queryInterface, transaction }) => {
    await ensureTable(
      queryInterface,
      "houses",
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        name: { type: DataTypes.STRING(120), allowNull: false },
        code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        address: { type: DataTypes.STRING(180), allowNull: true },
        owner_name: { type: DataTypes.STRING(120), allowNull: true },
        contact_phone: { type: DataTypes.STRING(40), allowNull: true },
        status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "ACTIVA" },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    await ensureTable(
      queryInterface,
      "devices",
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        house_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "houses", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
        location: { type: DataTypes.STRING(180), allowNull: true },
        status: { type: DataTypes.STRING(32), allowNull: true },
        ip_address: { type: DataTypes.STRING(45), allowNull: true },
        wifi_ssid: { type: DataTypes.STRING(120), allowNull: true },
        internet_connected: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        last_connection_at: { type: DataTypes.DATE, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    await ensureTable(
      queryInterface,
      "users",
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        house_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "houses", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        role: {
          type: DataTypes.ENUM("admin", "operator", "resident"),
          allowNull: false,
          defaultValue: "resident"
        },
        nombre: { type: DataTypes.STRING(120), allowNull: false },
        email: { type: DataTypes.STRING(160), allowNull: false, unique: true },
        password_hash: { type: DataTypes.STRING(255), allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    await ensureTable(
      queryInterface,
      "readings",
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        device_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "devices", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        ts: { type: DataTypes.DATE, allowNull: false },
        flow_lmin: { type: DataTypes.FLOAT, allowNull: false },
        pressure_kpa: { type: DataTypes.FLOAT, allowNull: false },
        risk: { type: DataTypes.INTEGER, allowNull: false },
        state: { type: DataTypes.STRING(16), allowNull: false }
      },
      {},
      transaction
    );

    await ensureTable(
      queryInterface,
      "alerts",
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        device_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "devices", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        ts: { type: DataTypes.DATE, allowNull: false },
        severity: { type: DataTypes.STRING(16), allowNull: false },
        message: { type: DataTypes.STRING(255), allowNull: false },
        acknowledged: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        ack_at: { type: DataTypes.DATE, allowNull: true }
      },
      {},
      transaction
    );

    await ensureIndex(queryInterface, "houses", ["status"], { name: "houses_status_idx" }, transaction);
    await ensureIndex(queryInterface, "devices", ["house_id"], { name: "devices_house_id_idx" }, transaction);
    await ensureIndex(queryInterface, "devices", ["status"], { name: "devices_status_idx" }, transaction);
    await ensureIndex(
      queryInterface,
      "devices",
      ["internet_connected"],
      { name: "devices_internet_connected_idx" },
      transaction
    );
    await ensureIndex(queryInterface, "users", ["house_id"], { name: "users_house_id_idx" }, transaction);
    await ensureIndex(queryInterface, "users", ["role"], { name: "users_role_idx" }, transaction);
    await ensureIndex(queryInterface, "readings", ["device_id"], { name: "readings_device_id_idx" }, transaction);
    await ensureIndex(queryInterface, "readings", ["ts"], { name: "readings_ts_idx" }, transaction);
    await ensureIndex(queryInterface, "readings", ["state"], { name: "readings_state_idx" }, transaction);
    await ensureIndex(
      queryInterface,
      "readings",
      ["device_id", "ts"],
      { name: "readings_device_id_ts_idx" },
      transaction
    );
    await ensureIndex(queryInterface, "alerts", ["device_id"], { name: "alerts_device_id_idx" }, transaction);
    await ensureIndex(queryInterface, "alerts", ["ts"], { name: "alerts_ts_idx" }, transaction);
    await ensureIndex(
      queryInterface,
      "alerts",
      ["acknowledged"],
      { name: "alerts_acknowledged_idx" },
      transaction
    );
    await ensureIndex(queryInterface, "alerts", ["severity"], { name: "alerts_severity_idx" }, transaction);
    await ensureIndex(
      queryInterface,
      "alerts",
      ["device_id", "ts"],
      { name: "alerts_device_id_ts_idx" },
      transaction
    );
  }
};
