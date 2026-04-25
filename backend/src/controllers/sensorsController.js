const { Sensor, Device, House, UbicacionInstalacion } = require("../models");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { recordAudit } = require("../services/audit");

const VALID_TIPOS = ["caudal", "presion", "valvula", "temperatura", "otro"];

const ensureHouseScope = async (req, deviceId) => {
  const device = await Device.findByPk(deviceId, { attributes: ["id", "house_id"] });
  if (!device) return { ok: false, status: 404, msg: "Dispositivo no encontrado" };

  const scopedHouseId = getUserHouseScope(req.user);
  if (scopedHouseId && device.house_id !== scopedHouseId) {
    return { ok: false, status: 403, msg: "No tienes acceso a este dispositivo" };
  }
  return { ok: true, device };
};

const validateLocationForDevice = async (ubicacionId, device) => {
  if (!ubicacionId) return { ok: true };
  const ubicacion = await UbicacionInstalacion.findByPk(ubicacionId, { attributes: ["id", "house_id"] });
  if (!ubicacion) return { ok: false, status: 404, msg: "Ubicacion no encontrada" };
  if (device.house_id && Number(ubicacion.house_id) !== Number(device.house_id)) {
    return { ok: false, status: 409, msg: "La ubicacion no pertenece a la vivienda del dispositivo" };
  }
  return { ok: true };
};

const listSensors = async (req, res, next) => {
  try {
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    if (req.query.deviceId) where.device_id = Number(req.query.deviceId);
    if (req.query.tipo) where.tipo = req.query.tipo;

    const scopedHouseId = getUserHouseScope(req.user);
    const deviceInclude = {
      model: Device,
      attributes: ["id", "name", "house_id"],
      include: [{ model: House, attributes: ["id", "name", "code"], required: false }]
    };
    if (scopedHouseId) {
      deviceInclude.where = { house_id: scopedHouseId };
      deviceInclude.required = true;
    }

    const result = await Sensor.findAndCountAll({
      where,
      include: [deviceInclude, { model: UbicacionInstalacion, required: false }],
      order: [["id", "ASC"]],
      limit,
      offset,
      distinct: true
    });

    return res.json({ ok: true, sensores: result.rows, pagination: buildMeta(result.count) });
  } catch (error) {
    return next(error);
  }
};

const createSensor = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos" });
    }

    const { deviceId, tipo, modelo, unidad, rango_min, rango_max, ubicacionId } = req.body;
    if (!VALID_TIPOS.includes(tipo)) {
      return res.status(400).json({ ok: false, msg: "tipo invalido" });
    }

    const scopeCheck = await ensureHouseScope(req, Number(deviceId));
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });
    const locationCheck = await validateLocationForDevice(ubicacionId ? Number(ubicacionId) : null, scopeCheck.device);
    if (!locationCheck.ok) return res.status(locationCheck.status).json({ ok: false, msg: locationCheck.msg });

    const sensor = await Sensor.create({
      device_id: Number(deviceId),
      tipo,
      modelo: modelo || null,
      unidad: unidad || null,
      rango_min: rango_min != null ? Number(rango_min) : null,
      rango_max: rango_max != null ? Number(rango_max) : null,
      ubicacion_id: ubicacionId ? Number(ubicacionId) : null,
      activo: true
    });

    await recordAudit({
      user: req.user,
      entidad: "Sensor",
      entidadId: sensor.id,
      accion: "crear_sensor",
      detalle: { deviceId, tipo },
      req
    });

    return res.status(201).json({ ok: true, sensor });
  } catch (error) {
    return next(error);
  }
};

const updateSensor = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos" });
    }
    const sensor = await Sensor.findByPk(req.params.id);
    if (!sensor) return res.status(404).json({ ok: false, msg: "Sensor no encontrado" });

    const scopeCheck = await ensureHouseScope(req, sensor.device_id);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    const allowed = ["tipo", "modelo", "unidad", "rango_min", "rango_max", "ubicacion_id", "activo"];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (req.body.ubicacionId !== undefined) patch.ubicacion_id = req.body.ubicacionId;
    if (patch.tipo && !VALID_TIPOS.includes(patch.tipo)) {
      return res.status(400).json({ ok: false, msg: "tipo invalido" });
    }
    const locationCheck = await validateLocationForDevice(patch.ubicacion_id ? Number(patch.ubicacion_id) : null, scopeCheck.device);
    if (!locationCheck.ok) return res.status(locationCheck.status).json({ ok: false, msg: locationCheck.msg });

    await sensor.update(patch);
    await recordAudit({
      user: req.user,
      entidad: "Sensor",
      entidadId: sensor.id,
      accion: "actualizar_sensor",
      detalle: patch,
      req
    });

    return res.json({ ok: true, sensor });
  } catch (error) {
    return next(error);
  }
};

const deleteSensor = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos" });
    }
    const sensor = await Sensor.findByPk(req.params.id);
    if (!sensor) return res.status(404).json({ ok: false, msg: "Sensor no encontrado" });

    const scopeCheck = await ensureHouseScope(req, sensor.device_id);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    await sensor.destroy();
    await recordAudit({
      user: req.user,
      entidad: "Sensor",
      entidadId: sensor.id,
      accion: "eliminar_sensor",
      req
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listSensors, createSensor, updateSensor, deleteSensor };
