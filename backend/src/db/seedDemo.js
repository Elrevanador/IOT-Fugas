"use strict";

require("dotenv").config();

const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");

const sequelize = require("./sequelize");
const { Alert, Device, House, Reading, Role, User, UserRole } = require("../models");
const { createDeviceApiKeyHint, hashDeviceApiKey } = require("../services/deviceCredentials");

const ROLE_NAMES = {
  admin: "Administrador",
  operator: "Operador",
  resident: "Residente"
};

const DEMO_USER_SPECS = [
  {
    key: "admin",
    role: "admin",
    nombre: "Admin",
    apellido: "Demo",
    defaultEmail: "demo.admin@iot.local",
    defaultUsername: "demo_admin",
    defaultPassword: "AdminDemo123!",
    scopedToHouse: false
  },
  {
    key: "operator",
    role: "operator",
    nombre: "Operador",
    apellido: "Demo",
    defaultEmail: "demo.operador@iot.local",
    defaultUsername: "demo_operador",
    defaultPassword: "OperadorDemo123!",
    scopedToHouse: true
  },
  {
    key: "resident",
    role: "resident",
    nombre: "Residente",
    apellido: "Demo",
    defaultEmail: "demo.residente@iot.local",
    defaultUsername: "demo_residente",
    defaultPassword: "Demo12345!",
    scopedToHouse: true
  }
];

const DEMO_DEVICES = [
  {
    name: "DEMO - Nodo entrada",
    location: "Entrada principal",
    deviceType: "flow-sensor",
    hardwareUid: "DEMO-HW-ENTRADA",
    readings: [
      { minutesAgo: 14, flow_lmin: 1.8, pressure_kpa: 86, risk: 8, state: "NORMAL" },
      { minutesAgo: 10, flow_lmin: 2.1, pressure_kpa: 88, risk: 10, state: "NORMAL" },
      { minutesAgo: 6, flow_lmin: 2.0, pressure_kpa: 87, risk: 9, state: "NORMAL" },
      { minutesAgo: 2, flow_lmin: 2.2, pressure_kpa: 89, risk: 12, state: "NORMAL" }
    ]
  },
  {
    name: "DEMO - Nodo cocina",
    location: "Cocina",
    deviceType: "flow-sensor",
    hardwareUid: "DEMO-HW-COCINA",
    readings: [
      { minutesAgo: 16, flow_lmin: 2.4, pressure_kpa: 94, risk: 18, state: "NORMAL" },
      { minutesAgo: 11, flow_lmin: 4.2, pressure_kpa: 120, risk: 56, state: "ALERTA" },
      { minutesAgo: 7, flow_lmin: 4.8, pressure_kpa: 132, risk: 72, state: "ALERTA" },
      { minutesAgo: 1, flow_lmin: 5.1, pressure_kpa: 136, risk: 78, state: "ALERTA" }
    ]
  },
  {
    name: "DEMO - Nodo patio",
    location: "Patio",
    deviceType: "flow-sensor",
    hardwareUid: "DEMO-HW-PATIO",
    readings: [
      { minutesAgo: 48, flow_lmin: 1.3, pressure_kpa: 80, risk: 7, state: "NORMAL" },
      { minutesAgo: 42, flow_lmin: 1.2, pressure_kpa: 78, risk: 6, state: "NORMAL" },
      { minutesAgo: 36, flow_lmin: 1.1, pressure_kpa: 76, risk: 5, state: "NORMAL" }
    ]
  }
];

const truthy = (value) => ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());

const assertDemoSeedAllowed = (env = process.env) => {
  if (env.NODE_ENV === "production" && !truthy(env.ALLOW_DEMO_SEED)) {
    throw new Error("Seed demo bloqueado en production. Usa ALLOW_DEMO_SEED=true si realmente lo necesitas.");
  }
};

const getDemoSeedConfig = (env = process.env) => ({
  houseCode: env.DEMO_HOUSE_CODE || "DEMO-CASA-MULTI",
  residentEmail: env.DEMO_RESIDENT_EMAIL || "demo.residente@iot.local",
  residentUsername: env.DEMO_RESIDENT_USERNAME || "demo_residente",
  residentPassword: env.DEMO_RESIDENT_PASSWORD || "Demo12345!",
  deviceApiKey: env.DEMO_DEVICE_API_KEY || "dev_demo_iot_water_multi_123456"
});

