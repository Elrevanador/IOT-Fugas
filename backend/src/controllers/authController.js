const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { House, User } = require("../models");
const { getJwtSecret } = require("../config/env");
const { normalizeRole } = require("../middlewares/authorize");
const { buildUserAccessProfile } = require("../services/accessControl");
const { recordAudit } = require("../services/audit");
const logger = require("../utils/logger");

// Configuración de seguridad
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MINUTES = 30;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]+$/;

const normalizeUsername = (value) => String(value || "").trim().toLowerCase();

const serializeAuthUser = (user, access, house = null) => ({
  id: user.id,
  nombre: user.nombre,
  apellido: user.apellido || "",
  username: user.username || "",
  email: user.email,
  role: user.role,
  estado: user.estado || "ACTIVO",
  houseId: user.house_id || null,
  roles: access.roles,
  permissions: access.permissions,
  ...(house !== undefined ? { house } : {})
});

const register = async (req, res, next) => {
  try {
    const { nombre, apellido, email, password } = req.body;
    const username = normalizeUsername(req.body.username);

    // Validar que no se pueda asignar casa en registro público
    if (req.body.houseId !== undefined && req.body.houseId !== null && req.body.houseId !== "") {
      return res.status(400).json({ ok: false, msg: "No puedes asignar una casa durante el registro público" });
    }

    // Validar fortaleza de contraseña
    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        ok: false,
        msg: "La contraseña debe tener al menos 8 caracteres, incluir mayúsculas, minúsculas, números y caracteres especiales"
      });
    }

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({
        ok: false,
        msg: "El username solo puede contener letras, numeros, punto, guion o guion bajo"
      });
    }

    // Verificar email existente
    const exists = await User.findOne({ where: { email: email.toLowerCase() } });
    if (exists) {
      return res.status(409).json({ ok: false, msg: "Email ya registrado" });
    }

    const usernameExists = await User.findOne({ where: { username } });
    if (usernameExists) {
      return res.status(409).json({ ok: false, msg: "Username ya registrado" });
    }

    // Crear hash de contraseña
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);
    const role = normalizeRole("resident");

    // Crear usuario
    const user = await User.create({
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      username,
      email: email.toLowerCase().trim(),
      password_hash,
      house_id: null,
      role,
      estado: "ACTIVO",
      email_verified: false,
      failed_login_attempts: 0,
      locked_until: null,
      password_changed_at: new Date()
    });

    // Registrar auditoría
    await recordAudit({
      user: { id: user.id, email: user.email },
      entidad: "User",
      entidadId: user.id,
      accion: "registro_usuario",
      detalle: { role: user.role },
      req
    });

    logger.info("Usuario registrado exitosamente", { userId: user.id, email: user.email });

    const access = await buildUserAccessProfile(user, { silent: true });

    return res.status(201).json({
      ok: true,
      user: serializeAuthUser(user, access, null)
    });
  } catch (error) {
    logger.error("Error en registro de usuario", { error: error.message, email: req.body.email });
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const identifier = String(email || "").toLowerCase().trim();

    // Buscar usuario
    let user = await User.findOne({
      where: { email: identifier },
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }]
    });
    if (!user && !identifier.includes("@")) {
      user = await User.findOne({
        where: { username: identifier },
        include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }]
      });
    }

    if (!user) {
      logger.warn("Intento de login con cuenta no registrada", { identifier, ip: req.ip });
      return res.status(401).json({ ok: false, msg: "Credenciales inválidas" });
    }

    if (user.estado === "INACTIVO") {
      return res.status(403).json({ ok: false, msg: "Usuario inactivo" });
    }

    if (user.estado === "BLOQUEADO") {
      return res.status(423).json({ ok: false, msg: "Usuario bloqueado" });
    }

    // Verificar si la cuenta está bloqueada
    if (user.locked_until && user.locked_until > new Date()) {
      const remainingMinutes = Math.ceil((user.locked_until - new Date()) / (1000 * 60));
      logger.warn("Intento de login en cuenta bloqueada", {
        userId: user.id,
        email: user.email,
        remainingMinutes
      });
      return res.status(423).json({
        ok: false,
        msg: `Cuenta bloqueada. Intenta de nuevo en ${remainingMinutes} minutos`
      });
    }

    // Verificar contraseña
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      // Incrementar contador de intentos fallidos
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      const updateData = { failed_login_attempts: newAttempts };

      // Bloquear cuenta si excede el límite
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        updateData.locked_until = new Date(Date.now() + LOCK_TIME_MINUTES * 60 * 1000);
        updateData.failed_login_attempts = 0; // Reset counter after lock
        logger.warn("Cuenta bloqueada por múltiples intentos fallidos", {
          userId: user.id,
          email: user.email,
          attempts: newAttempts
        });
      }

      await user.update(updateData);

      // Registrar auditoría de intento fallido
      await recordAudit({
        user: { id: user.id },
        entidad: "User",
        entidadId: user.id,
        accion: "login_fallido",
        detalle: { attempts: newAttempts, blocked: newAttempts >= MAX_LOGIN_ATTEMPTS },
        req
      });

      return res.status(401).json({ ok: false, msg: "Credenciales inválidas" });
    }

    // Login exitoso - resetear contador y actualizar último login
    await user.update({
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: new Date()
    });

    // Generar token JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username || null,
        nombre: user.nombre,
        role: user.role,
        houseId: user.house_id || null
      },
      getJwtSecret(),
      {
        expiresIn: "12h",
        issuer: "iot-backend",
        audience: "iot-clients"
      }
    );

    // Registrar auditoría de login exitoso
    await recordAudit({
      user: { id: user.id, email: user.email },
      entidad: "User",
      entidadId: user.id,
      accion: "login_exitoso",
      detalle: { role: user.role },
      req
    });

    logger.info("Login exitoso", { userId: user.id, email: user.email, role: user.role });

    const access = await buildUserAccessProfile(user, { silent: true });

    return res.json({
      ok: true,
      token,
      user: serializeAuthUser(user, access, undefined)
    });
  } catch (error) {
    logger.error("Error en login", { error: error.message, email: req.body.email });
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [{ model: House, attributes: ["id", "name", "code", "status"], required: false }]
    });

    if (!user) {
      logger.warn("Usuario no encontrado en endpoint /me", { userId: req.user.id });
      return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    }

    // Registrar auditoría de acceso al perfil
    await recordAudit({
      user: req.user,
      entidad: "User",
      entidadId: user.id,
      accion: "consulta_perfil",
      req
    });

    const access = await buildUserAccessProfile(user, { silent: true });

    return res.json({
      ok: true,
      user: {
        ...serializeAuthUser(user, access, undefined),
        house: user.House
          ? {
              id: user.House.id,
              name: user.House.name,
              code: user.House.code,
              status: user.House.status
            }
          : null,
        last_login_at: user.last_login_at,
        email_verified: user.email_verified
      }
    });
  } catch (error) {
    logger.error("Error en consulta de perfil", { error: error.message, userId: req.user?.id });
    return next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validar fortaleza de nueva contraseña
    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({
        ok: false,
        msg: "La nueva contraseña debe tener al menos 8 caracteres, incluir mayúsculas, minúsculas, números y caracteres especiales"
      });
    }

    // Verificar que no sea la misma contraseña
    const isSamePassword = await bcrypt.compare(newPassword, req.user.password_hash);
    if (isSamePassword) {
      return res.status(400).json({ ok: false, msg: "La nueva contraseña no puede ser igual a la actual" });
    }

    // Verificar contraseña actual
    const currentPasswordValid = await bcrypt.compare(currentPassword, req.user.password_hash);
    if (!currentPasswordValid) {
      logger.warn("Intento de cambio de contraseña con contraseña actual incorrecta", {
        userId: req.user.id,
        email: req.user.email
      });
      return res.status(401).json({ ok: false, msg: "Contraseña actual incorrecta" });
    }

    // Generar nuevo hash
    const salt = await bcrypt.genSalt(12);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Actualizar usuario
    const dbUser = await User.findByPk(req.user.id);
    if (!dbUser) {
      return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    }

    await dbUser.update({
      password_hash: newPasswordHash,
      failed_login_attempts: 0,
      locked_until: null,
      password_changed_at: new Date()
    });

    // Registrar auditoría
    await recordAudit({
      user: req.user,
      entidad: "User",
      entidadId: req.user.id,
      accion: "cambio_contraseña",
      detalle: { success: true },
      req
    });

    logger.info("Contraseña cambiada exitosamente", { userId: req.user.id, email: req.user.email });

    return res.json({ ok: true, msg: "Contraseña cambiada exitosamente" });
  } catch (error) {
    logger.error("Error en cambio de contraseña", {
      error: error.message,
      userId: req.user?.id
    });
    return next(error);
  }
};

module.exports = { register, login, me, changePassword };
