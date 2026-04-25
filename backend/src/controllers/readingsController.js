const { Op } = require("sequelize");
const { sequelize, Device, Reading, Alert, House, Sensor } = require("../models");
const { broadcastDashboardUpdate } = require("../services/dashboardStream");
const { getUserHouseScope } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { runLeakDetection } = require("../services/leakDetection");

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

const ensureDevice = async ({
  deviceId,
  deviceName,
  houseId,
  deviceType,
  firmwareVersion,
  hardwareUid,
  authenticatedDevice,
  transaction
}) => {
  let house = null;
  if (houseId) {
    house = await House.findByPk(houseId, { transaction });
    if (!house) {
      const error = new Error("houseId no encontrado");
      error.status = 404;
      throw error;
    }
  }

  if (deviceId) {
    const device = await Device.findByPk(deviceId, { transaction });
    if (!device) {
      const error = new Error("deviceId no encontrado");
      error.status = 404;
      throw error;
    }

    if (house && device.house_id && device.house_id !== house.id) {
      const error = new Error("El dispositivo no pertenece a la casa indicada");
      error.status = 409;
      throw error;
    }

    if (house && !device.house_id) {
      await device.update({ house_id: house.id }, { transaction });
    }

    const metadataPatch = {};
    if (deviceType && device.device_type !== deviceType) metadataPatch.device_type = deviceType;
    if (firmwareVersion && device.firmware_version !== firmwareVersion) metadataPatch.firmware_version = firmwareVersion;
    if (hardwareUid && !device.hardware_uid) metadataPatch.hardware_uid = hardwareUid;
    if (Object.keys(metadataPatch).length) {
      await device.update(metadataPatch, { transaction });
    }

    return device;
  }

  const name = String(deviceName || "").trim();
  if (authenticatedDevice) {
    return Device.findByPk(authenticatedDevice.id, { transaction });
  }
  const [device] = await Device.findOrCreate({
    where: { name },
    defaults: {
      house_id: house?.id || null,
      name,
      status: "ACTIVO",
      device_type: deviceType || null,
      firmware_version: firmwareVersion || null,
      hardware_uid: hardwareUid || null
    },
    transaction
  });

  const metadataPatch = {};
  if (house && !device.house_id) metadataPatch.house_id = house.id;
  if (deviceType && !device.device_type) metadataPatch.device_type = deviceType;
  if (firmwareVersion && device.firmware_version !== firmwareVersion) metadataPatch.firmware_version = firmwareVersion;
  if (hardwareUid && !device.hardware_uid) metadataPatch.hardware_uid = hardwareUid;
  if (Object.keys(metadataPatch).length) {
    await device.update(metadataPatch, { transaction });
  }

  return device;
};

