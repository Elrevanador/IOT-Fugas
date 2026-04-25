const { Op } = require("sequelize");
const { AuditoriaSistema, User } = require("../models");
const { isAdmin } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");

const listAudit = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden consultar la auditoria" });
    }

    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    if (req.query.entidad) where.entidad = req.query.entidad;
    if (req.query.accion) where.accion = req.query.accion;
    if (req.query.userId) where.user_id = Number(req.query.userId);
    if (req.query.from || req.query.until) {
      where.ts = {};
      if (req.query.from) where.ts[Op.gte] = new Date(req.query.from);
      if (req.query.until) where.ts[Op.lte] = new Date(req.query.until);
    }

    const include = [];
    if (User) {
      include.push({ model: User, attributes: ["id", "email", "nombre", "role"], required: false });
    }

    const result = await AuditoriaSistema.findAndCountAll({
      where,
      include,
      order: [["ts", "DESC"]],
      limit,
      offset
    });

    return res.json({ ok: true, auditoria: result.rows, pagination: buildMeta(result.count) });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listAudit };
