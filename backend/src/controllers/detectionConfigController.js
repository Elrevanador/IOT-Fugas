const { ConfiguracionDeteccion, Device } = require("../models");
const { getUserHouseScope, isOperator } = require("../middlewares/authorize");
const { recordAudit } = require("../services/audit");
const { DEFAULT_CONFIG } = require("../services/leakDetection");

const ensureHouseScope = async (req, deviceId) => {
  const device = await Device.findByPk(deviceId, { attributes: ["id", "house_id"] });
  if (!device) return { ok: false, status: 404, msg: "Dispositivo no encontrado" };

  const scopedHouseId = getUserHouseScope(req.user);
  if (scopedHouseId && device.house_id !== scopedHouseId) {
    return { ok: false, status: 403, msg: "No tienes acceso a este dispositivo" };
  }
  return { ok: true, device };
};

const parseOptionalBoolean = (value) => {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

const getConfig = async (req, res, next) => {
  try {
    const deviceId = Number(req.params.deviceId);
    const scopeCheck = await ensureHouseScope(req, deviceId);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    const [config] = await ConfiguracionDeteccion.findOrCreate({
      where: { device_id: deviceId },
      defaults: {
        device_id: deviceId,
        umbral_flow_lmin: DEFAULT_CONFIG.umbral_flow_lmin,
        ventana_minutos: DEFAULT_CONFIG.ventana_minutos,
        auto_cierre_valvula: DEFAULT_CONFIG.auto_cierre_valvula,
        notificar_email: DEFAULT_CONFIG.notificar_email,
        activo: true
      }
    });
    return res.json({ ok: true, config });
  } catch (error) {
    return next(error);
  }
};

const updateConfig = async (req, res, next) => {
  try {
    if (!isOperator(req.user)) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para modificar la configuracion" });
    }

    const deviceId = Number(req.params.deviceId);
    const scopeCheck = await ensureHouseScope(req, deviceId);
    if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ ok: false, msg: scopeCheck.msg });

    const allowed = [
      "umbral_flow_lmin",
      "ventana_minutos",
      "umbral_presion_min_kpa",
      "umbral_presion_max_kpa",
      "auto_cierre_valvula",
      "notificar_email",
      "activo"
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }

    if (patch.umbral_flow_lmin !== undefined) {
      const v = Number(patch.umbral_flow_lmin);
      if (!Number.isFinite(v) || v <= 0) {
        return res.status(400).json({ ok: false, msg: "umbral_flow_lmin debe ser numero > 0" });
      }
      patch.umbral_flow_lmin = v;
    }
    if (patch.ventana_minutos !== undefined) {
      const v = Number(patch.ventana_minutos);
      if (!Number.isInteger(v) || v < 1 || v > 24 * 60) {
        return res.status(400).json({ ok: false, msg: "ventana_minutos debe ser entero entre 1 y 1440" });
      }
      patch.ventana_minutos = v;
    }
    for (const key of ["auto_cierre_valvula", "notificar_email", "activo"]) {
      if (patch[key] !== undefined) patch[key] = parseOptionalBoolean(patch[key]);
    }
    patch.updated_by_user_id = req.user?.id || req.user?.uid || null;

    const [config] = await ConfiguracionDeteccion.findOrCreate({
      where: { device_id: deviceId },
      defaults: { device_id: deviceId, ...DEFAULT_CONFIG, activo: true }
    });
    await config.update(patch);

    await recordAudit({
      user: req.user,
      entidad: "ConfiguracionDeteccion",
      entidadId: config.id,
      accion: "actualizar_config",
      detalle: patch,
      req
    });

    return res.json({ ok: true, config });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getConfig, updateConfig };
