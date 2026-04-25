const { Device, House, User } = require("../models");
const { getUserHouseScope, isAdmin } = require("../middlewares/authorize");

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
    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId) {
      where.id = scopedHouseId;
    }

    const houses = await House.findAll({
      where,
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

    const payload = {
      name: String(req.body.name || "").trim(),
      code: await generateHouseCode(req.body.name),
      address: String(req.body.address || "").trim(),
      owner_name: String(req.body.owner_name || "").trim(),
      contact_phone: String(req.body.contact_phone || "").trim(),
      status: req.body.status ? String(req.body.status).trim().toUpperCase() : "ACTIVA"
    };

    const house = await House.create(payload);
    return res.status(201).json({ ok: true, house });
  } catch (error) {
    return next(error);
  }
};

const updateHouse = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo un admin puede editar casas" });
    }

    const house = await House.findByPk(req.params.id);
    if (!house) {
      return res.status(404).json({ ok: false, msg: "Casa no encontrada" });
    }

    const nextCode = normalizeCode(req.body.code || house.code);
    if (nextCode !== house.code) {
      const duplicate = await House.findOne({ where: { code: nextCode } });
      if (duplicate) {
        return res.status(409).json({ ok: false, msg: "El codigo de la casa ya existe" });
      }
    }

    await house.update({
      name: req.body.name !== undefined ? String(req.body.name).trim() : house.name,
      code: nextCode,
      address: req.body.address !== undefined ? String(req.body.address || "").trim() || null : house.address,
      owner_name:
        req.body.owner_name !== undefined
          ? String(req.body.owner_name || "").trim() || null
          : house.owner_name,
      contact_phone:
        req.body.contact_phone !== undefined
          ? String(req.body.contact_phone || "").trim() || null
          : house.contact_phone,
      status: req.body.status !== undefined ? String(req.body.status).trim().toUpperCase() : house.status
    });

    return res.json({ ok: true, house });
  } catch (error) {
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
