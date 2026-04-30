"use strict";

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
    for (const [columnName, columnDefinition] of Object.entries(definition)) {
      if (!(await columnExists(queryInterface, tableName, columnName))) {
        await queryInterface.addColumn(tableName, columnName, columnDefinition, { transaction });
      }
    }
    return;
  }

  await queryInterface.createTable(tableName, definition, { ...options, transaction });
};

const indexExists = async (queryInterface, tableName, indexName) => {
  try {
    const indexes = await queryInterface.showIndex(tableName);
    return indexes.some((index) => index.name === indexName);
  } catch {
    return false;
  }
};

const ensureIndex = async (queryInterface, tableName, fields, options, transaction) => {
  if (options?.name && (await indexExists(queryInterface, tableName, options.name))) return;

  try {
    await queryInterface.addIndex(tableName, fields, { ...options, transaction });
  } catch (err) {
    if (!/duplicate|exists/i.test(String(err && err.message))) throw err;
  }
};

const BASE_RESOURCES = [
  {
    code: "dashboard",
    nombre: "Dashboard",
    backendPath: "/api/public/dashboard",
    frontendPath: "/dashboard",
    icono: "fa-solid fa-chart-line",
    orden: 10
  },
  {
    code: "admin",
    nombre: "Administracion",
    backendPath: null,
    frontendPath: "/admin",
    icono: "fa-solid fa-screwdriver-wrench",
    orden: 20
  },
  {
    code: "houses",
    nombre: "Casas",
    backendPath: "/api/houses",
    frontendPath: "/admin/houses",
    icono: "fa-solid fa-house",
    orden: 30,
    parentCode: "admin"
  },
  {
    code: "users",
    nombre: "Usuarios",
    backendPath: "/api/users",
    frontendPath: "/admin/users",
    icono: "fa-solid fa-users",
    orden: 40,
    parentCode: "admin"
  },
  {
    code: "roles",
    nombre: "Roles",
    backendPath: "/api/roles",
    frontendPath: "/admin/roles",
    icono: "fa-solid fa-user-shield",
    orden: 50,
    parentCode: "admin"
  },
  {
    code: "resources",
    nombre: "Recursos",
    backendPath: "/api/resources",
    frontendPath: "/admin/resources",
    icono: "fa-solid fa-sitemap",
    orden: 60,
    parentCode: "admin"
  },
  {
    code: "devices",
    nombre: "Dispositivos",
    backendPath: "/api/devices",
    frontendPath: "/admin/devices",
    icono: "fa-solid fa-microchip",
    orden: 70,
    parentCode: "admin"
  },
  {
    code: "locations",
    nombre: "Ubicaciones",
    backendPath: "/api/locations",
    frontendPath: "/admin/locations",
    icono: "fa-solid fa-location-dot",
    orden: 80,
    parentCode: "admin"
  },
  {
    code: "sensors",
    nombre: "Sensores",
    backendPath: "/api/sensors",
    frontendPath: "/admin/sensors",
    icono: "fa-solid fa-gauge-high",
    orden: 90,
    parentCode: "admin"
  },
  {
    code: "readings",
    nombre: "Lecturas",
    backendPath: "/api/readings",
    frontendPath: "/dashboard/readings",
    icono: "fa-solid fa-wave-square",
    orden: 100
  },
  {
    code: "alerts",
    nombre: "Alertas",
    backendPath: "/api/alerts",
    frontendPath: "/dashboard/alerts",
    icono: "fa-solid fa-triangle-exclamation",
    orden: 110
  },
  {
    code: "incidents",
    nombre: "Incidentes",
    backendPath: "/api/incidents",
    frontendPath: "/dashboard/incidents",
    icono: "fa-solid fa-droplet",
    orden: 120
  },
  {
    code: "valves",
    nombre: "Valvulas",
    backendPath: "/api/valves",
    frontendPath: "/dashboard/valves",
    icono: "fa-solid fa-toggle-on",
    orden: 130
  },
  {
    code: "detection_config",
    nombre: "Configuracion de deteccion",
    backendPath: "/api/detection-config",
    frontendPath: "/admin/detection-config",
    icono: "fa-solid fa-sliders",
    orden: 140,
    parentCode: "admin"
  },
  {
    code: "commands",
    nombre: "Comandos remotos",
    backendPath: "/api/commands",
    frontendPath: "/admin/commands",
    icono: "fa-solid fa-terminal",
    orden: 150,
    parentCode: "admin"
  },
  {
    code: "system_states",
    nombre: "Estados del sistema",
    backendPath: "/api/system-states",
    frontendPath: "/dashboard/system-states",
    icono: "fa-solid fa-heart-pulse",
    orden: 160
  },
  {
    code: "audit",
    nombre: "Auditoria",
    backendPath: "/api/audit",
    frontendPath: "/admin/audit",
    icono: "fa-solid fa-clipboard-list",
    orden: 170,
    parentCode: "admin"
  }
];

const resourcePermission = ({ view = true, create = false, update = false, remove = false } = {}) => ({
  view,
  create,
  update,
  remove
});

