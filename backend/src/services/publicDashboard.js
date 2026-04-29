const { Op, QueryTypes } = require("sequelize");
const { Alert, Device, House, Reading, sequelize } = require("../models");
const { getUserHouseScope } = require("../middlewares/authorize");
const logger = require("../utils/logger");

const ONLINE_WINDOW_MS = 10_000; // Con telemetria cada 2 s, 10 s evita falsos offline sin ocultar caidas reales.
const FUTURE_TOLERANCE_MS = 5_000;
const MAX_READINGS_LIMIT = 100;
const MAX_ALERTS_LIMIT = 50;
const VALID_ALERT_SEVERITIES = ["ALERTA", "FUGA", "ERROR"];

// Función auxiliar para validar y sanitizar parámetros
const validateDashboardParams = (user, query = {}) => {
  const scopedHouseId = getUserHouseScope(user);

  // Validar límites de consulta
  const readingsLimit = Math.min(
    parseInt(query.readingsLimit) || 60,
    MAX_READINGS_LIMIT
  );

  const alertsLimit = Math.min(
    parseInt(query.alertsLimit) || 20,
    MAX_ALERTS_LIMIT
  );

  // Validar filtros de severidad
  const severityFilter = query.severityFilter;
  if (severityFilter && !VALID_ALERT_SEVERITIES.includes(severityFilter)) {
    throw new Error("Filtro de severidad inválido");
  }

  // Validar rango de fechas si se especifica
  if (query.startDate) {
    const startDate = new Date(query.startDate);
    if (isNaN(startDate.getTime())) {
      throw new Error("Fecha de inicio inválida");
    }
    // No permitir fechas futuras
    if (startDate > new Date()) {
      throw new Error("Fecha de inicio no puede ser futura");
    }
  }

  if (query.endDate) {
    const endDate = new Date(query.endDate);
    if (isNaN(endDate.getTime())) {
      throw new Error("Fecha de fin inválida");
    }
  }

  return {
    scopedHouseId,
    readingsLimit,
    alertsLimit,
    severityFilter,
    startDate: query.startDate ? new Date(query.startDate) : null,
    endDate: query.endDate ? new Date(query.endDate) : null
  };
};

const mapReading = (reading) => ({
  id: reading.id,
  deviceId: reading.device_id,
  deviceName: reading.Device?.name || null,
  houseId: reading.Device?.House?.id || null,
  houseName: reading.Device?.House?.name || null,
  ts: reading.ts,
  flow_lmin: reading.flow_lmin,
  pressure_kpa: reading.pressure_kpa,
  risk: reading.risk,
  state: reading.state
});

const mapAlert = (alert) => ({
  id: alert.id,
  deviceId: alert.device_id,
  deviceName: alert.Device?.name || null,
  houseId: alert.Device?.House?.id || null,
  houseName: alert.Device?.House?.name || null,
  ts: alert.ts,
  severity: alert.severity,
  message: alert.message,
  acknowledged: Boolean(alert.acknowledged),
  ack_at: alert.ack_at
});

const isOnlineAt = (value, nowMs = Date.now()) => {
  const timestampMs = value ? new Date(value).getTime() : Number.NaN;
  const isValidTimestamp = Number.isFinite(timestampMs) && timestampMs <= nowMs + FUTURE_TOLERANCE_MS;
  return isValidTimestamp ? nowMs - timestampMs <= ONLINE_WINDOW_MS : false;
};

const mapDeviceReading = (reading, device) => {
  if (!reading) return null;
  return {
    id: reading.id,
    deviceId: device.id,
    deviceName: device.name || null,
    houseId: device.House?.id || device.house_id || null,
    houseName: device.House?.name || null,
    ts: reading.ts,
    flow_lmin: reading.flow_lmin,
    pressure_kpa: reading.pressure_kpa,
    risk: reading.risk,
    state: reading.state
  };
};

const mapDeviceSummary = (device, latestReading, nowMs) => {
  const mappedReading = mapDeviceReading(latestReading, device);
  const lastSeenAt = mappedReading?.ts || device.last_seen_at || null;
  return {
    id: device.id,
    name: device.name || null,
    houseId: device.House?.id || device.house_id || null,
    houseName: device.House?.name || null,
    status: device.status || null,
    lastSeenAt,
    lastState: mappedReading?.state || device.status || "SIN_DATOS",
    online: isOnlineAt(lastSeenAt, nowMs),
    latestReading: mappedReading
  };
};

