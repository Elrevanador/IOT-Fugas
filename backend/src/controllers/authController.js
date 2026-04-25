const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { House, User } = require("../models");
const { getJwtSecret } = require("../config/env");
const { normalizeRole } = require("../middlewares/authorize");

const register = async (req, res, next) => {
  try {
    const { nombre, email, password } = req.body;
    const exists = await User.findOne({ where: { email } });
    if (exists) {
      return res.status(409).json({ ok: false, msg: "Email ya registrado" });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const role = normalizeRole("resident");
    const user = await User.create({ nombre, email, password_hash, house_id: null, role });
    return res.status(201).json({
      ok: true,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        role: user.role,
        house: null
      }
    });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      where: { email },
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }]
    });
    if (!user) {
      return res.status(401).json({ ok: false, msg: "Credenciales invalidas" });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, msg: "Credenciales invalidas" });
    }
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        role: user.role,
        houseId: user.house_id || null
      },
      getJwtSecret(),
      {
        expiresIn: "12h"
      }
    );
    return res.json({ ok: true, token });
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }]
    });

    if (!user) {
      return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        role: user.role,
        house: user.House
          ? {
              id: user.House.id,
              name: user.House.name,
              code: user.House.code,
              status: user.House.status
            }
          : null
      }
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { register, login, me };