const ROLE_RESOURCE_PERMISSIONS = {
  admin: BASE_RESOURCES.map((resource) => ({
    code: resource.code,
    ...resourcePermission({ create: true, update: true, remove: true })
  })),
  operator: [
    { code: "dashboard", ...resourcePermission() },
    { code: "houses", ...resourcePermission() },
    { code: "devices", ...resourcePermission({ create: true, update: true }) },
    { code: "locations", ...resourcePermission({ create: true, update: true }) },
    { code: "sensors", ...resourcePermission({ create: true, update: true }) },
    { code: "readings", ...resourcePermission() },
    { code: "alerts", ...resourcePermission({ update: true }) },
    { code: "incidents", ...resourcePermission({ update: true }) },
    { code: "valves", ...resourcePermission({ create: true, update: true }) },
    { code: "detection_config", ...resourcePermission({ update: true }) },
    { code: "commands", ...resourcePermission({ create: true, update: true }) },
    { code: "system_states", ...resourcePermission({ create: true }) }
  ],
  resident: [
    { code: "dashboard", ...resourcePermission() },
    { code: "readings", ...resourcePermission() },
    { code: "alerts", ...resourcePermission({ update: true }) },
    { code: "incidents", ...resourcePermission() },
    { code: "valves", ...resourcePermission() },
    { code: "system_states", ...resourcePermission() }
  ],
  tecnico: [
    { code: "dashboard", ...resourcePermission() },
    { code: "devices", ...resourcePermission() },
    { code: "locations", ...resourcePermission() },
    { code: "sensors", ...resourcePermission({ update: true }) },
    { code: "alerts", ...resourcePermission({ update: true }) },
    { code: "incidents", ...resourcePermission({ update: true }) },
    { code: "valves", ...resourcePermission({ create: true, update: true }) },
    { code: "commands", ...resourcePermission() },
    { code: "system_states", ...resourcePermission({ create: true }) }
  ]
};

const seedResources = async (sequelize, transaction) => {
  if (!sequelize || typeof sequelize.query !== "function") return;

  for (const resource of BASE_RESOURCES) {
    await sequelize.query(
      `INSERT INTO resources
        (code, nombre, backend_path, frontend_path, icono, orden, parent_id, estado, created_at, updated_at)
       VALUES
        (?, ?, ?, ?, ?, ?, (SELECT id FROM (SELECT id FROM resources WHERE code = ?) AS parent_lookup), 'ACTIVO', NOW(), NOW())
       ON DUPLICATE KEY UPDATE
        nombre = VALUES(nombre),
        backend_path = VALUES(backend_path),
        frontend_path = VALUES(frontend_path),
        icono = VALUES(icono),
        orden = VALUES(orden),
        parent_id = VALUES(parent_id),
        estado = VALUES(estado),
        updated_at = NOW()`,
      {
        replacements: [
          resource.code,
          resource.nombre,
          resource.backendPath,
          resource.frontendPath,
          resource.icono,
          resource.orden,
          resource.parentCode || null
        ],
        transaction
      }
    );
  }
};

const seedRoleResources = async (sequelize, transaction) => {
  if (!sequelize || typeof sequelize.query !== "function") return;

  for (const [roleCode, permissions] of Object.entries(ROLE_RESOURCE_PERMISSIONS)) {
    for (const permission of permissions) {
      await sequelize.query(
        `INSERT INTO role_resources
          (role_id, resource_id, can_view, can_create, can_update, can_delete, assigned_at)
         SELECT roles.id, resources.id, ?, ?, ?, ?, NOW()
         FROM roles
         INNER JOIN resources ON resources.code = ?
         WHERE roles.code = ?
         ON DUPLICATE KEY UPDATE
          can_view = VALUES(can_view),
          can_create = VALUES(can_create),
          can_update = VALUES(can_update),
          can_delete = VALUES(can_delete)`,
        {
          replacements: [
            permission.view,
            permission.create,
            permission.update,
            permission.remove,
            permission.code,
            roleCode
          ],
          transaction
        }
      );
    }
  }
};

module.exports = {
  up: async ({ sequelize, queryInterface, transaction }) => {
    await ensureTable(
      queryInterface,
      "resources",
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
        nombre: { type: DataTypes.STRING(120), allowNull: false },
        backend_path: { type: DataTypes.STRING(160), allowNull: true },
        frontend_path: { type: DataTypes.STRING(160), allowNull: true },
        icono: { type: DataTypes.STRING(80), allowNull: true },
        orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        parent_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "resources", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        estado: {
          type: DataTypes.ENUM("ACTIVO", "INACTIVO"),
          allowNull: false,
          defaultValue: "ACTIVO"
        },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    await ensureTable(
      queryInterface,
      "role_resources",
      {
        role_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: "roles", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        resource_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: "resources", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        can_view: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        can_create: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        can_update: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        can_delete: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        assigned_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      },
      {},
      transaction
    );

    await ensureIndex(queryInterface, "resources", ["code"], { name: "resources_code_idx", unique: true }, transaction);
    await ensureIndex(queryInterface, "resources", ["parent_id"], { name: "resources_parent_idx" }, transaction);
    await ensureIndex(queryInterface, "resources", ["estado"], { name: "resources_estado_idx" }, transaction);
    await ensureIndex(queryInterface, "resources", ["orden"], { name: "resources_orden_idx" }, transaction);
    await ensureIndex(
      queryInterface,
      "role_resources",
      ["resource_id"],
      { name: "role_resources_resource_idx" },
      transaction
    );
    await ensureIndex(
      queryInterface,
      "role_resources",
      ["role_id"],
      { name: "role_resources_role_idx" },
      transaction
    );

    await seedResources(sequelize, transaction);
    await seedRoleResources(sequelize, transaction);
  }
};
