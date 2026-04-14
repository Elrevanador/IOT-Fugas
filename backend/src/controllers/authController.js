const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { getJwtSecret } = require("../config/env");

const register = async (req, res, next) => {
  try {
    const { nombre, email, password } = req.body;
    const exists = await User.findOne({ where: { email } });
    if (exists) {
      return res.status(409).json({ ok: false, msg: "Email ya registrado" });
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const user = await User.create({ nombre, email, password_hash });
    return res.status(201).json({ ok: true, id: user.id, nombre, email });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ ok: false, msg: "Credenciales invalidas" });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, msg: "Credenciales invalidas" });
    }
    const token = jwt.sign({ id: user.id, email: user.email, nombre: user.nombre }, getJwtSecret(), {
      expiresIn: "12h"
    });
    return res.json({ ok: true, token });
  } catch (error) {
    return next(error);
  }
};

module.exports = { register, login };
