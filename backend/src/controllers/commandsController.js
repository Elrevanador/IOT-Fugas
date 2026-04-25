const { Op } = require("sequelize");
const { ComandoRemoto, RespuestaComando, Device, House, Electrovalvula, AccionValvula } = require("../models");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { recordAudit } = require("../services/audit");

const VALID_TYPES = [
  "CERRAR_VALVULA",
  "ABRIR_VALVULA",
  "ACTUALIZAR_CONFIG",
  "REINICIAR",
  "SOLICITAR_ESTADO",
  "OTRO"
];
const VALID_PRIORITIES = ["BAJA", "NORMAL", "ALTA", "CRITICA"];

const ensureHouseScope = async (req, deviceId) => {
  const device = await Device.findByPk(deviceId, { attributes: ["id", "name", "house_id"] });
  if (!device) return { ok: false, status: 404, msg: "Dispositivo no encontrado" };

  const scopedHouseId = getUserHouseScope(req.user);
  if (!scopedHouseId) return { ok: true, device };
  if (device.house_id !== scopedHouseId) {
    return { ok: false, status: 403, msg: "No tienes acceso a este dispositivo" };
  }
  return { ok: true, device };
};

const resolveDeviceFromRequest = async (req) => {
  if (req.authenticatedDevice) return req.authenticatedDevice;

  const rawDeviceId = req.params.deviceId || req.query.deviceId || req.body?.deviceId;
  if (rawDeviceId) {
    return Device.findByPk(Number(rawDeviceId), { attributes: ["id", "name", "house_id"] });
  }

  const rawDeviceName = req.query.deviceName || req.body?.deviceName;
  if (rawDeviceName) {
    return Device.findOne({
      where: { name: String(rawDeviceName).trim() },
      attributes: ["id", "name", "house_id"]
    });
  }

  return null;
};

const isSuccessCode = (value) => ["OK", "EXITO", "SUCCESS", "EJECUTADO"].includes(String(value || "").trim().toUpperCase());

const syncValveCommandResult = async ({ comando, codigoResultado, mensaje }) => {
  if (comando.tipo !== "ABRIR_VALVULA" && comando.tipo !== "CERRAR_VALVULA") return;

  const success = isSuccessCode(codigoResultado);
  const targetState = comando.tipo === "ABRIR_VALVULA" ? "ABIERTA" : "CERRADA";
  const payload = typeof comando.payload === "object" && comando.payload !== null ? comando.payload : {};

  const valve = await Electrovalvula.findOne({ where: { device_id: comando.device_id } });
  if (valve && success) {
    await valve.update({ estado: targetState, ultima_accion_at: new Date() });
  }

  if (payload.accion_id && AccionValvula) {
    const accion = await AccionValvula.findByPk(payload.accion_id);
    if (accion) {
      await accion.update({
        estado_resultado: success ? "EXITOSO" : "ERROR",
        detalle: mensaje ? String(mensaje).slice(0, 255) : accion.detalle
      });
    }
  }
};

const listCommands = async (req, res, next) => {
  try {
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    if (req.query.estado) where.estado = req.query.estado;
    if (req.query.tipo) where.tipo = req.query.tipo;
    if (req.query.deviceId) where.device_id = Number(req.query.deviceId);

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

    const result = await ComandoRemoto.findAndCountAll({
      where,
      include: [deviceInclude, { model: RespuestaComando, as: "respuesta", required: false }],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true
    });

    return res.json({ ok: true, comandos: result.rows, pagination: buildMeta(result.count) });
  } catch (error) {
    return next(error);
  }
};

const createCommand = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para enviar comandos" });
    }

    const { deviceId, tipo, payload, prioridad, expiresAt } = req.body;
    if (!VALID_TYPES.includes(tipo)) {
      return res.status(400).json({ ok: false, msg: "tipo invalido" });
    }
    if (prioridad && !VALID_PRIORITIES.includes(prioridad)) {
      return res.status(400).json({ ok: false, msg: "prioridad invalida" });
    }

    const scopeCheck = await ensureHouseScope(req, Number(deviceId));
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    const comando = await ComandoRemoto.create({
      device_id: Number(deviceId),
      user_id: req.user?.id || req.user?.uid || null,
      tipo,
      payload: payload || null,
      estado: "PENDIENTE",
      prioridad: prioridad || "NORMAL",
      expires_at: expiresAt ? new Date(expiresAt) : null
    });

    await recordAudit({
      user: req.user,
      entidad: "ComandoRemoto",
      entidadId: comando.id,
      accion: `comando:${tipo}`,
      detalle: { deviceId, prioridad: comando.prioridad },
      req
    });

    return res.status(201).json({ ok: true, comando });
  } catch (error) {
    return next(error);
  }
};

/**
 * Endpoint que el ESP32 consulta para obtener sus comandos pendientes.
 * Usa autenticacion de device (header x-device-key) a traves de ingestAuth.
 */
const pollPendingCommandsForDevice = async (req, res, next) => {
  try {
    const device = await resolveDeviceFromRequest(req);
    if (!device) {
      return res.status(401).json({ ok: false, msg: "Device no autenticado" });
    }

    const now = new Date();
    await ComandoRemoto.update(
      { estado: "EXPIRADO" },
      {
        where: {
          device_id: device.id,
          estado: "PENDIENTE",
          expires_at: { [Op.lte]: now }
        }
      }
    );

    const pending = await ComandoRemoto.findAll({
      where: {
        device_id: device.id,
        estado: "PENDIENTE",
        [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: now } }]
      },
      order: [
        ["prioridad", "DESC"],
        ["created_at", "ASC"]
      ],
      limit: 10
    });

    // Marca los comandos como ENVIADO
    await Promise.all(
      pending.map((c) => c.update({ estado: "ENVIADO", sent_at: now }))
    );

    return res.json({ ok: true, comandos: pending });
  } catch (error) {
    return next(error);
  }
};

/**
 * Endpoint que el ESP32 usa para responder a un comando.
 * Autenticado via ingestAuth.
 */
const submitCommandResponse = async (req, res, next) => {
  try {
    const device = await resolveDeviceFromRequest(req);
    const comandoId = Number(req.params.id);
    const { codigoResultado, mensaje, payload } = req.body;

    if (!codigoResultado) {
      return res.status(400).json({ ok: false, msg: "codigoResultado requerido" });
    }

    const comando = await ComandoRemoto.findByPk(comandoId);
    if (!comando) return res.status(404).json({ ok: false, msg: "Comando no encontrado" });

    if (device && comando.device_id !== device.id) {
      return res.status(403).json({ ok: false, msg: "Comando no pertenece a este dispositivo" });
    }

    const existing = await RespuestaComando.findOne({ where: { comando_id: comando.id } });
    if (existing) {
      return res.status(409).json({ ok: false, msg: "El comando ya tiene respuesta" });
    }

    const respuesta = await RespuestaComando.create({
      comando_id: comando.id,
      codigo_resultado: String(codigoResultado).slice(0, 40),
      mensaje: mensaje ? String(mensaje).slice(0, 255) : null,
      payload: payload || null,
      recibido_at: new Date()
    });

    const nuevoEstado = isSuccessCode(codigoResultado) ? "EJECUTADO" : "ERROR";
    await comando.update({ estado: nuevoEstado });
    await syncValveCommandResult({ comando, codigoResultado, mensaje });

    return res.status(201).json({ ok: true, respuesta, comando });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listCommands,
  createCommand,
  pollPendingCommandsForDevice,
  submitCommandResponse
};