const createReading = async (req, res, next) => {
  try {
    const { houseId, deviceId, deviceName, deviceType, firmwareVersion, hardwareUid, sensorId, ts, flow_lmin, pressure_kpa, risk, state } =
      req.body;
    const normalizedDeviceType = deviceType ? String(deviceType).trim() : null;
    const normalizedFirmwareVersion = firmwareVersion ? String(firmwareVersion).trim() : null;
    const normalizedHardwareUid = hardwareUid ? String(hardwareUid).trim() : null;
    const timestamp = normalizeTimestamp(ts);

    const reading = await sequelize.transaction(async (transaction) => {
      const device = await ensureDevice({
        houseId,
        deviceId,
        deviceName,
        deviceType: normalizedDeviceType,
        firmwareVersion: normalizedFirmwareVersion,
        hardwareUid: normalizedHardwareUid,
        authenticatedDevice: req.authenticatedDevice || null,
        transaction
      });
      const previousStatus = device.status || "NORMAL";

      if (sensorId !== undefined && sensorId !== null && sensorId !== "") {
        const sensor = await Sensor.findByPk(Number(sensorId), { transaction });
        if (!sensor) {
          const error = new Error("sensorId no encontrado");
          error.status = 404;
          throw error;
        }
        if (Number(sensor.device_id) !== Number(device.id)) {
          const error = new Error("El sensor no pertenece al dispositivo indicado");
          error.status = 409;
          throw error;
        }
      }

      const createdReading = await Reading.create(
        {
          device_id: device.id,
          ts: timestamp,
          flow_lmin,
          pressure_kpa,
          risk,
          state,
          sensor_id: sensorId ? Number(sensorId) : null
        },
        { transaction }
      );

      await device.update(
        {
          status: state,
          last_seen_at: timestamp,
          device_type: normalizedDeviceType || device.device_type || null,
          firmware_version: normalizedFirmwareVersion || device.firmware_version || null,
          hardware_uid: normalizedHardwareUid || device.hardware_uid || null
        },
        { transaction }
      );

      if (state !== "NORMAL" && previousStatus !== state) {
        const recentOpenAlert = await Alert.findOne({
          where: {
            device_id: device.id,
            severity: state,
            acknowledged: false
          },
          order: [["ts", "DESC"]],
          transaction
        });

        if (!recentOpenAlert) {
          await Alert.create(
            {
              device_id: device.id,
              ts: timestamp,
              severity: state,
              tipo: state,
              message: `Estado ${state} | Flujo ${flow_lmin} L/min | Presion ${pressure_kpa} kPa | Riesgo ${risk}%`,
              acknowledged: false
            },
            { transaction }
          );
        }
      }

      await runLeakDetection({ device, reading: createdReading, transaction });

      return createdReading;
    });

    broadcastDashboardUpdate().catch((error) => {
      console.error("No se pudo emitir la actualizacion del dashboard:", error);
    });

    return res.status(201).json({ ok: true, reading });
  } catch (error) {
    return next(error);
  }
};

const listReadings = async (req, res, next) => {
  try {
    const scopedHouseId = getUserHouseScope(req.user);
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    const deviceWhere = {};

    if (req.query.state) {
      where.state = req.query.state;
    }

    if (req.query.from || req.query.until) {
      where.ts = {};
      if (req.query.from) {
        where.ts[Op.gte] = new Date(req.query.from);
      }
      if (req.query.until) {
        where.ts[Op.lte] = new Date(req.query.until);
      }
    }

    if (req.query.deviceId) {
      deviceWhere.id = Number(req.query.deviceId);
    }

    if (scopedHouseId) {
      deviceWhere.house_id = scopedHouseId;
    } else if (req.query.houseId) {
      deviceWhere.house_id = Number(req.query.houseId);
    }

    const result = await Reading.findAndCountAll({
      where,
      include: [
        {
          model: Device,
          attributes: ["id", "name", "house_id"],
          where: Object.keys(deviceWhere).length ? deviceWhere : undefined,
          required: Object.keys(deviceWhere).length > 0,
          include: [{ model: House, attributes: ["id", "name", "code"], required: false }]
        }
      ],
      order: [["ts", "DESC"]],
      limit,
      offset,
      distinct: true
    });

    return res.json({
      ok: true,
      readings: result.rows,
      pagination: buildMeta(result.count)
    });
  } catch (error) {
    return next(error);
  }
};

const latestReading = async (req, res, next) => {
  try {
    const scopedHouseId = getUserHouseScope(req.user);
    const reading = await Reading.findOne({
      include: [
        {
          model: Device,
          attributes: ["id", "name", "house_id"],
          include: [{ model: House, attributes: ["id", "name", "code"], required: false }]
        }
      ],
      where: scopedHouseId ? { "$Device.house_id$": scopedHouseId } : undefined,
      order: [["ts", "DESC"]]
    });
    return res.json({ ok: true, reading });
  } catch (error) {
    return next(error);
  }
};

module.exports = { createReading, listReadings, latestReading, normalizeTimestamp };
