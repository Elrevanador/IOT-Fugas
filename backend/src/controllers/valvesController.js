const { Electrovalvula, AccionValvula, Device, House, ComandoRemoto, User } = require("../models");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { resolvePagination } = require("../utils/pagination");
const { recordAudit } = require("../services/audit");

const VALID_MODES = ["AUTO", "MANUAL", "BLOQUEADA"];
const VALID_ACTIONS = ["ABRIR", "CERRAR", "RESETEAR", "CAMBIAR_MODO"];

const ensureHouseScope = async (req, deviceId) => {
  const device = await Device.findByPk(deviceId, { attributes: ["id", "house_id"] });
  if (!device) return { ok: false, status: 404, msg: "Dispositivo no encontrado" };

  const scopedHouseId = getUserHouseScope(req.user);
  if (scopedHouseId && device.house_id !== scopedHouseId) {
    return { ok: false, status: 403, msg: "No tienes acceso a este dispositivo" };
  }
  return { ok: true, device };
};

const listValves = async (req, res, next) => {
  try {
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const scopedHouseId = getUserHouseScope(req.user);
    const deviceWhere = {};
    if (scopedHouseId) deviceWhere.house_id = scopedHouseId;
    else if (req.query.houseId) deviceWhere.house_id = Number(req.query.houseId);

    const result = await Electrovalvula.findAndCountAll({
      include: [
        {
          model: Device,
          attributes: ["id", "name", "house_id", "status"],
          where: Object.keys(deviceWhere).length ? deviceWhere : undefined,
          required: Object.keys(deviceWhere).length > 0,
          include: [{ model: House, attributes: ["id", "name", "code"], required: false }]
        }
      ],
      order: [["id", "ASC"]],
      limit,
      offset,
      distinct: true
    });

    return res.json({
      ok: true,
      valvulas: result.rows,
      pagination: buildMeta(result.count)
    });
  } catch (error) {
    return next(error);
  }
};

const getValveByDevice = async (req, res, next) => {
  try {
    const deviceId = Number(req.params.deviceId);
    const scopeCheck = await ensureHouseScope(req, deviceId);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    const [valve] = await Electrovalvula.findOrCreate({
      where: { device_id: deviceId },
      defaults: { device_id: deviceId, estado: "DESCONOCIDO", modo: "AUTO" }
    });

    const acciones = await AccionValvula.findAll({
      where: { valvula_id: valve.id },
      order: [["ts", "DESC"]],
      limit: 20
    });

    return res.json({ ok: true, valvula: valve, acciones });
  } catch (error) {
    return next(error);
  }
};

const triggerValveAction = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para operar la valvula" });
    }

    const { tipo, modo, detalle } = req.body;
    if (!VALID_ACTIONS.includes(tipo)) {
      return res.status(400).json({ ok: false, msg: "tipo invalido" });
    }
    if (tipo === "CAMBIAR_MODO" && !VALID_MODES.includes(modo)) {
      return res.status(400).json({ ok: false, msg: "modo invalido" });
    }

    const deviceId = Number(req.params.deviceId);
    const scopeCheck = await ensureHouseScope(req, deviceId);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    const [valve] = await Electrovalvula.findOrCreate({
      where: { device_id: deviceId },
      defaults: { device_id: deviceId, estado: "DESCONOCIDO", modo: "AUTO" }
    });

    const now = new Date();
    const patch = { ultima_accion_at: now };
    if (tipo === "ABRIR") patch.estado = "ABIERTA";
    if (tipo === "CERRAR") patch.estado = "CERRADA";
    if (tipo === "RESETEAR") patch.estado = "DESCONOCIDO";
    if (tipo === "CAMBIAR_MODO") patch.modo = modo;

    await valve.update(patch);

    const accion = await AccionValvula.create({
      valvula_id: valve.id,
      user_id: req.user?.id || req.user?.uid || null,
      tipo,
      origen: "MANUAL",
      estado_resultado: "PENDIENTE",
      ts: now,
      detalle: detalle ? String(detalle).slice(0, 255) : null
    });

    // Encolar comando al device si aplica (apertura/cierre)
    let comando = null;
    if (tipo === "ABRIR" || tipo === "CERRAR") {
      comando = await ComandoRemoto.create({
        device_id: deviceId,
        user_id: req.user?.id || req.user?.uid || null,
        tipo: tipo === "ABRIR" ? "ABRIR_VALVULA" : "CERRAR_VALVULA",
        payload: { accion_id: accion.id, origen: "panel" },
        estado: "PENDIENTE",
        prioridad: "ALTA"
      });
    }

    await recordAudit({
      user: req.user,
      entidad: "Electrovalvula",
      entidadId: valve.id,
      accion: `valvula:${tipo}`,
      detalle: { deviceId, modo: patch.modo, comandoId: comando?.id || null },
      req
    });

    return res.json({ ok: true, valvula: valve, accion, comando });
  } catch (error) {
    return next(error);
  }
};

const listValveActions = async (req, res, next) => {
  try {
    const deviceId = Number(req.params.deviceId);
    const scopeCheck = await ensureHouseScope(req, deviceId);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const valve = await Electrovalvula.findOne({ where: { device_id: deviceId } });
    if (!valve) return res.json({ ok: true, acciones: [], pagination: buildMeta(0) });

    const result = await AccionValvula.findAndCountAll({
      where: { valvula_id: valve.id },
      order: [["ts", "DESC"]],
      limit,
      offset
    });

    return res.json({ ok: true, acciones: result.rows, pagination: buildMeta(result.count) });
  } catch (error) {
    return next(error);
  }
};

const listAllValveActions = async (req, res, next) => {
  try {
    const { limit, offset, buildMeta } = resolvePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    if (req.query.tipo) where.tipo = req.query.tipo;
    if (req.query.estadoResultado) where.estado_resultado = req.query.estadoResultado;

    const scopedHouseId = getUserHouseScope(req.user);
    const deviceWhere = {};
    if (scopedHouseId) deviceWhere.house_id = scopedHouseId;
    else if (req.query.houseId) deviceWhere.house_id = Number(req.query.houseId);
    if (req.query.deviceId) deviceWhere.id = Number(req.query.deviceId);

    const valveInclude = {
      model: Electrovalvula,
      required: Object.keys(deviceWhere).length > 0,
      include: [
        {
          model: Device,
          attributes: ["id", "name", "house_id"],
          where: Object.keys(deviceWhere).length ? deviceWhere : undefined,
          required: Object.keys(deviceWhere).length > 0,
          include: [{ model: House, attributes: ["id", "name", "code"], required: false }]
        }
      ]
    };

    const result = await AccionValvula.findAndCountAll({
      where,
      include: [valveInclude, { model: User, as: "usuario", attributes: ["id", "nombre", "email"], required: false }],
      order: [["ts", "DESC"]],
      limit,
      offset,
      distinct: true
    });

    return res.json({ ok: true, acciones: result.rows, pagination: buildMeta(result.count) });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listValves, getValveByDevice, triggerValveAction, listValveActions, listAllValveActions };
