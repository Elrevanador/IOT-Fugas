const { Op } = require("sequelize");
const { Device, House } = require("../models");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { createScopeFilter } = require("../middlewares/scopeFilter");
const {
  createDeviceApiKey,
  createDeviceApiKeyHint,
  hashDeviceApiKey
} = require("../services/deviceCredentials");
const { recordAudit } = require("../services/audit");
const logger = require("../utils/logger");

// Validaciones de seguridad para dispositivos
const DEVICE_NAME_REGEX = /^[a-zA-Z0-9\-_\s]+$/;
const HARDWARE_UID_REGEX = /^[A-Z0-9\-_]+$/;
const MAX_DEVICES_PER_HOUSE = 100;

const serializeDevice = (device) => {
  if (!device) return null;
  const payload = typeof device.toJSON === "function" ? device.toJSON() : { ...device };
  const { api_key_hash, api_key_hint, ...rest } = payload;
  return {
    ...rest,
    hasCustomApiKey: Boolean(api_key_hash),
    apiKeyHint: api_key_hint || null
  };
};

const createDevice = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para crear dispositivos" });
    }

    const payload = {
      name: String(req.body.name || "").trim(),
      location: String(req.body.location || "").trim(),
      device_type: req.body.deviceType ? String(req.body.deviceType).trim() : null,
      firmware_version: req.body.firmwareVersion ? String(req.body.firmwareVersion).trim() : null,
      hardware_uid: req.body.hardwareUid ? String(req.body.hardwareUid).trim() : null,
      status: req.body.status ? String(req.body.status).trim().toUpperCase() : "ACTIVO",
      house_id: req.body.houseId ? Number(req.body.houseId) : null
    };

    // Validaciones de seguridad
    if (!DEVICE_NAME_REGEX.test(payload.name)) {
      return res.status(400).json({ ok: false, msg: "Nombre del dispositivo contiene caracteres inválidos" });
    }

    if (payload.hardware_uid && !HARDWARE_UID_REGEX.test(payload.hardware_uid)) {
      return res.status(400).json({ ok: false, msg: "Hardware UID contiene caracteres inválidos" });
    }

    if (payload.name.length < 3 || payload.name.length > 120) {
      return res.status(400).json({ ok: false, msg: "Nombre del dispositivo debe tener entre 3 y 120 caracteres" });
    }

    if (payload.location.length < 3 || payload.location.length > 255) {
      return res.status(400).json({ ok: false, msg: "Ubicación debe tener entre 3 y 255 caracteres" });
    }

    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId) {
      payload.house_id = scopedHouseId;
    }

    if (payload.house_id) {
      const house = await House.findByPk(payload.house_id);
      if (!house) {
        return res.status(404).json({ ok: false, msg: "Casa no encontrada" });
      }

      // Verificar límite de dispositivos por casa
      const deviceCount = await Device.count({ where: { house_id: payload.house_id } });
      if (deviceCount >= MAX_DEVICES_PER_HOUSE) {
        return res.status(400).json({
          ok: false,
          msg: `La casa ya tiene el máximo de ${MAX_DEVICES_PER_HOUSE} dispositivos permitidos`
        });
      }
    }

    // Verificar duplicados
    const existingDevice = await Device.findOne({
      where: {
        [Op.or]: [
          { name: payload.name },
          ...(payload.hardware_uid ? [{ hardware_uid: payload.hardware_uid }] : [])
        ]
      }
    });

    if (existingDevice) {
      const field = existingDevice.name === payload.name ? "nombre" : "hardware UID";
      return res.status(409).json({ ok: false, msg: `Ya existe un dispositivo con este ${field}` });
    }

    const device = await Device.create(payload);
    const created = await Device.findByPk(device.id, {
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }]
    });

    // Registrar auditoría
    await recordAudit({
      user: req.user,
      entidad: "Device",
      entidadId: device.id,
      accion: "crear_dispositivo",
      detalle: {
        name: device.name,
        house_id: device.house_id,
        device_type: device.device_type
      },
      req
    });

    logger.info("Dispositivo creado exitosamente", {
      deviceId: device.id,
      name: device.name,
      userId: req.user.id
    });

    return res.status(201).json({ ok: true, device: serializeDevice(created) });
  } catch (error) {
    logger.error("Error creando dispositivo", {
      error: error.message,
      userId: req.user?.id,
      deviceName: req.body?.name
    });
    return next(error);
  }
};

