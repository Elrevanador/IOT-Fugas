const { AuditoriaSistema } = require("../models");
const logger = require("../utils/logger");

// Constantes de validación
const MAX_ENTIDAD_LENGTH = 80;
const MAX_ACCION_LENGTH = 80;
const MAX_ENTIDAD_ID_LENGTH = 80;
const MAX_IP_LENGTH = 45; // IPv6
const MAX_USER_AGENT_LENGTH = 500;

/**
 * Registra una accion en la tabla de auditoria.
 * No lanza excepciones: si falla, solo lo loguea.
 */
const recordAudit = async ({
  user,
  entidad,
  entidadId,
  accion,
  detalle = null,
  req = null,
  transaction = null
}) => {
  try {
    // Validaciones de entrada
    if (!entidad || typeof entidad !== 'string') {
      logger.warn("Entidad inválida para auditoría", { entidad });
      return;
    }

    if (!accion || typeof accion !== 'string') {
      logger.warn("Acción inválida para auditoría", { accion });
      return;
    }

    // Sanitizar y truncar campos
    const sanitizedEntidad = String(entidad).slice(0, MAX_ENTIDAD_LENGTH);
    const sanitizedAccion = String(accion).slice(0, MAX_ACCION_LENGTH);
    const sanitizedEntidadId = entidadId != null ? String(entidadId).slice(0, MAX_ENTIDAD_ID_LENGTH) : null;

    // Extraer información de la request
    let ip = null;
    let userAgent = null;

    if (req) {
      // Extraer IP real considerando proxies
      ip = req.ip ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.connection?.socket?.remoteAddress ||
           null;

      if (ip && ip.length > MAX_IP_LENGTH) {
        ip = ip.slice(0, MAX_IP_LENGTH);
      }

      // Extraer User-Agent
      userAgent = req.get ? req.get("user-agent") : req.headers?.["user-agent"];
      if (userAgent && userAgent.length > MAX_USER_AGENT_LENGTH) {
        userAgent = userAgent.slice(0, MAX_USER_AGENT_LENGTH);
      }
    }

    // Extraer ID de usuario
    const userId = user?.id || user?.uid || null;

    // Crear registro de auditoría
    await AuditoriaSistema.create(
      {
        user_id: userId,
        entidad: sanitizedEntidad,
        entidad_id: sanitizedEntidadId,
        accion: sanitizedAccion,
        detalle,
        ip,
        user_agent: userAgent,
        ts: new Date()
      },
      { transaction }
    );

    // Log de auditoría de alto nivel para eventos críticos
    if (['login_exitoso', 'login_fallido', 'crear_dispositivo', 'confirmar_alerta', 'auto_detectar_fuga'].includes(sanitizedAccion)) {
      logger.info("Evento de auditoría crítico", {
        userId,
        entidad: sanitizedEntidad,
        entidadId: sanitizedEntidadId,
        accion: sanitizedAccion,
        ip
      });
    }

  } catch (error) {
    // No relanzar el error para no interrumpir el flujo principal
    logger.error("Error registrando auditoría", {
      error: error.message,
      entidad,
      entidadId,
      accion,
      userId: user?.id || user?.uid
    });
  }
};

module.exports = { recordAudit };
