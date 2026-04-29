const { Op } = require("sequelize");
const {
  Reading,
  IncidenteFuga,
  ConfiguracionDeteccion,
  Alert,
  EstadoSistema,
  Electrovalvula,
  AccionValvula,
  ComandoRemoto
} = require("../models");
const { recordAudit } = require("./audit");
const logger = require("../utils/logger");

const DEFAULT_CONFIG = {
  umbral_flow_lmin: 2.0,
  ventana_minutos: 30,
  auto_cierre_valvula: true,
  notificar_email: true,
  umbral_presion_min_kpa: null,
  umbral_presion_max_kpa: null
};

// Constantes de validación
const MIN_WINDOW_MINUTES = 5;
const MAX_WINDOW_MINUTES = 1440; // 24 horas
const MIN_FLOW_THRESHOLD = 0.1;
const MAX_FLOW_THRESHOLD = 1000;

const getDetectionConfig = async (deviceId, { transaction } = {}) => {
  try {
    const cfg = await ConfiguracionDeteccion.findOne({
      where: { device_id: deviceId },
      transaction
    });

    if (!cfg) {
      return { ...DEFAULT_CONFIG, activo: true, device_id: deviceId };
    }

    const plain = typeof cfg.toJSON === "function" ? cfg.toJSON() : cfg;
    const config = { ...DEFAULT_CONFIG, ...plain };

    // Validar configuración
    if (config.umbral_flow_lmin < MIN_FLOW_THRESHOLD || config.umbral_flow_lmin > MAX_FLOW_THRESHOLD) {
      logger.warn("Configuración de umbral de flujo inválida, usando valor por defecto", {
        deviceId,
        umbral_flow_lmin: config.umbral_flow_lmin
      });
      config.umbral_flow_lmin = DEFAULT_CONFIG.umbral_flow_lmin;
    }

    if (config.ventana_minutos < MIN_WINDOW_MINUTES || config.ventana_minutos > MAX_WINDOW_MINUTES) {
      logger.warn("Configuración de ventana temporal inválida, usando valor por defecto", {
        deviceId,
        ventana_minutos: config.ventana_minutos
      });
      config.ventana_minutos = DEFAULT_CONFIG.ventana_minutos;
    }

    return config;
  } catch (error) {
    logger.error("Error obteniendo configuración de detección", { deviceId, error: error.message });
    return { ...DEFAULT_CONFIG, activo: true, device_id: deviceId };
  }
};

const modelApiAvailable = (model, methods) => model && methods.every((method) => typeof model[method] === "function");

const canRunLeakDetection = () =>
  modelApiAvailable(Reading, ["findAll"]) &&
  modelApiAvailable(IncidenteFuga, ["findOne", "create"]) &&
  modelApiAvailable(ConfiguracionDeteccion, ["findOne"]) &&
  modelApiAvailable(Alert, ["create"]) &&
  modelApiAvailable(EstadoSistema, ["create"]) &&
  modelApiAvailable(Electrovalvula, ["findOrCreate"]) &&
  modelApiAvailable(ComandoRemoto, ["create"]);

/**
 * Evalua si existe una fuga sostenida en la ventana temporal.
 * Retorna true si TODAS las lecturas de la ventana superan el umbral
 * y la ventana contiene datos que cubren al menos `ventana_minutos`.
 */
const hasSustainedLeak = async (deviceId, config, now, { transaction } = {}) => {
  try {
    if (!deviceId || !config || !now) {
      logger.warn("Parámetros inválidos para detección de fuga", { deviceId, config: !!config, now: !!now });
      return false;
    }

    const windowStart = new Date(now.getTime() - config.ventana_minutos * 60 * 1000);

    const readings = await Reading.findAll({
      where: {
        device_id: deviceId,
        ts: { [Op.gte]: windowStart, [Op.lte]: now }
      },
      order: [["ts", "ASC"]],
      transaction,
      limit: 1000 // Limitar para evitar consultas muy grandes
    });

    if (readings.length < 2) {
      return false;
    }

    // Debe cubrir al menos el 90% de la ventana para considerarla sostenida
    const firstTs = new Date(readings[0].ts).getTime();
    const lastTs = new Date(readings[readings.length - 1].ts).getTime();
    const coverageMs = lastTs - firstTs;
    const requiredMs = config.ventana_minutos * 60 * 1000 * 0.9;

    if (coverageMs < requiredMs) {
      return false;
    }

    // Todas las lecturas deben superar el umbral
    const allAbove = readings.every((r) => {
      const flow = Number(r.flow_lmin);
      return !isNaN(flow) && flow >= config.umbral_flow_lmin;
    });

    if (!allAbove) {
      return false;
    }

    // Calcular estadísticas
    const validFlows = readings.map(r => Number(r.flow_lmin)).filter(f => !isNaN(f));
    if (validFlows.length === 0) return false;

    const flow_promedio = validFlows.reduce((acc, flow) => acc + flow, 0) / validFlows.length;
    const duracion_minutos = Math.round(coverageMs / 60000);
    const volumen_estimado_l = flow_promedio * (coverageMs / 60000);

    return {
      readings,
      flow_promedio,
      duracion_minutos,
      volumen_estimado_l
    };
  } catch (error) {
    logger.error("Error en detección de fuga sostenida", {
      deviceId,
      error: error.message
    });
    return false;
  }
};

