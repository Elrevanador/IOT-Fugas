"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const { withFreshApp } = require("./helpers/loadApp");
const { createDeviceApiKey, hashDeviceApiKey } = require("../src/services/deviceCredentials");

const TEST_JWT_SECRET = "test-secret";
const TEST_DEVICE_KEY = "device-secret";

const createJsonRequest = ({ port, method, path, body, headers = {} }) =>
  new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers
        }
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let parsedBody = raw;
          const contentType = res.headers["content-type"] || "";
          if (contentType.includes("application/json") && raw) {
            parsedBody = JSON.parse(raw);
          }
          resolve({ statusCode: res.statusCode, headers: res.headers, body: parsedBody });
        });
      }
    );

    req.on("error", reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });

const createTestServer = (app) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        port: address.port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          })
      });
    });

    server.on("error", reject);
  });

test("registro publico rechaza asociacion de casa enviada por el cliente", async () => {
  await withFreshApp(
    {
      "src/models/index.js": {
        User: {
          findOne: async () => null,
          create: async (payload) => {
            return { id: 17, ...payload };
          }
        },
        House: {
          findByPk: async () => {
            throw new Error("register no deberia consultar casas");
          }
        }
      },
      "src/config/env.js": {
        getJwtSecret: () => TEST_JWT_SECRET,
        getTrustProxySetting: () => false
      },
      "src/middlewares/authorize.js": {
        normalizeRole: (value) => String(value || "").trim().toLowerCase()
      },
      "src/services/publicDashboard.js": {
        buildPublicDashboardPayload: async () => ({ ok: true, latestReading: null, recentReadings: [], recentAlerts: [] })
      },
      "src/services/dashboardStream.js": {
        attachDashboardStream: (req, res, payload) => res.status(200).json(payload)
      }
    },
    async (app) => {
      const server = await createTestServer(app);
      try {
        const response = await createJsonRequest({
          port: server.port,
          method: "POST",
          path: "/api/auth/register",
          body: {
            nombre: "Duvan",
            apellido: "Ramirez",
            username: "duvan_test",
            email: "duvan@example.com",
            password: "Abcd1234!",
            confirmPassword: "Abcd1234!",
            houseId: 99
          }
        });

        assert.equal(response.statusCode, 400);
        assert.equal(response.body.msg, "No puedes asignar una casa durante el registro público");
      } finally {
        await server.close();
      }
    }
  );
});

test("lecturas sin x-device-key son rechazadas", async () => {
  await withFreshApp(
    {
      "src/config/env.js": {
        getIngestApiKey: () => TEST_DEVICE_KEY,
        getJwtSecret: () => TEST_JWT_SECRET,
        getTrustProxySetting: () => false
      }
    },
    async (app) => {
      const server = await createTestServer(app);
      try {
        const response = await createJsonRequest({
          port: server.port,
          method: "POST",
          path: "/api/readings",
          body: {
            deviceName: "ESP32-01",
            flow_lmin: 1,
            pressure_kpa: 100,
            risk: 10,
            state: "NORMAL"
          }
        });

        assert.equal(response.statusCode, 401);
        assert.equal(response.body.msg, "x-device-key requerido");
      } finally {
        await server.close();
      }
    }
  );
});

test("lecturas aceptan credencial propia del dispositivo", async () => {
  const apiKey = createDeviceApiKey();
  const deviceRecord = {
    id: 4,
    name: "ESP32-PRIV-01",
    house_id: 2,
    device_type: "ESP32",
    firmware_version: "1.0.0",
    hardware_uid: "HW-001",
    status: "NORMAL",
    api_key_hash: hashDeviceApiKey(apiKey),
    update: async () => undefined
  };

  await withFreshApp(
    {
      "src/config/env.js": {
        getIngestApiKey: () => TEST_DEVICE_KEY,
        getJwtSecret: () => TEST_JWT_SECRET,
        getTrustProxySetting: () => false
      },
      "src/models/index.js": {
        sequelize: {
          transaction: async (fn) => {
            const fakeTransaction = { commit: async () => {}, rollback: async () => {} };
            return fn(fakeTransaction);
          }
        },
        Device: {
          findByPk: async () => deviceRecord,
          findOne: async () => null
        },
        Reading: {
          create: async (payload) => ({ id: 77, ...payload })
        },
        Alert: {
          findOne: async () => null,
          create: async () => ({ id: 33 })
        },
        House: {
          findByPk: async () => null
        }
      },
      "src/services/dashboardStream.js": {
        broadcastDashboardUpdate: async () => undefined
      }
    },
    async (app) => {
      const server = await createTestServer(app);
      try {
        const response = await createJsonRequest({
          port: server.port,
          method: "POST",
          path: "/api/readings",
          headers: { "x-device-key": apiKey },
          body: {
            deviceId: 4,
            deviceName: "ESP32-PRIV-01",
            firmwareVersion: "1.0.1",
            deviceType: "ESP32",
            hardwareUid: "HW-001",
            flow_lmin: 1.2,
            pressure_kpa: 88.5,
            risk: 21,
            state: "NORMAL"
          }
        });

        assert.equal(response.statusCode, 201);
        assert.equal(response.body.reading.device_id, 4);
      } finally {
        await server.close();
      }
    }
  );
});

