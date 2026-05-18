const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { sequelize, House, User, PasswordResetToken } = require("../models");
const { getJwtSecret } = require("../config/env");
const { normalizeRole } = require("../middlewares/authorize");
const { buildUserAccessProfile } = require("../services/accessControl");
const { recordAudit } = require("../services/audit");
const { sendPasswordResetEmail } = require("../services/passwordResetDelivery");
const logger = require("../utils/logger");

// Configuración de seguridad
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MINUTES = 30;
const PASSWORD_RESET_CODE_DIGITS = 6;
const PASSWORD_RESET_TTL_MINUTES = Number.parseInt(process.env.PASSWORD_RESET_TTL_MINUTES || "", 10) || 15;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const PASSWORD_RESET_PUBLIC_MESSAGE =
  "Si la cuenta existe, enviaremos instrucciones para recuperar la contraseña.";

const normalizeUsername = (value) => String(value || "").trim().toLowerCase();
const hashResetToken = (token) => crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
const generateResetCode = () =>
  String(crypto.randomInt(0, 10 ** PASSWORD_RESET_CODE_DIGITS)).padStart(PASSWORD_RESET_CODE_DIGITS, "0");
const hashResetCode = (userId, code) => hashResetToken(`password-reset-code:${userId}:${String(code || "").trim()}`);

const getRequestIp = (req) => {
  const ip =
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress ||
    null;
  return ip ? String(ip).slice(0, 45) : null;
};

const getUserAgent = (req) => {
  const userAgent = req.get ? req.get("user-agent") : req.headers?.["user-agent"];
  return userAgent ? String(userAgent).slice(0, 500) : null;
};

const shouldExposeResetToken = () =>
  process.env.NODE_ENV !== "production" || process.env.AUTH_EXPOSE_PASSWORD_RESET_TOKEN === "true";

const resolveFrontendBaseUrl = (req) => {
  const explicit = process.env.PASSWORD_RESET_BASE_URL || process.env.FRONTEND_URL;
  if (explicit) return String(explicit).trim().replace(/\/+$/, "");

  const configuredOrigins = String(process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (configuredOrigins.length) return configuredOrigins[0].replace(/\/+$/, "");

  const requestOrigin = req.get ? req.get("origin") : req.headers?.origin;
  if (requestOrigin) return String(requestOrigin).trim().replace(/\/+$/, "");

  return `${req.protocol || "http"}://${req.get ? req.get("host") : "localhost"}`;
};

const buildPasswordResetUrl = (req, { token = null, email = null } = {}) => {
  const url = new URL(token ? "/reset-password" : "/forgot-password", `${resolveFrontendBaseUrl(req)}/`);
  if (token) url.searchParams.set("token", token);
  if (email) url.searchParams.set("email", email);
  return url.toString();
};

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

const forgotPassword = async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const response = { ok: true, msg: PASSWORD_RESET_PUBLIC_MESSAGE };

    const user = await User.findOne({ where: { email } });
    if (!user || user.estado === "INACTIVO" || user.estado === "BLOQUEADO") {
      logger.warn("Solicitud de recuperacion para cuenta no elegible", { email, ip: getRequestIp(req) });
      return res.json(response);
    }

    const resetCode = generateResetCode();
    const tokenHash = hashResetCode(user.id, resetCode);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
    const resetUrl = buildPasswordResetUrl(req, { email: user.email });

    await sequelize.transaction(async (transaction) => {
      await PasswordResetToken.update(
        { used_at: new Date() },
        {
          where: {
            user_id: user.id,
            used_at: { [Op.is]: null }
          },
          transaction
        }
      );

      await PasswordResetToken.create(
        {
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          requested_ip: getRequestIp(req),
          requested_user_agent: getUserAgent(req)
        },
        { transaction }
      );

      await recordAudit({
        user: { id: user.id, email: user.email },
        entidad: "User",
        entidadId: user.id,
        accion: "solicitud_recuperacion_contraseña",
        detalle: { expiresAt },
        req,
        transaction
      });
    });

    const delivery = await sendPasswordResetEmail({
      user,
      resetUrl,
      code: resetCode,
      minutes: PASSWORD_RESET_TTL_MINUTES
    });

    logger.info("Token de recuperacion generado", {
      userId: user.id,
      email: user.email,
      expiresAt,
      delivery,
      resetUrl: shouldExposeResetToken() ? resetUrl : undefined,
      resetCode: shouldExposeResetToken() ? resetCode : undefined
    });

    if (shouldExposeResetToken()) {
      response.resetUrl = resetUrl;
      response.resetCode = resetCode;
      response.emailDelivered = Boolean(delivery.sent);
      if (!delivery.sent) {
        response.msg =
          "Código generado. El correo no está configurado en el servidor; usa el código mostrado abajo o configura el envío de correos.";
      }
    }

    return res.json(response);
  } catch (error) {
    logger.error("Error en solicitud de recuperacion de contraseña", {
      error: error.message,
      email: req.body.email
    });
    return next(error);
  }
};