const updateDevice = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para editar dispositivos" });
    }

    const device = await Device.findByPk(req.params.id);
    if (!device) {
      return res.status(404).json({ ok: false, msg: "Dispositivo no encontrado" });
    }

    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId && device.house_id !== scopedHouseId) {
      return res.status(403).json({ ok: false, msg: "No tienes acceso a este dispositivo" });
    }

    const hasHouseId = req.body.houseId !== undefined && req.body.houseId !== null && req.body.houseId !== "";
    const nextHouseId = scopedHouseId || (hasHouseId ? Number(req.body.houseId) : device.house_id);
    const house = nextHouseId ? await House.findByPk(nextHouseId) : null;
    if (nextHouseId && !house) {
      return res.status(404).json({ ok: false, msg: "Casa no encontrada" });
    }

    const nextName = String(req.body.name || "").trim();
    if (nextName !== device.name) {
      const duplicate = await Device.findOne({ where: { name: nextName } });
      if (duplicate) {
        return res.status(409).json({ ok: false, msg: "El nombre del dispositivo ya existe" });
      }
    }

    const nextHardwareUid = req.body.hardwareUid ? String(req.body.hardwareUid).trim() : null;
    if (nextHardwareUid !== (device.hardware_uid || null) && nextHardwareUid) {
      const duplicateHardware = await Device.findOne({ where: { hardware_uid: nextHardwareUid } });
      if (duplicateHardware && Number(duplicateHardware.id) !== Number(device.id)) {
        return res.status(409).json({ ok: false, msg: "El hardwareUid del dispositivo ya existe" });
      }
    }

    await device.update({
      name: nextName,
      location: String(req.body.location || "").trim(),
      device_type: req.body.deviceType ? String(req.body.deviceType).trim() : null,
      firmware_version: req.body.firmwareVersion ? String(req.body.firmwareVersion).trim() : null,
      hardware_uid: nextHardwareUid,
      status: String(req.body.status || "").trim().toUpperCase(),
      house_id: house?.id || null
    });

    const updated = await Device.findByPk(device.id, {
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }]
    });
    return res.json({ ok: true, device: serializeDevice(updated) });
  } catch (error) {
    return next(error);
  }
};

const deleteDevice = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para eliminar dispositivos" });
    }

    const device = await Device.findByPk(req.params.id);
    if (!device) {
      return res.status(404).json({ ok: false, msg: "Dispositivo no encontrado" });
    }

    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId && device.house_id !== scopedHouseId) {
      return res.status(403).json({ ok: false, msg: "No tienes acceso a este dispositivo" });
    }

    await device.destroy();
    return res.json({ ok: true, msg: "Dispositivo eliminado" });
  } catch (error) {
    return next(error);
  }
};

/**
 * Lista dispositivos con filtros opcionales
 *
 * @param {Object} req.query
 * @param {number} [req.query.houseId] - Filtrar por casa específica
 * @param {string} [req.query.status] - Filtrar por estado (ACTIVO, INACTIVO, MANTENIMIENTO)
 * @param {string} [req.query.deviceType] - Filtrar por tipo de dispositivo
 * @param {string} [req.query.search] - Búsqueda por nombre o ubicación
 * @param {number} [req.query.limit=50] - Límite de resultados (máx 200)
 * @param {number} [req.query.page] - Página para paginación
 *
 * @returns {Object} { ok: true, devices: [...], meta: {...} }
 */
const listDevices = async (req, res, next) => {
  try {
    const where = {};
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    // Aplicar scope de casa usando el middleware centralizado
    req.scopeFilter.applyToWhere(where, "houseId");

    if (req.query.status) {
      where.status = req.query.status;
    }

    if (req.query.deviceType) {
      where.device_type = String(req.query.deviceType).trim();
    }

    if (req.query.search) {
      const search = `%${String(req.query.search).trim()}%`;
      where[Op.or] = [{ name: { [Op.like]: search } }, { location: { [Op.like]: search } }];
    }

    const result = await Device.findAndCountAll({
      where,
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }],
      order: [["id", "ASC"]],
      limit,
      offset,
      distinct: true
    });
    return res.json({
      ok: true,
      devices: result.rows.map(serializeDevice),
      pagination: buildMeta(result.count)
    });
  } catch (error) {
    return next(error);
  }
};

const rotateDeviceCredential = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para regenerar credenciales" });
    }

    const device = await Device.findByPk(req.params.id, {
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }]
    });
    if (!device) {
      return res.status(404).json({ ok: false, msg: "Dispositivo no encontrado" });
    }

    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId && device.house_id !== scopedHouseId) {
      return res.status(403).json({ ok: false, msg: "No tienes acceso a este dispositivo" });
    }

    const apiKey = createDeviceApiKey();
    await device.update({
      api_key_hash: hashDeviceApiKey(apiKey),
      api_key_hint: createDeviceApiKeyHint(apiKey)
    });

    const updated = await Device.findByPk(device.id, {
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }]
    });

    return res.json({
      ok: true,
      device: serializeDevice(updated),
      generatedApiKey: apiKey
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { createDevice, updateDevice, deleteDevice, listDevices, rotateDeviceCredential, serializeDevice };