const buildPublicDashboardPayload = async (user, query = {}) => {
  try {
    const { scopedHouseId, readingsLimit, alertsLimit, severityFilter, startDate, endDate } = validateDashboardParams(user, query);

    // Validar rango de fechas
    if (startDate && endDate && startDate > endDate) {
      throw new Error("Fecha de inicio no puede ser posterior a la fecha de fin");
    }

    const scopedWhere = scopedHouseId ? { "$Device.house_id$": scopedHouseId } : undefined;
    const alertWhere = { ...scopedWhere };

    // Aplicar filtro de severidad si se especifica
    if (severityFilter) {
      alertWhere.severity = severityFilter;
    }

    // Aplicar filtros de fecha si se especifican
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter[Op.gte] = startDate;
      if (endDate) dateFilter[Op.lte] = endDate;
      alertWhere.ts = dateFilter;
    }

    logger.info("Construyendo payload del dashboard público", {
      userId: user?.id,
      scopedHouseId,
      readingsLimit,
      alertsLimit,
      severityFilter,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString()
    });

    // Ejecutar consultas en paralelo con timeout para evitar bloqueos
    const queryPromises = [
      // Latest reading
      Reading.findOne({
        include: [
          {
            model: Device,
            attributes: ["name", "house_id"],
            include: [{ model: House, attributes: ["id", "name"], required: false }]
          }
        ],
        where: scopedWhere,
        order: [["ts", "DESC"]]
      }),

      // Recent readings
      Reading.findAll({
        include: [
          {
            model: Device,
            attributes: ["name", "house_id"],
            include: [{ model: House, attributes: ["id", "name"], required: false }]
          }
        ],
        where: scopedWhere,
        order: [["ts", "DESC"]],
        limit: readingsLimit
      }),

      // Recent alerts
      Alert.findAll({
        include: [
          {
            model: Device,
            attributes: ["name", "house_id"],
            include: [{ model: House, attributes: ["id", "name"], required: false }]
          }
        ],
        where: alertWhere,
        order: [["ts", "DESC"]],
        limit: alertsLimit
      }),

      // Devices
      Device.findAll({
        attributes: ["id", "name", "house_id", "status", "last_seen_at"],
        where: scopedHouseId ? { house_id: scopedHouseId } : undefined,
        include: [{ model: House, attributes: ["id", "name"], required: false }],
        order: [["id", "ASC"]],
        limit: 200
      })
    ];

    const [latestReadingRaw, recentReadingsRaw, recentAlertsRaw, devicesRaw] = await Promise.all(queryPromises);

    // Optimización: obtener latest readings por dispositivo en una sola query
    const deviceIds = devicesRaw.map(d => d.id);
    const latestReadingsByDevice = new Map();

    if (deviceIds.length > 0) {
      let loadedWithBatchQuery = false;

      if (sequelize?.query) {
        try {
          const latestReadingsRaw = await sequelize.query(`
            SELECT r.device_id, r.id, r.ts, r.flow_lmin, r.pressure_kpa, r.risk, r.state
            FROM readings r
            INNER JOIN (
              SELECT device_id, MAX(ts) AS max_ts
              FROM readings
              WHERE device_id IN (:deviceIds)
              GROUP BY device_id
            ) latest
              ON latest.device_id = r.device_id
             AND latest.max_ts = r.ts
            WHERE r.device_id IN (:deviceIds)
            ORDER BY r.device_id ASC, r.id DESC
          `, {
            replacements: { deviceIds },
            type: QueryTypes.SELECT
          });

          latestReadingsRaw.forEach(r => {
            if (r.device_id && r.id && !latestReadingsByDevice.has(r.device_id)) {
              latestReadingsByDevice.set(r.device_id, r);
            }
          });
          loadedWithBatchQuery = true;
        } catch (queryError) {
          logger.warn("Error en query de lecturas recientes, usando fallback", {
            error: queryError.message,
            deviceIdsCount: deviceIds.length
          });
        }
      }

      if (!loadedWithBatchQuery) {
        // Fallback: obtener lecturas individualmente
        for (const deviceId of deviceIds.slice(0, 50)) { // Limitar para evitar sobrecarga
          try {
            const reading = await Reading.findOne({
              where: { device_id: deviceId },
              order: [["ts", "DESC"]],
              limit: 1
            });
            if (reading) {
              const plainReading = typeof reading.toJSON === "function" ? reading.toJSON() : reading;
              latestReadingsByDevice.set(deviceId, plainReading);
            }
          } catch (individualError) {
            logger.warn("Error obteniendo lectura individual", {
              deviceId,
              error: individualError.message
            });
          }
        }
      }
    }

    const nowMs = Date.now();

    // Mapear resultados
    const latestReading = latestReadingRaw ? mapReading(latestReadingRaw) : null;
    const recentReadings = recentReadingsRaw.map(mapReading).reverse();
    const recentAlerts = recentAlertsRaw.map(mapAlert);
    const devices = devicesRaw.map((device) =>
      mapDeviceSummary(device, latestReadingsByDevice.get(device.id), nowMs)
    );

    // Calcular estadísticas
    const onlineDevices = devices.filter(d => d.online).length;
    const totalDevices = devices.length;
    const alertsCount = recentAlerts.length;
    const criticalAlerts = recentAlerts.filter(a => a.severity === 'FUGA' || a.severity === 'CRITICAL').length;
    const activeAlerts = recentAlerts.filter(a => !a.acknowledged).length;
    const lastSeenAt = latestReading?.ts || null;
    const deviceOnline = devices.length ? devices.some((device) => device.online) : isOnlineAt(lastSeenAt, nowMs);
    const currentState = latestReading?.state || "SIN_DATOS";

    const result = {
      ok: true,
      latestReading,
      recentReadings,
      recentAlerts,
      devices,
      deviceOnline,
      lastSeenAt,
      currentState,
      summary: {
        totalDevices,
        onlineDevices,
        offlineDevices: totalDevices - onlineDevices,
        alertsCount,
        criticalAlerts,
        activeAlerts,
        lastUpdated: new Date(nowMs),
        lastUpdate: new Date(nowMs).toISOString()
      }
    };

    logger.info("Dashboard público construido exitosamente", {
      totalDevices,
      onlineDevices,
      alertsCount,
      readingsCount: recentReadings.length
    });

    return result;

  } catch (error) {
    logger.error("Error construyendo dashboard público", {
      error: error.message,
      userId: user?.id,
      query
    });
    throw error;
  }
};

module.exports = { buildPublicDashboardPayload };
