const { AuditoriaSistema } = require("../models");

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
    await AuditoriaSistema.create(
      {
        user_id: user?.id || user?.uid || null,
        entidad: String(entidad || "").slice(0, 80),
        entidad_id: entidadId != null ? String(entidadId).slice(0, 80) : null,
        accion: String(accion || "").slice(0, 80),
        detalle,
        ip: req?.ip || null,
        user_agent: req?.get ? (req.get("user-agent") || null) : null,
        ts: new Date()
      },
      { transaction }
    );
  } catch (error) {
    console.error("No se pudo registrar auditoria:", error.message);
  }
};

module.exports = { recordAudit };
