const { Sensor, Device, House, UbicacionInstalacion } = require("../models");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { recordAudit } = require("../services/audit");
const logger = require("../utils/logger");

const VALID_TIPOS = ["caudal", "presion", "valvula", "temperatura", "otro"];
const MAX_MODELO_LENGTH = 100;
const MAX_UNIDAD_LENGTH = 20;

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
      include: [deviceInclude, { model: UbicacionInstalacion, as: "ubicacion", required: false }],
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

    // Validaciones de entrada críticas
    if (!deviceId || isNaN(Number(deviceId))) {
      return res.status(400).json({ ok: false, msg: "deviceId requerido y debe ser un número válido" });
    }

    if (!tipo || !VALID_TIPOS.includes(tipo)) {
      return res.status(400).json({
        ok: false,
        msg: `tipo requerido y debe ser uno de: ${VALID_TIPOS.join(', ')}`
      });
    }

    if (modelo !== undefined && (typeof modelo !== 'string' || modelo.length > MAX_MODELO_LENGTH)) {
      return res.status(400).json({
        ok: false,
        msg: `modelo debe ser una cadena y máximo ${MAX_MODELO_LENGTH} caracteres`
      });
    }

    if (unidad !== undefined && (typeof unidad !== 'string' || unidad.length > MAX_UNIDAD_LENGTH)) {
      return res.status(400).json({
        ok: false,
        msg: `unidad debe ser una cadena y máximo ${MAX_UNIDAD_LENGTH} caracteres`
      });
    }

    if (rango_min !== undefined && (typeof rango_min !== 'number' || isNaN(rango_min))) {
      return res.status(400).json({ ok: false, msg: "rango_min debe ser un número válido" });
    }

    if (rango_max !== undefined && (typeof rango_max !== 'number' || isNaN(rango_max))) {
      return res.status(400).json({ ok: false, msg: "rango_max debe ser un número válido" });
    }

    if (rango_min !== undefined && rango_max !== undefined && rango_min >= rango_max) {
      return res.status(400).json({ ok: false, msg: "rango_min debe ser menor que rango_max" });
    }

    if (ubicacionId !== undefined && ubicacionId !== null && (isNaN(Number(ubicacionId)) || Number(ubicacionId) <= 0)) {
      return res.status(400).json({ ok: false, msg: "ubicacionId debe ser un número positivo" });
    }

    const scopeCheck = await ensureHouseScope(req, Number(deviceId));
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    const locationCheck = await validateLocationForDevice(
      ubicacionId ? Number(ubicacionId) : null,
      scopeCheck.device
    );
    if (!locationCheck.ok) return res.status(locationCheck.status).json({ ok: false, msg: locationCheck.msg });

    logger.info("Creando nuevo sensor", {
      deviceId,
      tipo,
      modelo: modelo?.trim(),
      unidad: unidad?.trim(),
      rango_min,
      rango_max,
      ubicacionId,
      userId: req.user?.id
    });

    const sensor = await Sensor.create({
      device_id: Number(deviceId),
      tipo,
      modelo: modelo ? modelo.trim() : null,
      unidad: unidad ? unidad.trim() : null,
      rango_min: rango_min !== undefined ? Number(rango_min) : null,
      rango_max: rango_max !== undefined ? Number(rango_max) : null,
      ubicacion_id: ubicacionId ? Number(ubicacionId) : null,
      activo: true
    });

    await recordAudit({
      user: req.user,
      entidad: "Sensor",
      entidadId: sensor.id,
      accion: "crear_sensor",
      detalle: { deviceId, tipo, modelo: sensor.modelo, unidad: sensor.unidad },
      req
    });

    logger.info("Sensor creado exitosamente", {
      sensorId: sensor.id,
      deviceId,
      tipo
    });

    return res.status(201).json({ ok: true, sensor });
  } catch (error) {
    logger.error("Error creando sensor", {
      error: error.message,
      deviceId: req.body?.deviceId,
      tipo: req.body?.tipo,
      userId: req.user?.id
    });
    return next(error);
  }
};

