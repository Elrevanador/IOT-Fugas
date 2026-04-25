const { Alert, Device, House } = require("../models");
const { broadcastDashboardUpdate } = require("../services/dashboardStream");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { recordAudit } = require("../services/audit");

const listAlerts = async (req, res, next) => {
  try {
    const scopedHouseId = getUserHouseScope(req.user);
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    const deviceWhere = {};

    if (req.query.acknowledged !== undefined) {
      where.acknowledged = req.query.acknowledged === "true";
    }

    if (req.query.severity) {
      where.severity = req.query.severity;
    }

    if (req.query.deviceId) {
      deviceWhere.id = Number(req.query.deviceId);
    }

    if (scopedHouseId) {
      deviceWhere.house_id = scopedHouseId;
    } else if (req.query.houseId) {
      deviceWhere.house_id = Number(req.query.houseId);
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
    return next(error);
  }
};

const ackAlert = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para confirmar alertas" });
    }

    const { id } = req.params;
    const alert = await Alert.findByPk(id, {
      include: [{ model: Device, attributes: ["id", "house_id"], required: false }]
    });
    if (!alert) {
      return res.status(404).json({ ok: false, msg: "Alerta no encontrada" });
    }
    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId && alert.Device?.house_id !== scopedHouseId) {
      return res.status(403).json({ ok: false, msg: "No tienes acceso a esta alerta" });
    }
    const ackNote = req.body?.note || req.body?.ackNote || "";
    await alert.update({
      acknowledged: true,
      ack_at: new Date(),
      ack_by_user_id: req.user?.id || req.user?.uid || null,
      ack_note: ackNote ? String(ackNote).slice(0, 500) : null
    });

    await recordAudit({
      user: req.user,
      entidad: "Alert",
      entidadId: alert.id,
      accion: "confirmar_alerta",
      detalle: { note: alert.ack_note || null },
      req
    });

    broadcastDashboardUpdate().catch((error) => {
      console.error("No se pudo emitir la actualizacion del dashboard:", error);
    });

    return res.json({ ok: true, alert });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listAlerts, ackAlert };