const getDemoUsersConfig = (env = process.env) =>
  DEMO_USER_SPECS.map((spec) => {
    const prefix = `DEMO_${spec.key.toUpperCase()}`;
    return {
      ...spec,
      email: env[`${prefix}_EMAIL`] || spec.defaultEmail,
      username: env[`${prefix}_USERNAME`] || spec.defaultUsername,
      password: env[`${prefix}_PASSWORD`] || spec.defaultPassword
    };
  });

const timestampMinutesAgo = (now, minutesAgo) => new Date(now.getTime() - minutesAgo * 60_000);

const latestReadingSpec = (deviceSpec) =>
  [...deviceSpec.readings].sort((a, b) => a.minutesAgo - b.minutesAgo)[0];

const upsertRecord = async (model, where, values, transaction) => {
  const [record] = await model.findOrCreate({
    where,
    defaults: values,
    transaction
  });

  await record.update(values, { transaction });
  return record;
};

const ensureRole = async (models, roleCode, transaction) => {
  if (!models.Role || typeof models.Role.findOrCreate !== "function") return null;

  return upsertRecord(
    models.Role,
    { code: roleCode },
    {
      code: roleCode,
      nombre: ROLE_NAMES[roleCode] || roleCode,
      descripcion: `Rol demo ${ROLE_NAMES[roleCode] || roleCode}`
    },
    transaction
  );
};

const ensureUserRole = async (models, user, role, transaction) => {
  if (!models.UserRole || typeof models.UserRole.findOrCreate !== "function" || !user?.id || !role?.id) {
    return null;
  }

  return upsertRecord(
    models.UserRole,
    { user_id: user.id, role_id: role.id },
    {
      user_id: user.id,
      role_id: role.id,
      assigned_at: new Date()
    },
    transaction
  );
};

