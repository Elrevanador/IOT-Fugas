const { Op } = require("sequelize");
const { sequelize, Device, Reading, Alert, House, Sensor } = require("../models");
const { broadcastDashboardUpdate } = require("../services/dashboardStream");
const { getUserHouseScope } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { runLeakDetection } = require("../services/leakDetection");
const { recordAudit } = require("../services/audit");
const logger = require("../utils/logger");

const FUTURE_TOLERANCE_MS = 5_000;
const MAX_READINGS_PER_REQUEST = 1000;
const VALID_STATES = ["NORMAL", "ALERTA", "FUGA", "ERROR"];

const normalizeTimestamp = (rawTs) => {
  const now = new Date();
  if (!rawTs) return now;

  const parsed = new Date(rawTs);
  if (Number.isNaN(parsed.getTime())) {
    logger.warn("Timestamp inválido recibido, usando timestamp actual", { rawTs });
    return now;
  }

  if (parsed.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    logger.warn("Timestamp futuro detectado, usando timestamp actual", {
      rawTs,
      parsed: parsed.toISOString(),
      now: now.toISOString()
    });
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
  ipAddress,
  wifiSsid,
  internetConnected,
  authenticatedDevice,
  transaction
}) => {
  const name = String(deviceName || "").trim();

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
    if (ipAddress && device.ip_address !== ipAddress) metadataPatch.ip_address = ipAddress;
    if (wifiSsid && device.wifi_ssid !== wifiSsid) metadataPatch.wifi_ssid = wifiSsid;
    metadataPatch.internet_connected = Boolean(internetConnected);
    if (internetConnected) metadataPatch.last_connection_at = new Date();
    if (Object.keys(metadataPatch).length) {
      await device.update(metadataPatch, { transaction });
    }

    return device;
  }

  if (authenticatedDevice) {
    return Device.findByPk(authenticatedDevice.id, { transaction });
  }

  if (hardwareUid) {
    const device = await Device.findOne({ where: { hardware_uid: hardwareUid }, transaction });
    if (device) {
      const metadataPatch = {};
      if (house && !device.house_id) metadataPatch.house_id = house.id;
      if (deviceType && device.device_type !== deviceType) metadataPatch.device_type = deviceType;
      if (firmwareVersion && device.firmware_version !== firmwareVersion) metadataPatch.firmware_version = firmwareVersion;
      if (ipAddress && device.ip_address !== ipAddress) metadataPatch.ip_address = ipAddress;
      if (wifiSsid && device.wifi_ssid !== wifiSsid) metadataPatch.wifi_ssid = wifiSsid;
      metadataPatch.internet_connected = Boolean(internetConnected);
      if (internetConnected) metadataPatch.last_connection_at = new Date();
      if (Object.keys(metadataPatch).length) {
        await device.update(metadataPatch, { transaction });
      }
      return device;
    }
  }

  const [device] = await Device.findOrCreate({
    where: { name },
    defaults: {
      house_id: house?.id || null,
      name,
      status: "ACTIVO",
      device_type: deviceType || null,
      firmware_version: firmwareVersion || null,
      hardware_uid: hardwareUid || null,
      ip_address: ipAddress || null,
      wifi_ssid: wifiSsid || null,
      internet_connected: Boolean(internetConnected),
      last_connection_at: internetConnected ? new Date() : null
    },
    transaction
  });

  const metadataPatch = {};
  if (house && !device.house_id) metadataPatch.house_id = house.id;
  if (deviceType && !device.device_type) metadataPatch.device_type = deviceType;
  if (firmwareVersion && device.firmware_version !== firmwareVersion) metadataPatch.firmware_version = firmwareVersion;
  if (hardwareUid && !device.hardware_uid) metadataPatch.hardware_uid = hardwareUid;
  if (ipAddress && device.ip_address !== ipAddress) metadataPatch.ip_address = ipAddress;
  if (wifiSsid && device.wifi_ssid !== wifiSsid) metadataPatch.wifi_ssid = wifiSsid;
  metadataPatch.internet_connected = Boolean(internetConnected);
  if (internetConnected) metadataPatch.last_connection_at = new Date();
  if (Object.keys(metadataPatch).length) {
    await device.update(metadataPatch, { transaction });
  }

  return device;
};