/**
 * Pipeline completo de deteccion llamado tras crear una lectura.
 * - Abre incidente si hay fuga sostenida y no hay uno ABIERTO.
 * - Cierra el incidente ABIERTO si el flujo volvio a normal.
 * - Registra cambio de estado en estado_sistema.
 * - Si auto_cierre_valvula: encola comando_remoto CERRAR_VALVULA.
 */
const runLeakDetection = async ({ device, reading, transaction }) => {
  if (!device || !reading || !canRunLeakDetection()) {
    return { incidente: null, commandQueued: false, skipped: true };
  }

  const config = await getDetectionConfig(device.id, { transaction });
  if (config.activo === false) return { incidente: null, commandQueued: false };

  const now = new Date(reading.ts);

  const openIncident = await IncidenteFuga.findOne({
    where: { device_id: device.id, estado: "ABIERTO" },
    transaction
  });

  const sustained = await hasSustainedLeak(device.id, config, now, { transaction });

  // Caso 1: hay fuga sostenida y no existe incidente abierto → abrir uno
  if (sustained && !openIncident) {
    const incidente = await IncidenteFuga.create(
      {
        device_id: device.id,
        detected_at: now,
        flow_promedio_lmin: sustained.flow_promedio,
        duracion_minutos: sustained.duracion_minutos,
        volumen_estimado_l: sustained.volumen_estimado_l,
        estado: "ABIERTO",
        umbral_flow_lmin: config.umbral_flow_lmin,
        ventana_minutos: config.ventana_minutos
      },
      { transaction }
    );

    await Alert.create(
      {
        device_id: device.id,
        ts: now,
        severity: "FUGA",
        tipo: "FUGA",
        message: `Fuga sostenida ${sustained.flow_promedio.toFixed(2)} L/min por ${sustained.duracion_minutos} min`,
        incidente_id: incidente.id,
        acknowledged: false
      },
      { transaction }
    );

    await EstadoSistema.create(
      {
        device_id: device.id,
        ts: now,
        estado: "FUGA",
        motivo: `Incidente #${incidente.id} abierto automaticamente`,
        metadata: { incidente_id: incidente.id, flow: sustained.flow_promedio }
      },
      { transaction }
    );

    let commandQueued = false;
    if (config.auto_cierre_valvula) {
      const [valvula] = await Electrovalvula.findOrCreate({
        where: { device_id: device.id },
        defaults: { device_id: device.id, estado: "DESCONOCIDO", modo: "AUTO" },
        transaction
      });
      const accion = modelApiAvailable(AccionValvula, ["create"])
        ? await AccionValvula.create(
            {
              valvula_id: valvula.id,
              user_id: null,
              tipo: "CERRAR",
              origen: "AUTO_FUGA",
              estado_resultado: "PENDIENTE",
              ts: now,
              detalle: `Auto-cierre por incidente #${incidente.id}`
            },
            { transaction }
          )
        : null;

      await ComandoRemoto.create(
        {
          device_id: device.id,
          user_id: null,
          tipo: "CERRAR_VALVULA",
          payload: { motivo: "auto_cierre_por_fuga", incidente_id: incidente.id, accion_id: accion?.id || null },
          estado: "PENDIENTE",
          prioridad: "CRITICA"
        },
        { transaction }
      );
      commandQueued = true;
    }

    await recordAudit({
      entidad: "IncidenteFuga",
      entidadId: incidente.id,
      accion: "auto_detectar_fuga",
      detalle: {
        deviceId: device.id,
        flow_promedio_lmin: sustained.flow_promedio,
        commandQueued
      },
      transaction
    });

    return { incidente, commandQueued };
  }

  // Caso 2: hay incidente abierto y el flujo volvio a normal → cerrar
  if (openIncident && Number(reading.flow_lmin) < config.umbral_flow_lmin && reading.state === "NORMAL") {
    const endedAt = now;
    const durMin = Math.round((endedAt.getTime() - new Date(openIncident.detected_at).getTime()) / 60000);
    await openIncident.update(
      {
        ended_at: endedAt,
        duracion_minutos: durMin,
        estado: "CERRADO"
      },
      { transaction }
    );

    await EstadoSistema.create(
      {
        device_id: device.id,
        ts: now,
        estado: "NORMAL",
        motivo: `Incidente #${openIncident.id} cerrado automaticamente`,
        metadata: { incidente_id: openIncident.id }
      },
      { transaction }
    );

    await recordAudit({
      entidad: "IncidenteFuga",
      entidadId: openIncident.id,
      accion: "auto_cerrar_fuga",
      detalle: { deviceId: device.id, duracion_minutos: durMin },
      transaction
    });

    return { incidente: openIncident, commandQueued: false, closed: true };
  }

  return { incidente: openIncident || null, commandQueued: false };
};

module.exports = {
  DEFAULT_CONFIG,
  getDetectionConfig,
  hasSustainedLeak,
  runLeakDetection,
  canRunLeakDetection
};
