const { Op } = require("sequelize");
const { ComandoRemoto, RespuestaComando, Device, House, Electrovalvula, AccionValvula } = require("../models");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { recordAudit } = require("../services/audit");
const logger = require("../utils/logger");

const VALID_TYPES = [
  "CERRAR_VALVULA",
  "ABRIR_VALVULA",
  "ACTUALIZAR_CONFIG",
  "REINICIAR",
  "SOLICITAR_ESTADO",
  "OTRO"
];
const VALID_PRIORITIES = ["BAJA", "NORMAL", "ALTA", "CRITICA"];
const VALID_ESTADOS = ["PENDIENTE", "ENVIADO", "EJECUTADO", "ERROR", "EXPIRADO"];
const MAX_PAYLOAD_SIZE = 10000; // 10KB máximo para payload
const MAX_MENSAJE_LENGTH = 255;
const MAX_CODIGO_RESULTADO_LENGTH = 40;

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
    const device = await Device.findOne({
      where: { name: String(rawDeviceName).trim() },
      attributes: ["id", "name", "house_id"]
    });
    if (device) return device;
  }

  const rawHardwareUid = req.query.hardwareUid || req.body?.hardwareUid;
  if (rawHardwareUid) {
    return Device.findOne({
      where: { hardware_uid: String(rawHardwareUid).trim() },
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

const listCommandResponses = async (req, res, next) => {
  try {
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    const commandWhere = {};
    const deviceWhere = {};

    if (req.query.codigoResultado) where.codigo_resultado = req.query.codigoResultado;
    if (req.query.commandId) commandWhere.id = Number(req.query.commandId);
    if (req.query.deviceId) deviceWhere.id = Number(req.query.deviceId);

    const scopedHouseId = getUserHouseScope(req.user);
    if (scopedHouseId) deviceWhere.house_id = scopedHouseId;

    const commandInclude = {
      model: ComandoRemoto,
      required: Object.keys(commandWhere).length > 0 || Object.keys(deviceWhere).length > 0,
      where: Object.keys(commandWhere).length ? commandWhere : undefined,
      include: [
        {
          model: Device,
          attributes: ["id", "name", "house_id"],
          required: Object.keys(deviceWhere).length > 0,
          where: Object.keys(deviceWhere).length ? deviceWhere : undefined,
          include: [{ model: House, attributes: ["id", "name", "code"], required: false }]
        }
      ]
    };

    const result = await RespuestaComando.findAndCountAll({
      where,
      include: [commandInclude],
      order: [["recibido_at", "DESC"]],
      limit,
      offset,
      distinct: true
    });

    return res.json({ ok: true, respuestas: result.rows, pagination: buildMeta(result.count) });
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

    // Validaciones de entrada críticas
    if (!deviceId || isNaN(Number(deviceId))) {
      return res.status(400).json({ ok: false, msg: "deviceId requerido y debe ser un número válido" });
    }

    if (!tipo || !VALID_TYPES.includes(tipo)) {
      return res.status(400).json({
        ok: false,
        msg: `tipo requerido y debe ser uno de: ${VALID_TYPES.join(', ')}`
      });
    }

    if (prioridad && !VALID_PRIORITIES.includes(prioridad)) {
      return res.status(400).json({
        ok: false,
        msg: `prioridad debe ser uno de: ${VALID_PRIORITIES.join(', ')}`
      });
    }

    // Validar payload si se proporciona
    if (payload !== undefined && payload !== null) {
      if (typeof payload === 'string' && payload.length > MAX_PAYLOAD_SIZE) {
        return res.status(400).json({
          ok: false,
          msg: `payload demasiado grande (máximo ${MAX_PAYLOAD_SIZE} caracteres)`
        });
      }
      if (typeof payload === 'object' && JSON.stringify(payload).length > MAX_PAYLOAD_SIZE) {
        return res.status(400).json({
          ok: false,
          msg: `payload demasiado grande (máximo ${MAX_PAYLOAD_SIZE} caracteres)`
        });
      }
    }

    // Validar expiresAt si se proporciona
    if (expiresAt) {
      const expiresDate = new Date(expiresAt);
      if (isNaN(expiresDate.getTime())) {
        return res.status(400).json({ ok: false, msg: "expiresAt debe ser una fecha válida" });
      }
      if (expiresDate <= new Date()) {
        return res.status(400).json({ ok: false, msg: "expiresAt debe ser una fecha futura" });
      }
    }

    const scopeCheck = await ensureHouseScope(req, Number(deviceId));
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    logger.info("Creando comando remoto", {
      deviceId,
      tipo,
      prioridad: prioridad || "NORMAL",
      userId: req.user?.id,
      hasPayload: !!payload,
      expiresAt
    });

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
      detalle: { deviceId, prioridad: comando.prioridad, expiresAt },
      req
    });

    logger.info("Comando creado exitosamente", {
      comandoId: comando.id,
      deviceId,
      tipo
    });

    return res.status(201).json({ ok: true, comando });
  } catch (error) {
    logger.error("Error creando comando", {
      error: error.message,
      deviceId: req.body?.deviceId,
      tipo: req.body?.tipo,
      userId: req.user?.id
    });
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

    // Validaciones de entrada críticas
    if (!codigoResultado) {
      return res.status(400).json({ ok: false, msg: "codigoResultado requerido" });
    }

    if (isNaN(comandoId) || comandoId <= 0) {
      return res.status(400).json({ ok: false, msg: "ID de comando inválido" });
    }

    // Validar tamaño del mensaje
    if (mensaje && String(mensaje).length > MAX_MENSAJE_LENGTH) {
      return res.status(400).json({
        ok: false,
        msg: `mensaje demasiado largo (máximo ${MAX_MENSAJE_LENGTH} caracteres)`
      });
    }

    // Validar tamaño del código de resultado
    if (String(codigoResultado).length > MAX_CODIGO_RESULTADO_LENGTH) {
      return res.status(400).json({
        ok: false,
        msg: `codigoResultado demasiado largo (máximo ${MAX_CODIGO_RESULTADO_LENGTH} caracteres)`
      });
    }

    // Validar payload si se proporciona
    if (payload !== undefined && payload !== null) {
      if (typeof payload === 'string' && payload.length > MAX_PAYLOAD_SIZE) {
        return res.status(400).json({
          ok: false,
          msg: `payload demasiado grande (máximo ${MAX_PAYLOAD_SIZE} caracteres)`
        });
      }
      if (typeof payload === 'object' && JSON.stringify(payload).length > MAX_PAYLOAD_SIZE) {
        return res.status(400).json({
          ok: false,
          msg: `payload demasiado grande (máximo ${MAX_PAYLOAD_SIZE} caracteres)`
        });
      }
    }

    const comando = await ComandoRemoto.findByPk(comandoId);
    if (!comando) return res.status(404).json({ ok: false, msg: "Comando no encontrado" });

    if (device && comando.device_id !== device.id) {
      return res.status(403).json({ ok: false, msg: "Comando no pertenece a este dispositivo" });
    }

    // Verificar que no haya respuesta previa
    const existing = await RespuestaComando.findOne({ where: { comando_id: comando.id } });
    if (existing) {
      return res.status(409).json({ ok: false, msg: "El comando ya tiene respuesta" });
    }

    logger.info("Procesando respuesta de comando", {
      comandoId,
      deviceId: comando.device_id,
      codigoResultado,
      authenticatedDevice: device?.id
    });

    const respuesta = await RespuestaComando.create({
      comando_id: comando.id,
      codigo_resultado: String(codigoResultado).slice(0, MAX_CODIGO_RESULTADO_LENGTH),
      mensaje: mensaje ? String(mensaje).slice(0, MAX_MENSAJE_LENGTH) : null,
      payload: payload || null,
      recibido_at: new Date()
    });

    const nuevoEstado = isSuccessCode(codigoResultado) ? "EJECUTADO" : "ERROR";
    await comando.update({ estado: nuevoEstado });
    await syncValveCommandResult({ comando, codigoResultado, mensaje });

    await recordAudit({
      entidad: "RespuestaComando",
      entidadId: respuesta.id,
      accion: "respuesta_comando",
      detalle: {
        comandoId,
        deviceId: comando.device_id,
        codigoResultado,
        estado: nuevoEstado
      },
      req
    });

    logger.info("Respuesta de comando procesada exitosamente", {
      respuestaId: respuesta.id,
      comandoId,
      estado: nuevoEstado
    });

    return res.status(201).json({ ok: true, respuesta, comando });
  } catch (error) {
    logger.error("Error procesando respuesta de comando", {
      error: error.message,
      comandoId: req.params?.id,
      deviceId: req.authenticatedDevice?.id
    });
    return next(error);
  }
};

module.exports = {
  listCommands,
  listCommandResponses,
  createCommand,
  pollPendingCommandsForDevice,
  submitCommandResponse
};
