"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEMO_DEVICES,
  DEMO_USER_SPECS,
  assertDemoSeedAllowed,
  getDemoSeedConfig,
  getDemoUsersConfig,
  seedDemoData
} = require("../src/db/seedDemo");

const createRecord = (values) => ({
  ...values,
  update: async function update(nextValues) {
    Object.assign(this, nextValues);
    return this;
  }
});

const createModel = (idStart = 1) => {
  let nextId = idStart;
  const calls = [];
  return {
    calls,
    findOrCreate: async ({ defaults }) => {
      const record = createRecord({ id: nextId, ...defaults });
      nextId += 1;
      calls.push({ method: "findOrCreate", defaults });
      return [record, true];
    },
    destroy: async (query) => {
      calls.push({ method: "destroy", query });
      return 0;
    },
    bulkCreate: async (rows, options) => {
      calls.push({ method: "bulkCreate", rows, options });
      return rows;
    },
    create: async (payload, options) => {
      calls.push({ method: "create", payload, options });
      return createRecord({ id: nextId++, ...payload });
    }
  };
};

test("seed demo queda bloqueado por defecto en production", () => {
  assert.throws(
    () => assertDemoSeedAllowed({ NODE_ENV: "production" }),
    /Seed demo bloqueado en production/
  );
  assert.doesNotThrow(() => assertDemoSeedAllowed({ NODE_ENV: "production", ALLOW_DEMO_SEED: "true" }));
});

test("seed demo usa valores configurables por ambiente", () => {
  const config = getDemoSeedConfig({
    DEMO_HOUSE_CODE: "CASA-X",
    DEMO_RESIDENT_EMAIL: "persona@example.com",
    DEMO_RESIDENT_USERNAME: "persona_x",
    DEMO_RESIDENT_PASSWORD: "secret",
    DEMO_DEVICE_API_KEY: "dev_custom"
  });

  assert.deepEqual(config, {
    houseCode: "CASA-X",
    residentEmail: "persona@example.com",
    residentUsername: "persona_x",
    residentPassword: "secret",
    deviceApiKey: "dev_custom"
  });
});

test("seed demo configura cuentas admin, operador y residente", () => {
  const users = getDemoUsersConfig({
    DEMO_ADMIN_EMAIL: "admin@example.com",
    DEMO_ADMIN_USERNAME: "admin_x",
    DEMO_ADMIN_PASSWORD: "AdminSecret123!",
    DEMO_OPERATOR_EMAIL: "operador@example.com",
    DEMO_OPERATOR_USERNAME: "operador_x",
    DEMO_OPERATOR_PASSWORD: "OperatorSecret123!"
  });

  assert.equal(users.length, DEMO_USER_SPECS.length);
  assert.deepEqual(
    users.map((user) => user.role),
    ["admin", "operator", "resident"]
  );
  assert.equal(users[0].email, "admin@example.com");
  assert.equal(users[0].username, "admin_x");
  assert.equal(users[0].password, "AdminSecret123!");
  assert.equal(users[1].email, "operador@example.com");
  assert.equal(users[1].username, "operador_x");
  assert.equal(users[1].password, "OperatorSecret123!");
  assert.equal(users[2].email, "demo.residente@iot.local");
});

test("seed demo crea usuarios, tres dispositivos, lecturas y una alerta", async () => {
  const models = {
    House: createModel(10),
    User: createModel(20),
    Role: createModel(60),
    UserRole: createModel(70),
    Device: createModel(30),
    Reading: createModel(40),
    Alert: createModel(50)
  };
  const sequelizeInstance = {
    transaction: async (callback) => callback({ id: "tx" })
  };
  const summary = await seedDemoData({
    models,
    sequelizeInstance,
    bcryptLib: { hash: async () => "hashed-password" },
    credentialService: {
      createDeviceApiKeyHint: () => "123456",
      hashDeviceApiKey: () => "hashed-device-key"
    },
    env: {},
    now: new Date("2026-04-24T12:00:00.000Z")
  });

  const bulkCreateCall = models.Reading.calls.find((call) => call.method === "bulkCreate");
  const alertCreateCall = models.Alert.calls.find((call) => call.method === "create");
  const userRoleCalls = models.UserRole.calls.filter((call) => call.method === "findOrCreate");

  assert.equal(summary.users.length, 3);
  assert.equal(summary.devices.length, 3);
  assert.equal(summary.readingCount, DEMO_DEVICES.reduce((sum, device) => sum + device.readings.length, 0));
  assert.equal(bulkCreateCall.rows.length, summary.readingCount);
  assert.equal(alertCreateCall.payload.severity, "ALERTA");
  assert.equal(userRoleCalls.length, 3);
  assert.equal(summary.credentials.users.length, 3);
  assert.equal(summary.credentials.users[0].role, "admin");
  assert.equal(summary.credentials.email, "demo.residente@iot.local");
  assert.equal(summary.credentials.username, "demo_residente");
});