test("credencial propia no puede reportar como otro dispositivo", async () => {
  const apiKey = createDeviceApiKey();
  const deviceRecord = {
    id: 4,
    name: "ESP32-PRIV-01",
    house_id: 2,
    hardware_uid: "HW-001",
    api_key_hash: hashDeviceApiKey(apiKey)
  };

  await withFreshApp(
    {
      "src/config/env.js": {
        getIngestApiKey: () => TEST_DEVICE_KEY,
        getJwtSecret: () => TEST_JWT_SECRET,
        getTrustProxySetting: () => false
      },
      "src/models/index.js": {
        Device: {
          findByPk: async () => null,
          findOne: async () => deviceRecord
        },
        Reading: {},
        Alert: {},
        House: {}
      }
    },
    async (app) => {
      const server = await createTestServer(app);
      try {
        const response = await createJsonRequest({
          port: server.port,
          method: "POST",
          path: "/api/readings",
          headers: { "x-device-key": apiKey },
          body: {
            deviceName: "ESP32-OTRO",
            hardwareUid: "HW-999",
            flow_lmin: 1.2,
            pressure_kpa: 88.5,
            risk: 21,
            state: "NORMAL"
          }
        });

        assert.equal(response.statusCode, 403);
        assert.equal(response.body.msg, "La credencial del dispositivo no coincide con deviceName");
      } finally {
        await server.close();
      }
    }
  );
});

test("token por query string no funciona fuera del stream", async () => {
  const token = jwt.sign({ id: 1, role: "admin" }, TEST_JWT_SECRET, { expiresIn: "1h" });

  await withFreshApp(
    {
      "src/config/env.js": {
        getJwtSecret: () => TEST_JWT_SECRET,
        getTrustProxySetting: () => false
      },
      "src/services/publicDashboard.js": {
        buildPublicDashboardPayload: async () => ({ ok: true, latestReading: null, recentReadings: [], recentAlerts: [] })
      },
      "src/services/dashboardStream.js": {
        attachDashboardStream: (req, res, payload) => res.status(200).json(payload)
      }
    },
    async (app) => {
      const server = await createTestServer(app);
      try {
        const response = await createJsonRequest({
          port: server.port,
          method: "GET",
          path: `/api/public/dashboard?token=${encodeURIComponent(token)}`
        });

        assert.equal(response.statusCode, 401);
        assert.equal(response.body.msg, "Token requerido");
      } finally {
        await server.close();
      }
    }
  );
});

test("stream de dashboard si acepta token por query string", async () => {
  const token = jwt.sign({ id: 7, role: "operator", houseId: 5 }, TEST_JWT_SECRET, { expiresIn: "1h" });

  await withFreshApp(
    {
      "src/config/env.js": {
        getJwtSecret: () => TEST_JWT_SECRET,
        getTrustProxySetting: () => false
      },
      "src/services/publicDashboard.js": {
        buildPublicDashboardPayload: async (user) => ({
          ok: true,
          latestReading: null,
          recentReadings: [],
          recentAlerts: [],
          currentUser: user
        })
      },
      "src/services/dashboardStream.js": {
        attachDashboardStream: (req, res, payload, user) => {
          res.setHeader("Content-Type", "application/json");
          res.status(200).end(JSON.stringify({ ok: true, payload, user }));
        }
      }
    },
    async (app) => {
      const server = await createTestServer(app);
      try {
        const response = await createJsonRequest({
          port: server.port,
          method: "GET",
          path: `/api/public/dashboard/stream?token=${encodeURIComponent(token)}`
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.user.id, 7);
        assert.equal(response.body.user.houseId, 5);
      } finally {
        await server.close();
      }
    }
  );
});

test("login aplica rate limit por IP", async () => {
  const previousWindow = process.env.AUTH_RATE_LIMIT_WINDOW_MS;
  const previousMax = process.env.AUTH_LOGIN_RATE_LIMIT_MAX;
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "2";

  try {
    await withFreshApp(
      {
        "src/models/index.js": {
          User: {
            findOne: async () => null
          },
          House: {}
        },
        "src/config/env.js": {
          getJwtSecret: () => TEST_JWT_SECRET,
          getTrustProxySetting: () => false
        }
      },
      async (app) => {
        const server = await createTestServer(app);
        try {
          const body = { email: "nobody@example.com", password: "secret123" };

          const first = await createJsonRequest({
            port: server.port,
            method: "POST",
            path: "/api/auth/login",
            body
          });
          const second = await createJsonRequest({
            port: server.port,
            method: "POST",
            path: "/api/auth/login",
            body
          });
          const third = await createJsonRequest({
            port: server.port,
            method: "POST",
            path: "/api/auth/login",
            body
          });

          assert.equal(first.statusCode, 401);
          assert.equal(second.statusCode, 401);
          assert.equal(third.statusCode, 429);
          assert.equal(third.body.msg, "Demasiados intentos de login, intenta de nuevo más tarde");
          assert.equal(
            third.headers["ratelimit-limit"] ?? third.headers["x-ratelimit-limit"],
            "2"
          );
        } finally {
          await server.close();
        }
      }
    );
  } finally {
    if (previousWindow === undefined) {
      delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.AUTH_RATE_LIMIT_WINDOW_MS = previousWindow;
    }

    if (previousMax === undefined) {
      delete process.env.AUTH_LOGIN_RATE_LIMIT_MAX;
    } else {
      process.env.AUTH_LOGIN_RATE_LIMIT_MAX = previousMax;
    }
  }
});
