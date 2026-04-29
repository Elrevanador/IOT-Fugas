const { Device, House, User } = require("../models");
const { getUserHouseScope, isAdmin } = require("../middlewares/authorize");
const { createScopeFilter } = require("../middlewares/scopeFilter");
const { recordAudit } = require("../services/audit");
const logger = require("../utils/logger");

// Constantes de validación
const VALID_STATUSES = ["ACTIVA", "INACTIVA", "SUSPENDIDA"];
const MAX_NAME_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 255;
const MAX_OWNER_NAME_LENGTH = 100;
const MAX_CONTACT_PHONE_LENGTH = 20;
const MAX_CODE_LENGTH = 30;

const normalizeCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");

const buildHouseCodeBase = (name) => {
  const normalized = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return normalized || "CASA";
};

const generateHouseCode = async (name) => {
  const base = buildHouseCodeBase(name);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const candidate = `${base}-${suffix}`;
    const exists = await House.findOne({ where: { code: candidate }, attributes: ["id"] });
    if (!exists) {
      return candidate;
    }
  }

  throw new Error("No se pudo generar un codigo unico para la casa");
};

const listHouses = async (req, res, next) => {
  try {
    const where = {};
    // Aplicar scope de casa usando el middleware centralizado
    req.scopeFilter.applyToWhere(where);

    const houses = await House.findAll({
      where,
      limit: 50, // Límite por defecto para evitar cargar todas las casas
      include: [
        { model: Device, attributes: ["id", "name", "status"], required: false },
        { model: User, attributes: ["id", "nombre", "email"], required: false }
      ],
      order: [["id", "ASC"]]
    });
    return res.json({ ok: true, houses });
  } catch (error) {
    return next(error);
  }
};

const getHouse = async (req, res, next) => {
  try {
    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId && Number(req.params.id) !== scopedHouseId) {
      return res.status(403).json({ ok: false, msg: "No tienes acceso a esta casa" });
    }

    const house = await House.findByPk(req.params.id, {
      include: [
        { model: Device, attributes: ["id", "name", "location", "status"], required: false },
        { model: User, attributes: ["id", "nombre", "email"], required: false }
      ]
    });

    if (!house) {
      return res.status(404).json({ ok: false, msg: "Casa no encontrada" });
    }

    return res.json({ ok: true, house });
  } catch (error) {
    return next(error);
  }
};

const createHouse = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo un admin puede crear casas" });
    }

    const { name, address, owner_name, contact_phone, status } = req.body;

    // Validaciones de entrada críticas
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ ok: false, msg: "name requerido y debe ser una cadena no vacía" });
    }

    if (name.length > MAX_NAME_LENGTH) {
      return res.status(400).json({
        ok: false,
        msg: `name demasiado largo (máximo ${MAX_NAME_LENGTH} caracteres)`
      });
    }

    if (address && (typeof address !== 'string' || address.length > MAX_ADDRESS_LENGTH)) {
      return res.status(400).json({
        ok: false,
        msg: `address debe ser una cadena y máximo ${MAX_ADDRESS_LENGTH} caracteres`
      });
    }

    if (owner_name && (typeof owner_name !== 'string' || owner_name.length > MAX_OWNER_NAME_LENGTH)) {
      return res.status(400).json({
        ok: false,
        msg: `owner_name debe ser una cadena y máximo ${MAX_OWNER_NAME_LENGTH} caracteres`
      });
    }

    if (contact_phone && (typeof contact_phone !== 'string' || contact_phone.length > MAX_CONTACT_PHONE_LENGTH)) {
      return res.status(400).json({
        ok: false,
        msg: `contact_phone debe ser una cadena y máximo ${MAX_CONTACT_PHONE_LENGTH} caracteres`
      });
    }

    if (status && !VALID_STATUSES.includes(status.toUpperCase())) {
      return res.status(400).json({
        ok: false,
        msg: `status debe ser uno de: ${VALID_STATUSES.join(', ')}`
      });
    }

    logger.info("Creando nueva casa", {
      name: name.trim(),
      address: address?.trim(),
      owner_name: owner_name?.trim(),
      userId: req.user?.id
    });

    const payload = {
      name: name.trim(),
      code: await generateHouseCode(name),
      address: address ? address.trim() : null,
      owner_name: owner_name ? owner_name.trim() : null,
      contact_phone: contact_phone ? contact_phone.trim() : null,
      status: status ? status.trim().toUpperCase() : "ACTIVA"
    };

    const house = await House.create(payload);

    await recordAudit({
      user: req.user,
      entidad: "House",
      entidadId: house.id,
      accion: "crear_casa",
      detalle: {
        name: house.name,
        code: house.code,
        status: house.status
      },
      req
    });

    logger.info("Casa creada exitosamente", {
      houseId: house.id,
      code: house.code,
      name: house.name
    });

    return res.status(201).json({ ok: true, house });
  } catch (error) {
    logger.error("Error creando casa", {
      error: error.message,
      name: req.body?.name,
      userId: req.user?.id
    });
    return next(error);
  }
};