const updateSensor = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos" });
    }

    const sensorId = Number(req.params.id);
    if (isNaN(sensorId) || sensorId <= 0) {
      return res.status(400).json({ ok: false, msg: "ID de sensor inválido" });
    }

    const sensor = await Sensor.findByPk(sensorId);
    if (!sensor) return res.status(404).json({ ok: false, msg: "Sensor no encontrado" });

    const scopeCheck = await ensureHouseScope(req, sensor.device_id);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    const { tipo, modelo, unidad, rango_min, rango_max, ubicacionId, activo } = req.body;

    // Validaciones de entrada
    if (tipo !== undefined && !VALID_TIPOS.includes(tipo)) {
      return res.status(400).json({
        ok: false,
        msg: `tipo debe ser uno de: ${VALID_TIPOS.join(', ')}`
      });
    }

    if (modelo !== undefined && (typeof modelo !== 'string' || modelo.length > MAX_MODELO_LENGTH)) {
      return res.status(400).json({
        ok: false,
        msg: `modelo debe ser una cadena y máximo ${MAX_MODELO_LENGTH} caracteres`
      });
    }

    if (unidad !== undefined && (typeof unidad !== 'string' || unidad.length > MAX_UNIDAD_LENGTH)) {
      return res.status(400).json({
        ok: false,
        msg: `unidad debe ser una cadena y máximo ${MAX_UNIDAD_LENGTH} caracteres`
      });
    }

    if (rango_min !== undefined && (typeof rango_min !== 'number' || isNaN(rango_min))) {
      return res.status(400).json({ ok: false, msg: "rango_min debe ser un número válido" });
    }

    if (rango_max !== undefined && (typeof rango_max !== 'number' || isNaN(rango_max))) {
      return res.status(400).json({ ok: false, msg: "rango_max debe ser un número válido" });
    }

    if (rango_min !== undefined && rango_max !== undefined && rango_min >= rango_max) {
      return res.status(400).json({ ok: false, msg: "rango_min debe ser menor que rango_max" });
    }

    if (ubicacionId !== undefined && ubicacionId !== null && (isNaN(Number(ubicacionId)) || Number(ubicacionId) <= 0)) {
      return res.status(400).json({ ok: false, msg: "ubicacionId debe ser un número positivo" });
    }

    if (activo !== undefined && typeof activo !== 'boolean') {
      return res.status(400).json({ ok: false, msg: "activo debe ser un valor booleano" });
    }

    const locationCheck = await validateLocationForDevice(
      ubicacionId !== undefined ? (ubicacionId ? Number(ubicacionId) : null) : sensor.ubicacion_id,
      scopeCheck.device
    );
    if (!locationCheck.ok) return res.status(locationCheck.status).json({ ok: false, msg: locationCheck.msg });

    const oldValues = {
      tipo: sensor.tipo,
      modelo: sensor.modelo,
      unidad: sensor.unidad,
      rango_min: sensor.rango_min,
      rango_max: sensor.rango_max,
      ubicacion_id: sensor.ubicacion_id,
      activo: sensor.activo
    };

    const patch = {};
    if (tipo !== undefined) patch.tipo = tipo;
    if (modelo !== undefined) patch.modelo = modelo ? modelo.trim() : null;
    if (unidad !== undefined) patch.unidad = unidad ? unidad.trim() : null;
    if (rango_min !== undefined) patch.rango_min = Number(rango_min);
    if (rango_max !== undefined) patch.rango_max = Number(rango_max);
    if (ubicacionId !== undefined) patch.ubicacion_id = ubicacionId ? Number(ubicacionId) : null;
    if (activo !== undefined) patch.activo = activo;

    await sensor.update(patch);

    await recordAudit({
      user: req.user,
      entidad: "Sensor",
      entidadId: sensor.id,
      accion: "actualizar_sensor",
      detalle: { oldValues, newValues: patch },
      req
    });

    logger.info("Sensor actualizado exitosamente", {
      sensorId: sensor.id,
      deviceId: sensor.device_id,
      changes: Object.keys(patch)
    });

    return res.json({ ok: true, sensor });
  } catch (error) {
    logger.error("Error actualizando sensor", {
      error: error.message,
      sensorId: req.params?.id,
      userId: req.user?.id
    });
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
