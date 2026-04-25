const { UbicacionInstalacion, House } = require("../models");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { recordAudit } = require("../services/audit");

const ensureHouseAccess = (req, houseId) => {
  const scopedHouseId = getUserHouseScope(req.user);
  if (!scopedHouseId) return { ok: true };
  if (Number(houseId) !== scopedHouseId) {
    return { ok: false, status: 403, msg: "No tienes acceso a esta vivienda" };
  }
  return { ok: true };
};

const listLocations = async (req, res, next) => {
  try {
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId) where.house_id = scopedHouseId;
    else if (req.query.houseId) where.house_id = Number(req.query.houseId);

    const result = await UbicacionInstalacion.findAndCountAll({
      where,
      include: [{ model: House, attributes: ["id", "name", "code"], required: false }],
      order: [["id", "ASC"]],
      limit,
      offset
    });

    return res.json({ ok: true, ubicaciones: result.rows, pagination: buildMeta(result.count) });
  } catch (error) {
    return next(error);
  }
};

const createLocation = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos" });
    }
    const { houseId, nombre, descripcion, area, piso } = req.body;
    if (!nombre || !houseId) {
      return res.status(400).json({ ok: false, msg: "houseId y nombre son requeridos" });
    }
    const scopeCheck = ensureHouseAccess(req, houseId);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });
    const house = await House.findByPk(Number(houseId), { attributes: ["id"] });
    if (!house) return res.status(404).json({ ok: false, msg: "Vivienda no encontrada" });

    const ubicacion = await UbicacionInstalacion.create({
      house_id: Number(houseId),
      nombre: String(nombre).slice(0, 120),
      descripcion: descripcion ? String(descripcion).slice(0, 255) : null,
      area: area ? String(area).slice(0, 80) : null,
      piso: piso ? String(piso).slice(0, 40) : null
    });

    await recordAudit({
      user: req.user,
      entidad: "UbicacionInstalacion",
      entidadId: ubicacion.id,
      accion: "crear_ubicacion",
      detalle: { houseId, nombre },
      req
    });

    return res.status(201).json({ ok: true, ubicacion });
  } catch (error) {
    return next(error);
  }
};

const updateLocation = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos" });
    }
    const ubicacion = await UbicacionInstalacion.findByPk(req.params.id);
    if (!ubicacion) return res.status(404).json({ ok: false, msg: "Ubicacion no encontrada" });

    const scopeCheck = ensureHouseAccess(req, ubicacion.house_id);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    const allowed = ["nombre", "descripcion", "area", "piso"];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    await ubicacion.update(patch);

    await recordAudit({
      user: req.user,
      entidad: "UbicacionInstalacion",
      entidadId: ubicacion.id,
      accion: "actualizar_ubicacion",
      detalle: patch,
      req
    });

    return res.json({ ok: true, ubicacion });
  } catch (error) {
    return next(error);
  }
};

const deleteLocation = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos" });
    }
    const ubicacion = await UbicacionInstalacion.findByPk(req.params.id);
    if (!ubicacion) return res.status(404).json({ ok: false, msg: "Ubicacion no encontrada" });

    const scopeCheck = ensureHouseAccess(req, ubicacion.house_id);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    await ubicacion.destroy();
    await recordAudit({
      user: req.user,
      entidad: "UbicacionInstalacion",
      entidadId: ubicacion.id,
      accion: "eliminar_ubicacion",
      req
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listLocations, createLocation, updateLocation, deleteLocation };