const updateHouse = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo un admin puede editar casas" });
    }

    const houseId = Number(req.params.id);
    if (isNaN(houseId) || houseId <= 0) {
      return res.status(400).json({ ok: false, msg: "ID de casa inválido" });
    }

    const house = await House.findByPk(houseId);
    if (!house) {
      return res.status(404).json({ ok: false, msg: "Casa no encontrada" });
    }

    const { name, code, address, owner_name, contact_phone, status } = req.body;

    // Validaciones de entrada
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ ok: false, msg: "name debe ser una cadena no vacía" });
      }
      if (name.length > MAX_NAME_LENGTH) {
        return res.status(400).json({
          ok: false,
          msg: `name demasiado largo (máximo ${MAX_NAME_LENGTH} caracteres)`
        });
      }
    }

    if (code !== undefined) {
      if (typeof code !== 'string' || code.trim().length === 0) {
        return res.status(400).json({ ok: false, msg: "code debe ser una cadena no vacía" });
      }
      if (code.length > MAX_CODE_LENGTH) {
        return res.status(400).json({
          ok: false,
          msg: `code demasiado largo (máximo ${MAX_CODE_LENGTH} caracteres)`
        });
      }
    }

    if (address !== undefined && address !== null) {
      if (typeof address !== 'string' || address.length > MAX_ADDRESS_LENGTH) {
        return res.status(400).json({
          ok: false,
          msg: `address debe ser una cadena y máximo ${MAX_ADDRESS_LENGTH} caracteres`
        });
      }
    }

    if (owner_name !== undefined && owner_name !== null) {
      if (typeof owner_name !== 'string' || owner_name.length > MAX_OWNER_NAME_LENGTH) {
        return res.status(400).json({
          ok: false,
          msg: `owner_name debe ser una cadena y máximo ${MAX_OWNER_NAME_LENGTH} caracteres`
        });
      }
    }

    if (contact_phone !== undefined && contact_phone !== null) {
      if (typeof contact_phone !== 'string' || contact_phone.length > MAX_CONTACT_PHONE_LENGTH) {
        return res.status(400).json({
          ok: false,
          msg: `contact_phone debe ser una cadena y máximo ${MAX_CONTACT_PHONE_LENGTH} caracteres`
        });
      }
    }

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status.toUpperCase())) {
        return res.status(400).json({
          ok: false,
          msg: `status debe ser uno de: ${VALID_STATUSES.join(', ')}`
        });
      }
    }

    const nextCode = code !== undefined ? normalizeCode(code) : house.code;
    if (nextCode !== house.code) {
      const duplicate = await House.findOne({ where: { code: nextCode } });
      if (duplicate) {
        return res.status(409).json({ ok: false, msg: "El código de la casa ya existe" });
      }
    }

    const oldValues = {
      name: house.name,
      code: house.code,
      address: house.address,
      owner_name: house.owner_name,
      contact_phone: house.contact_phone,
      status: house.status
    };

    await house.update({
      name: name !== undefined ? name.trim() : house.name,
      code: nextCode,
      address: address !== undefined ? (address ? address.trim() : null) : house.address,
      owner_name: owner_name !== undefined ? (owner_name ? owner_name.trim() : null) : house.owner_name,
      contact_phone: contact_phone !== undefined ? (contact_phone ? contact_phone.trim() : null) : house.contact_phone,
      status: status !== undefined ? status.trim().toUpperCase() : house.status
    });

    await recordAudit({
      user: req.user,
      entidad: "House",
      entidadId: house.id,
      accion: "actualizar_casa",
      detalle: {
        oldValues,
        newValues: {
          name: house.name,
          code: house.code,
          address: house.address,
          owner_name: house.owner_name,
          contact_phone: house.contact_phone,
          status: house.status
        }
      },
      req
    });

    logger.info("Casa actualizada exitosamente", {
      houseId: house.id,
      code: house.code,
      changes: Object.keys(req.body)
    });

    return res.json({ ok: true, house });
  } catch (error) {
    logger.error("Error actualizando casa", {
      error: error.message,
      houseId: req.params?.id,
      userId: req.user?.id
    });
    return next(error);
  }
};

const deleteHouse = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo un admin puede eliminar casas" });
    }

    const house = await House.findByPk(req.params.id, {
      include: [
        { model: Device, attributes: ["id"], required: false },
        { model: User, attributes: ["id"], required: false }
      ]
    });

    if (!house) {
      return res.status(404).json({ ok: false, msg: "Casa no encontrada" });
    }

    if (house.Devices?.length) {
      return res.status(409).json({
        ok: false,
        msg: "No se puede eliminar la casa mientras tenga dispositivos asociados"
      });
    }

    if (house.Users?.length) {
      return res.status(409).json({
        ok: false,
        msg: "No se puede eliminar la casa mientras tenga usuarios asociados"
      });
    }

    await house.destroy();
    return res.json({ ok: true, msg: "Casa eliminada" });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listHouses,
  getHouse,
  createHouse,
  updateHouse,
  deleteHouse,
  normalizeCode,
  generateHouseCode
};