/**
 * Crea una nueva lectura de sensor IoT
 *
 * Autenticación: x-device-key (header) o INGEST_API_KEY global
 * Rate Limit: 100 req/min por dispositivo
 *
 * @param {Object} req.body
 * @param {number} [req.body.houseId] - ID de la casa (opcional si se usa deviceId)
 * @param {number} [req.body.deviceId] - ID del dispositivo (requerido si no deviceName)
 * @param {string} [req.body.deviceName] - Nombre del dispositivo (requerido si no deviceId)
 * @param {string} [req.body.deviceType] - Tipo de dispositivo
 * @param {string} [req.body.firmwareVersion] - Versión de firmware
 * @param {string} [req.body.hardwareUid] - UID de hardware
 * @param {number} [req.body.sensorId] - ID del sensor
 * @param {string} [req.body.ts] - Timestamp ISO
 * @param {number} req.body.flow_lmin - Flujo en L/min (requerido)
 * @param {number} [req.body.pressure_kpa] - Presión en kPa
 * @param {string} [req.body.risk] - Nivel de riesgo
 * @param {string} req.body.state - Estado: NORMAL|ALERTA|FUGA|ERROR (requerido)
 *
 * @returns {Object} { ok: true, reading: {...} }
 * @throws 400 - Validación fallida
 * @throws 401 - No autenticado o API key inválida
 * @throws 404 - Dispositivo no encontrado
 * @throws 429 - Rate limit excedido
 */
