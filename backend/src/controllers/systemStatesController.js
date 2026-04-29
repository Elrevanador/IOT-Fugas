const { Op } = require("sequelize");
const { Device, EstadoSistema, House } = require("../models");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { recordAudit } = require("../services/audit");

const STATES = ["NORMAL", "ALERTA", "FUGA", "MANTENIMIENTO", "OFFLINE"];

const ensureHouseScope = async (req, deviceId) => {
  const device = await Device.findByPk(deviceId, { attributes: ["id", "house_id"] });
  if (!device) return { ok: false, status: 404, msg: "Dispositivo no encontrado" };

  const scopedHouseId = getUserHouseScope(req.user);
  if (scopedHouseId && Number(device.house_id) !== scopedHouseId) {
    return { ok: false, status: 403, msg: "No tienes acceso a este dispositivo" };
  }
  return { ok: true, device };
};

const listSystemStates = async (req, res, next) => {
  try {
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    const deviceWhere = {};

    if (req.query.estado) where.estado = req.query.estado;
    if (req.query.deviceId) deviceWhere.id = Number(req.query.deviceId);
    if (req.query.from || req.query.until) {
      where.ts = {};
      if (req.query.from) where.ts[Op.gte] = new Date(req.query.from);
      if (req.query.until) where.ts[Op.lte] = new Date(req.query.until);
    }

    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId) deviceWhere.house_id = scopedHouseId;
    else if (req.query.houseId) deviceWhere.house_id = Number(req.query.houseId);

    const result = await EstadoSistema.findAndCountAll({
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

    return res.json({ ok: true, estados: result.rows, pagination: buildMeta(result.count) });
  } catch (error) {
    return next(error);
  }
};

const createSystemState = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para registrar estados" });
    }

    const deviceId = Number(req.body.deviceId);
    const scopeCheck = await ensureHouseScope(req, deviceId);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    const estado = String(req.body.estado || "").trim().toUpperCase();
    if (!STATES.includes(estado)) return res.status(400).json({ ok: false, msg: "estado invalido" });

    const systemState = await EstadoSistema.create({
      device_id: deviceId,
      ts: req.body.ts ? new Date(req.body.ts) : new Date(),
      estado,
      motivo: req.body.motivo ? String(req.body.motivo).trim().slice(0, 180) : null,
      metadata: req.body.metadata && typeof req.body.metadata === "object" ? req.body.metadata : null
    });

    await recordAudit({
      user: req.user,
      entidad: "EstadoSistema",
      entidadId: systemState.id,
      accion: "registrar_estado",
      detalle: { deviceId, estado },
      req
    });

    return res.status(201).json({ ok: true, estado: systemState });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listSystemStates, createSystemState };
