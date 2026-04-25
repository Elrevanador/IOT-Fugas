const { Alert, Device, House, Reading } = require("../models");
const { getUserHouseScope } = require("../middlewares/authorize");

const ONLINE_WINDOW_MS = 10_000; // Con telemetria cada 2 s, 10 s evita falsos offline sin ocultar caidas reales.
const FUTURE_TOLERANCE_MS = 5_000;

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

const buildPublicDashboardPayload = async (user) => {
  const scopedHouseId = getUserHouseScope(user);
  const scopedWhere = scopedHouseId ? { "$Device.house_id$": scopedHouseId } : undefined;
  const [latestReadingRaw, recentReadingsRaw, recentAlertsRaw] = await Promise.all([
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
      limit: 60
    }),
    Alert.findAll({
      include: [
        {
          model: Device,
          attributes: ["name", "house_id"],
          include: [{ model: House, attributes: ["id", "name"], required: false }]
        }
      ],
      where: scopedWhere,
      order: [["ts", "DESC"]],
      limit: 20
    })
  ]);

  const latestReading = latestReadingRaw ? mapReading(latestReadingRaw) : null;
  const recentReadings = recentReadingsRaw.map(mapReading).reverse();
  const recentAlerts = recentAlertsRaw.map(mapAlert);
  const lastSeenAt = latestReading?.ts || null;
  const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : Number.NaN;
  const nowMs = Date.now();
  const isValidLastSeen = Number.isFinite(lastSeenMs) && lastSeenMs <= nowMs + FUTURE_TOLERANCE_MS;
  const deviceOnline = isValidLastSeen ? nowMs - lastSeenMs <= ONLINE_WINDOW_MS : false;
  const currentState = latestReading?.state || "SIN_DATOS";

  return {
    ok: true,
    latestReading,
    recentReadings,
    recentAlerts,
    deviceOnline,
    lastSeenAt,
    currentState
  };
};

module.exports = { buildPublicDashboardPayload };
