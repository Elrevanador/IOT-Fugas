const { Op } = require("sequelize");
const { IncidenteFuga, Device, House, Alert } = require("../models");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { recordAudit } = require("../services/audit");

const VALID_STATES = ["ABIERTO", "CONFIRMADO", "FALSO_POSITIVO", "CERRADO"];

const buildDeviceScope = (req) => {
  const scopedHouseId = getUserHouseScope(req.user);
  const deviceWhere = {};
  if (req.query.deviceId) deviceWhere.id = Number(req.query.deviceId);
  if (scopedHouseId) deviceWhere.house_id = scopedHouseId;
  else if (req.query.houseId) deviceWhere.house_id = Number(req.query.houseId);
  return deviceWhere;
};

const listIncidents = async (req, res, next) => {
  try {
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    if (req.query.estado) where.estado = req.query.estado;
    if (req.query.from || req.query.until) {
      where.detected_at = {};
      if (req.query.from) where.detected_at[Op.gte] = new Date(req.query.from);
      if (req.query.until) where.detected_at[Op.lte] = new Date(req.query.until);
    }

    const deviceWhere = buildDeviceScope(req);

    const result = await IncidenteFuga.findAndCountAll({
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
      order: [["detected_at", "DESC"]],
      limit,
      offset,
      distinct: true
    });

    return res.json({
      ok: true,
      incidentes: result.rows,
      pagination: buildMeta(result.count)
    });
  } catch (error) {
    return next(error);
  }
};

const getIncident = async (req, res, next) => {
  try {
    const incidente = await IncidenteFuga.findByPk(req.params.id, {
      include: [
        {
          model: Device,
          attributes: ["id", "name", "house_id"],
          include: [{ model: House, attributes: ["id", "name", "code"], required: false }]
        },
        { model: Alert, as: "alertas", required: false }
      ]
    });
    if (!incidente) return res.status(404).json({ ok: false, msg: "Incidente no encontrado" });

    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId && incidente.Device?.house_id !== scopedHouseId) {
      return res.status(403).json({ ok: false, msg: "No tienes acceso a este incidente" });
    }

    return res.json({ ok: true, incidente });
  } catch (error) {
    return next(error);
  }
};

const updateIncidentStatus = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para actualizar incidentes" });
    }

    const { estado, observaciones } = req.body;
    if (!VALID_STATES.includes(estado)) {
      return res.status(400).json({ ok: false, msg: "estado invalido" });
    }

    const incidente = await IncidenteFuga.findByPk(req.params.id, {
      include: [{ model: Device, attributes: ["id", "house_id"], required: false }]
    });
    if (!incidente) return res.status(404).json({ ok: false, msg: "Incidente no encontrado" });

    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId && incidente.Device?.house_id !== scopedHouseId) {
      return res.status(403).json({ ok: false, msg: "No tienes acceso a este incidente" });
    }

    const now = new Date();
    const patch = { estado };
    if (observaciones !== undefined) patch.observaciones = String(observaciones).slice(0, 2000);
    if (estado === "CERRADO" || estado === "FALSO_POSITIVO" || estado === "CONFIRMADO") {
      patch.resuelto_por_user_id = req.user?.id || req.user?.uid || null;
      patch.resuelto_at = now;
      if (!incidente.ended_at && estado !== "CONFIRMADO") patch.ended_at = now;
    }

    await incidente.update(patch);
    await recordAudit({
      user: req.user,
      entidad: "IncidenteFuga",
      entidadId: incidente.id,
      accion: `cambio_estado:${estado}`,
      detalle: { observaciones: patch.observaciones || null },
      req
    });

    return res.json({ ok: true, incidente });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listIncidents, getIncident, updateIncidentStatus };