const verifyResetCode = async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const code = String(req.body.code || "").trim();
    const invalidMessage = "El código de recuperación es inválido o expiró";

    const user = await User.findOne({ where: { email } });
    if (!user || user.estado === "INACTIVO" || user.estado === "BLOQUEADO") {
      return res.status(400).json({ ok: false, msg: invalidMessage });
    }

    const resetToken = await PasswordResetToken.findOne({
      where: {
        user_id: user.id,
        token_hash: hashResetCode(user.id, code),
        used_at: { [Op.is]: null },
        expires_at: { [Op.gt]: new Date() }
      }
    });

    if (!resetToken) {
      return res.status(400).json({ ok: false, msg: invalidMessage });
    }

    await recordAudit({
      user: { id: user.id, email: user.email },
      entidad: "User",
      entidadId: user.id,
      accion: "validacion_codigo_recuperacion",
      detalle: { success: true },
      req
    });

    return res.json({ ok: true, msg: "Código validado correctamente" });
  } catch (error) {
    logger.error("Error validando codigo de recuperacion", { error: error.message });
    return next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const token = String(req.body.token || "").trim();
    const code = String(req.body.code || "").trim();
    const email = String(req.body.email || "").toLowerCase().trim();
    const { password } = req.body;

    const isCodeFlow = Boolean(code && email);
    const invalidResetMessage = isCodeFlow
      ? "El código de recuperación es inválido o expiró"
      : "El enlace de recuperación es inválido o expiró";

    if (!token && !isCodeFlow) {
      return res.status(400).json({ ok: false, msg: "Código o token de recuperación requerido" });
    }

    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        ok: false,
        msg: "La contraseña debe tener al menos 8 caracteres, incluir mayúsculas, minúsculas, números y caracteres especiales"
      });
    }

    const now = new Date();

    const result = await sequelize.transaction(async (transaction) => {
      let user = null;
      let resetToken = null;

      if (isCodeFlow) {
        user = await User.findOne({ where: { email }, transaction });
        if (!user || user.estado === "INACTIVO" || user.estado === "BLOQUEADO") {
          return { status: 400, body: { ok: false, msg: invalidResetMessage } };
        }

        resetToken = await PasswordResetToken.findOne({
          where: {
            user_id: user.id,
            token_hash: hashResetCode(user.id, code),
            used_at: { [Op.is]: null },
            expires_at: { [Op.gt]: now }
          },
          transaction
        });
      } else {
        resetToken = await PasswordResetToken.findOne({
          where: {
            token_hash: hashResetToken(token),
            used_at: { [Op.is]: null },
            expires_at: { [Op.gt]: now }
          },
          transaction
        });

        if (resetToken) {
          user = await User.findByPk(resetToken.user_id, { transaction });
        }
      }

      if (!resetToken) {
        return { status: 400, body: { ok: false, msg: invalidResetMessage } };
      }

      if (!user || user.estado === "INACTIVO" || user.estado === "BLOQUEADO") {
        return { status: 400, body: { ok: false, msg: invalidResetMessage } };
      }

      const isSamePassword = await bcrypt.compare(password, user.password_hash);
      if (isSamePassword) {
        return { status: 400, body: { ok: false, msg: "La nueva contraseña no puede ser igual a la anterior" } };
      }

      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      await user.update(
        {
          password_hash: passwordHash,
          failed_login_attempts: 0,
          locked_until: null,
          password_changed_at: now
        },
        { transaction }
      );

      await resetToken.update({ used_at: now }, { transaction });
      await PasswordResetToken.update(
        { used_at: now },
        {
          where: {
            user_id: user.id,
            id: { [Op.ne]: resetToken.id },
            used_at: { [Op.is]: null }
          },
          transaction
        }
      );

      await recordAudit({
        user: { id: user.id, email: user.email },
        entidad: "User",
        entidadId: user.id,
        accion: "recuperacion_contraseña",
        detalle: { success: true, method: isCodeFlow ? "email_code" : "reset_link" },
        req,
        transaction
      });

      logger.info("Contraseña recuperada exitosamente", { userId: user.id, email: user.email });
      return { status: 200, body: { ok: true, msg: "Contraseña actualizada correctamente" } };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error("Error en recuperacion de contraseña", { error: error.message });
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

const checkEmail = async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();

    const user = await User.findOne({ where: { email } });
    const exists = user && (user.estado === "ACTIVO" || user.estado === "PENDIENTE");

    return res.json({
      ok: true,
      exists,
      msg: exists ? "El correo está registrado" : "El correo no está registrado"
    });
  } catch (error) {
    logger.error("Error verificando email", {
      error: error.message,
      email: req.body.email
    });
    return next(error);
  }
};

module.exports = { register, login, forgotPassword, verifyResetCode, resetPassword, me, changePassword, checkEmail };
