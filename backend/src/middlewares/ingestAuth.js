const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { getIngestApiKey, getJwtSecret } = require("../config/env");

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
};

const safeCompare = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

module.exports = (req, res, next) => {
  let ingestApiKey = "";
  try {
    ingestApiKey = getIngestApiKey();
  } catch (error) {
    return next(error);
  }

  const rawDeviceKey = req.headers["x-device-key"] || req.headers["x-api-key"] || "";
  const deviceKey = Array.isArray(rawDeviceKey) ? rawDeviceKey[0] : String(rawDeviceKey).trim();

  if (deviceKey) {
    if (!ingestApiKey) {
      return res.status(503).json({ ok: false, msg: "INGEST_API_KEY no configurada" });
    }

    if (!safeCompare(deviceKey, ingestApiKey)) {
      return res.status(401).json({ ok: false, msg: "Clave de dispositivo invalida" });
    }

    req.deviceAuth = { type: "device-key" };
    return next();
  }

  const token = getBearerToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, getJwtSecret());
      req.deviceAuth = { type: "jwt" };
      return next();
    } catch (error) {
      return res.status(401).json({ ok: false, msg: "Token invalido" });
    }
  }

  if (!ingestApiKey) {
    return res.status(503).json({
      ok: false,
      msg: "Configura INGEST_API_KEY o usa un token JWT para enviar lecturas"
    });
  }

  return res.status(401).json({ ok: false, msg: "Credenciales requeridas" });
};