const seedDemoData = async ({
  models = { Alert, Device, House, Reading, Role, User, UserRole },
  sequelizeInstance = sequelize,
  bcryptLib = bcrypt,
  credentialService = { createDeviceApiKeyHint, hashDeviceApiKey },
  env = process.env,
  now = new Date()
} = {}) => {
  assertDemoSeedAllowed(env);
  const config = getDemoSeedConfig(env);
  const demoUsers = getDemoUsersConfig(env);

  return sequelizeInstance.transaction(async (transaction) => {
    const house = await upsertRecord(
      models.House,
      { code: config.houseCode },
      {
        name: "Casa Demo Multi Dispositivo",
        code: config.houseCode,
        address: "Circuito demo local",
        owner_name: "Residente Demo",
        contact_phone: "+57 300 000 0000",
        status: "ACTIVA"
      },
      transaction
    );

    const createdUsers = [];
    for (const userSpec of demoUsers) {
      const password_hash = await bcryptLib.hash(userSpec.password, 10);
      const user = await upsertRecord(
        models.User,
        { email: userSpec.email },
        {
          nombre: userSpec.nombre,
          apellido: userSpec.apellido,
          username: userSpec.username,
          email: userSpec.email,
          password_hash,
          role: userSpec.role,
          house_id: userSpec.scopedToHouse ? house.id : null,
          estado: "ACTIVO",
          email_verified: true,
          failed_login_attempts: 0,
          locked_until: null,
          password_changed_at: new Date()
        },
        transaction
      );

      const role = await ensureRole(models, userSpec.role, transaction);
      await ensureUserRole(models, user, role, transaction);
      createdUsers.push({ record: user, spec: userSpec });
    }

    const deviceApiKeyHash = credentialService.hashDeviceApiKey(config.deviceApiKey);
    const apiKeyHint = credentialService.createDeviceApiKeyHint(config.deviceApiKey);
    const devices = [];

    for (const deviceSpec of DEMO_DEVICES) {
      const latest = latestReadingSpec(deviceSpec);
      const lastSeenAt = timestampMinutesAgo(now, latest.minutesAgo);
      const device = await upsertRecord(
        models.Device,
        { hardware_uid: deviceSpec.hardwareUid },
        {
          house_id: house.id,
          name: deviceSpec.name,
          location: deviceSpec.location,
          device_type: deviceSpec.deviceType,
          firmware_version: "demo-1.0.0",
          hardware_uid: deviceSpec.hardwareUid,
          last_seen_at: lastSeenAt,
          status: latest.state,
          api_key_hash: deviceApiKeyHash,
          api_key_hint: apiKeyHint
        },
        transaction
      );

      devices.push({ record: device, spec: deviceSpec });
    }

    const deviceIds = devices.map(({ record }) => record.id);
    const deviceWhere = { device_id: { [Op.in]: deviceIds } };
    await models.Alert.destroy({ where: deviceWhere, transaction });
    await models.Reading.destroy({ where: deviceWhere, transaction });

    const readingRows = devices.flatMap(({ record, spec }) =>
      spec.readings.map((reading) => ({
        device_id: record.id,
        ts: timestampMinutesAgo(now, reading.minutesAgo),
        flow_lmin: reading.flow_lmin,
        pressure_kpa: reading.pressure_kpa,
        risk: reading.risk,
        state: reading.state
      }))
    );

    await models.Reading.bulkCreate(readingRows, { transaction });

    const kitchenDevice = devices.find(({ spec }) => spec.hardwareUid === "DEMO-HW-COCINA");
    const kitchenLatest = kitchenDevice ? latestReadingSpec(kitchenDevice.spec) : null;
    if (kitchenDevice && kitchenLatest?.state === "ALERTA") {
      await models.Alert.create(
        {
          device_id: kitchenDevice.record.id,
          ts: timestampMinutesAgo(now, kitchenLatest.minutesAgo),
          severity: "ALERTA",
          message: `Demo alerta | Flujo ${kitchenLatest.flow_lmin} L/min | Presion ${kitchenLatest.pressure_kpa} kPa | Riesgo ${kitchenLatest.risk}%`,
          acknowledged: false
        },
        { transaction }
      );
    }

    const residentUser = createdUsers.find(({ spec }) => spec.role === "resident") || createdUsers[0];

    return {
      house: { id: house.id, code: house.code, name: house.name },
      user: residentUser ? { id: residentUser.record.id, email: residentUser.record.email } : null,
      users: createdUsers.map(({ record, spec }) => ({
        id: record.id,
        role: spec.role,
        email: record.email,
        username: record.username
      })),
      devices: devices.map(({ record }) => ({ id: record.id, name: record.name })),
      readingCount: readingRows.length,
      credentials: {
        email: residentUser?.spec.email || config.residentEmail,
        username: residentUser?.spec.username || config.residentUsername,
        password: residentUser?.spec.password || config.residentPassword,
        deviceApiKey: config.deviceApiKey,
        users: createdUsers.map(({ spec }) => ({
          role: spec.role,
          email: spec.email,
          username: spec.username,
          password: spec.password
        }))
      }
    };
  });
};

const main = async () => {
  try {
    await sequelize.authenticate();
    const summary = await seedDemoData();
    console.log("Demo multi-dispositivo listo.");
    console.log(`Casa: ${summary.house.name} (${summary.house.code})`);
    console.log(`Usuarios demo: ${summary.credentials.users.map((user) => `${user.role}:${user.email}`).join(", ")}`);
    console.log(`Dispositivos: ${summary.devices.length} creados`);
    console.log(`Lecturas creadas: ${summary.readingCount}`);

    // Guardar credenciales en archivo seguro solo en desarrollo
    if (process.env.NODE_ENV !== "production") {
      const fs = require("fs");
      fs.writeFileSync(".demo-credentials.json", JSON.stringify(summary.credentials, null, 2), { mode: 0o600 });
      console.log("Credenciales guardadas en .demo-credentials.json (ignorado por Git)");
    }
  } catch (error) {
    console.error("No se pudo crear el demo multi-dispositivo:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

if (require.main === module) {
  main();
}

module.exports = {
  DEMO_DEVICES,
  DEMO_USER_SPECS,
  assertDemoSeedAllowed,
  getDemoSeedConfig,
  getDemoUsersConfig,
  seedDemoData
};