const createReading = async (req, res, next) => {
  try {
    const {
      houseId,
      deviceId,
      deviceName,
      deviceType,
      firmwareVersion,
      hardwareUid,
      ipAddress,
      wifiSsid,
      internetConnected,
      sensorId,
      ts,
      flow_lmin,
      pressure_kpa,
      risk,
      state
    } = req.body;

    // Validaciones de entrada críticas
    if (flow_lmin === undefined || flow_lmin === null || typeof flow_lmin !== 'number' || Number.isNaN(flow_lmin) || flow_lmin < 0 || flow_lmin > 10000) {
      return res.status(400).json({
        ok: false,
        msg: "flow_lmin requerido y debe ser un número entre 0 y 10000"
      });
    }

    if (!state || !VALID_STATES.includes(state)) {
      return res.status(400).json({
        ok: false,
        msg: `state requerido y debe ser uno de: ${VALID_STATES.join(', ')}`
      });
    }

    if (pressure_kpa !== undefined && (typeof pressure_kpa !== 'number' || Number.isNaN(pressure_kpa) || pressure_kpa < 0 || pressure_kpa > 10000)) {
      return res.status(400).json({
        ok: false,
        msg: "pressure_kpa debe ser un número entre 0 y 10000"
      });
    }

    const normalizedRisk = risk === undefined || risk === null || risk === "" ? 0 : Number(risk);
    if (!Number.isFinite(normalizedRisk) || normalizedRisk < 0 || normalizedRisk > 100) {
      return res.status(400).json({
        ok: false,
        msg: "risk debe ser un número entre 0 y 100"
      });
    }

    // Validar sensor si se proporciona
    if (sensorId !== undefined && sensorId !== null && sensorId !== "") {
      const sensorIdNum = Number(sensorId);
      if (isNaN(sensorIdNum) || sensorIdNum <= 0) {
        return res.status(400).json({ ok: false, msg: "sensorId debe ser un número positivo" });
      }
    }

    // Normalizar y validar datos del dispositivo
    const normalizedDeviceType = deviceType ? String(deviceType).trim() : null;
    const normalizedFirmwareVersion = firmwareVersion ? String(firmwareVersion).trim() : null;
    const normalizedHardwareUid = hardwareUid ? String(hardwareUid).trim() : null;
    const normalizedIpAddress = ipAddress ? String(ipAddress).trim().slice(0, 45) : null;
    const normalizedWifiSsid = wifiSsid ? String(wifiSsid).trim().slice(0, 120) : null;
    const normalizedInternetConnected =
      internetConnected === undefined || internetConnected === null ? true : Boolean(internetConnected);
    const timestamp = normalizeTimestamp(ts);

    logger.info("Procesando nueva lectura de sensor", {
      deviceId,
      deviceName,
      flow_lmin,
      state,
      authenticatedDevice: req.authenticatedDevice?.id
    });

    const reading = await sequelize.transaction(async (transaction) => {
      const device = await ensureDevice({
        houseId,
        deviceId,
        deviceName,
        deviceType: normalizedDeviceType,
        firmwareVersion: normalizedFirmwareVersion,
        hardwareUid: normalizedHardwareUid,
        ipAddress: normalizedIpAddress,
        wifiSsid: normalizedWifiSsid,
        internetConnected: normalizedInternetConnected,
        authenticatedDevice: req.authenticatedDevice || null,
        transaction
      });

      const previousStatus = device.status || "NORMAL";

      // Validar sensor si se especifica
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

      // Crear la lectura
      const createdReading = await Reading.create(
        {
          device_id: device.id,
          ts: timestamp,
          flow_lmin,
          pressure_kpa,
          risk: normalizedRisk,
          state,
          sensor_id: sensorId ? Number(sensorId) : null
        },
        { transaction }
      );

      // Actualizar estado del dispositivo
      await device.update(
        {
          status: state,
          last_seen_at: timestamp,
          device_type: normalizedDeviceType || device.device_type || null,
          firmware_version: normalizedFirmwareVersion || device.firmware_version || null,
          hardware_uid: normalizedHardwareUid || device.hardware_uid || null,
          ip_address: normalizedIpAddress || device.ip_address || null,
          wifi_ssid: normalizedWifiSsid || device.wifi_ssid || null,
          internet_connected: normalizedInternetConnected,
          last_connection_at: normalizedInternetConnected ? timestamp : device.last_connection_at || null
        },
        { transaction }
      );

      // Crear alerta si el estado cambió a problemático
      if (state !== "NORMAL" && previousStatus !== state) {
        const recentOpenAlert = await Alert.findOne({
          where: {
            device_id: device.id,
            severity: state,
            acknowledged: false
          },
          order: [["ts", "DESC"]],
          limit: 1,
          transaction
        });

        if (!recentOpenAlert) {
          await Alert.create(
            {
              device_id: device.id,
              ts: timestamp,
              severity: state,
              tipo: state,
              message: `Estado ${state} | Flujo ${flow_lmin} L/min | Presion ${pressure_kpa ?? 'N/A'} kPa | Riesgo ${normalizedRisk}`,
              acknowledged: false
            },
            { transaction }
          );
        }
      }

      // Ejecutar detección de fugas
      await runLeakDetection({ device, reading: createdReading, transaction });

      return createdReading;
    });

    // Registrar auditoría
    await recordAudit({
      entidad: "Reading",
      entidadId: reading.id,
      accion: "crear_lectura",
      detalle: {
        device_id: reading.device_id,
        flow_lmin,
        state,
        risk: normalizedRisk,
        sensor_id: reading.sensor_id
      },
      req
    });

    // Broadcast actualización del dashboard
    broadcastDashboardUpdate().catch((error) => {
      logger.warn("Dashboard broadcast falló", { readingId: reading.id, error: error.message });
    });

    logger.info("Lectura creada exitosamente", {
      readingId: reading.id,
      deviceId: reading.device_id,
      flow_lmin,
      state
    });

    return res.status(201).json({ ok: true, reading });
  } catch (error) {
    logger.error("Error creando lectura", {
      error: error.message,
      deviceId: req.body?.deviceId,
      deviceName: req.body?.deviceName,
      flow_lmin: req.body?.flow_lmin,
      state: req.body?.state
    });
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
