const bcrypt = require("bcryptjs");
const { House, User } = require("../models");
const { isAdmin, normalizeRole } = require("../middlewares/authorize");

const listUsers = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo un admin puede ver usuarios" });
    }

    const users = await User.findAll({
      attributes: ["id", "nombre", "email", "role", "house_id", "created_at"],
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }],
      order: [["id", "ASC"]]
    });

    return res.json({ ok: true, users });
  } catch (error) {
    return next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo un admin puede crear usuarios" });
    }

    const { nombre, email, password, houseId } = req.body;
    const role = normalizeRole(req.body.role || "resident");

    const exists = await User.findOne({ where: { email } });
    if (exists) {
      return res.status(409).json({ ok: false, msg: "Email ya registrado" });
    }

    let house = null;
    if (houseId !== undefined && houseId !== null) {
      house = await House.findByPk(houseId);
      if (!house) {
        return res.status(404).json({ ok: false, msg: "Casa no encontrada" });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const user = await User.create({
      nombre: String(nombre || "").trim(),
      email: String(email || "").trim(),
      password_hash,
      house_id: house?.id || null,
      role
    });

    const created = await User.findByPk(user.id, {
      attributes: ["id", "nombre", "email", "role", "house_id", "created_at"],
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }]
    });

    return res.status(201).json({ ok: true, user: created });
  } catch (error) {
    return next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo un admin puede editar usuarios" });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    }

    const { nombre, email, password, houseId } = req.body;
    const role = normalizeRole(req.body.role || user.role);

    if (email.trim() !== user.email) {
      const duplicate = await User.findOne({ where: { email } });
      if (duplicate) {
        return res.status(409).json({ ok: false, msg: "Email ya registrado" });
      }
    }

    let house = null;
    if (houseId !== undefined && houseId !== null) {
      house = await House.findByPk(houseId);
      if (!house) {
        return res.status(404).json({ ok: false, msg: "Casa no encontrada" });
      }
    }

    const payload = {
      nombre: String(nombre || "").trim(),
      email: String(email || "").trim(),
      house_id: house?.id || null,
      role
    };

    if (password) {
      const salt = await bcrypt.genSalt(10);
      payload.password_hash = await bcrypt.hash(password, salt);
    }

    await user.update(payload);

    const updated = await User.findByPk(user.id, {
      attributes: ["id", "nombre", "email", "role", "house_id", "created_at"],
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }]
    });

    return res.json({ ok: true, user: updated });
  } catch (error) {
    return next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo un admin puede eliminar usuarios" });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    }

    if (Number(user.id) === Number(req.user.id)) {
      return res.status(409).json({ ok: false, msg: "No puedes eliminar tu propio usuario desde el panel" });
    }

    await user.destroy();
    return res.json({ ok: true, msg: "Usuario eliminado" });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listUsers, createUser, updateUser, deleteUser };
