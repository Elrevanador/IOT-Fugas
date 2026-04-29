const { Alert, Device, House } = require("../models");
const { broadcastDashboardUpdate } = require("../services/dashboardStream");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { recordAudit } = require("../services/audit");
const logger = require("../utils/logger");

// Constantes de seguridad
const MAX_ACK_NOTES_LENGTH = 500;
const ALERT_ACK_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 horas para acknowledge

const listAlerts = async (req, res, next) => {
  try {
    const scopedHouseId = getUserHouseScope(req.user);
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    // Validaciones de query parameters
    const where = {};
    const deviceWhere = {};

    if (req.query.acknowledged !== undefined) {
      where.acknowledged = req.query.acknowledged === "true";
    }

    if (req.query.severity) {
      const validSeverities = ["ALERTA", "FUGA", "ERROR"];
      if (!validSeverities.includes(req.query.severity)) {
        return res.status(400).json({ ok: false, msg: "Severidad inválida" });
      }
      where.severity = req.query.severity;
    }

    if (req.query.deviceId) {
      const deviceId = parseInt(req.query.deviceId);
      if (isNaN(deviceId) || deviceId <= 0) {
        return res.status(400).json({ ok: false, msg: "ID de dispositivo inválido" });
      }
      deviceWhere.id = deviceId;
    }

    if (scopedHouseId) {
      deviceWhere.house_id = scopedHouseId;
    } else if (req.query.houseId) {
      const houseId = parseInt(req.query.houseId);
      if (isNaN(houseId) || houseId <= 0) {
        return res.status(400).json({ ok: false, msg: "ID de casa inválido" });
      }
      deviceWhere.house_id = houseId;
    }

    const result = await Alert.findAndCountAll({
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
      alerts: result.rows,
      pagination: buildMeta(result.count)
    });
  } catch (error) {
    logger.error("Error listando alertas", {
      error: error.message,
      userId: req.user?.id,
      query: req.query
    });
    return next(error);
  }
};

const ackAlert = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para confirmar alertas" });
    }

    const { id } = req.params;
    const alertId = parseInt(id);
    if (isNaN(alertId) || alertId <= 0) {
      return res.status(400).json({ ok: false, msg: "ID de alerta inválido" });
    }

    const alert = await Alert.findByPk(alertId, {
      include: [{ model: Device, attributes: ["id", "house_id"], required: false }]
    });

    if (!alert) {
      return res.status(404).json({ ok: false, msg: "Alerta no encontrada" });
    }

    // Verificar que la alerta no esté ya reconocida
    if (alert.acknowledged) {
      return res.status(400).json({ ok: false, msg: "La alerta ya está reconocida" });
    }

    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId && alert.Device?.house_id !== scopedHouseId) {
      return res.status(403).json({ ok: false, msg: "No tienes acceso a esta alerta" });
    }

    // Validar y sanitizar la nota de reconocimiento
    const ackNote = req.body?.note || req.body?.ackNote || "";
    const sanitizedNote = String(ackNote).trim();

    if (sanitizedNote.length > MAX_ACK_NOTES_LENGTH) {
      return res.status(400).json({
        ok: false,
        msg: `La nota de reconocimiento no puede exceder ${MAX_ACK_NOTES_LENGTH} caracteres`
      });
    }

    // Verificar que la alerta no sea demasiado antigua para reconocer
    const alertAge = Date.now() - new Date(alert.ts).getTime();
    if (alertAge > ALERT_ACK_TIMEOUT_MS) {
      logger.warn("Intento de reconocer alerta demasiado antigua", {
        alertId: alert.id,
        alertAge: alertAge,
        userId: req.user.id
      });
      return res.status(400).json({
        ok: false,
        msg: "La alerta es demasiado antigua para ser reconocida"
      });
    }

    await alert.update({
      acknowledged: true,
      ack_at: new Date(),
      ack_by_user_id: req.user?.id || req.user?.uid || null,
      ack_note: sanitizedNote || null
    });

    // Registrar auditoría
    await recordAudit({
      user: req.user,
      entidad: "Alert",
      entidadId: alert.id,
      accion: "confirmar_alerta",
      detalle: {
        note: alert.ack_note || null,
        severity: alert.severity,
        device_id: alert.device_id
      },
      req
    });

    // Broadcast update de forma asíncrona
    broadcastDashboardUpdate().catch((error) => {
      logger.warn("Dashboard broadcast falló", { alertId: alert.id, error: error.message });
    });

    logger.info("Alerta reconocida exitosamente", {
      alertId: alert.id,
      userId: req.user.id,
      severity: alert.severity
    });

    return res.json({ ok: true, alert });
  } catch (error) {
    logger.error("Error reconociendo alerta", {
      error: error.message,
      alertId: req.params?.id,
      userId: req.user?.id
    });
    return next(error);
  }
};

module.exports = { listAlerts, ackAlert };
