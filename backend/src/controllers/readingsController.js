const { Device, Reading, Alert } = require("../models");

const FUTURE_TOLERANCE_MS = 5_000;

const normalizeTimestamp = (rawTs) => {
  const now = new Date();
  if (!rawTs) return now;

  const parsed = new Date(rawTs);
  if (Number.isNaN(parsed.getTime())) {
    return now;
  }

  if (parsed.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return now;
  }

  return parsed;
};

const ensureDevice = async ({ deviceId, deviceName }) => {
  if (deviceId) {
    const device = await Device.findByPk(deviceId);
    if (!device) {
      const error = new Error("deviceId no encontrado");
      error.status = 404;
      throw error;
    }
    return device;
  }

  const name = String(deviceName || "").trim();
  const [device] = await Device.findOrCreate({
    where: { name },
    defaults: {
      name,
      status: "ACTIVO"
    }
  });

  return device;
};

const createReading = async (req, res, next) => {
  try {
    const { deviceId, deviceName, ts, flow_lmin, pressure_kpa, risk, state } = req.body;
    const device = await ensureDevice({ deviceId, deviceName });
    const previousStatus = device.status || "NORMAL";
    const timestamp = normalizeTimestamp(ts);

    const reading = await Reading.create({
      device_id: device.id,
      ts: timestamp,
      flow_lmin,
      pressure_kpa,
      risk,
      state
    });

    await device.update({ status: state });

    if (state !== "NORMAL" && previousStatus !== state) {
      await Alert.create({
        device_id: device.id,
        ts: timestamp,
        severity: state,
        message: `Estado ${state} | Flujo ${flow_lmin} L/min | Presion ${pressure_kpa} kPa | Riesgo ${risk}%`,
        acknowledged: false
      });
    }

    return res.status(201).json({ ok: true, reading });
  } catch (error) {
    return next(error);
  }
};

const listReadings = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const readings = await Reading.findAll({
      order: [["ts", "DESC"]],
      limit
    });
    return res.json({ ok: true, readings });
  } catch (error) {
    return next(error);
  }
};

const latestReading = async (req, res, next) => {
  try {
    const reading = await Reading.findOne({ order: [["ts", "DESC"]] });
    return res.json({ ok: true, reading });
  } catch (error) {
    return next(error);
  }
};

module.exports = { createReading, listReadings, latestReading, normalizeTimestamp };
