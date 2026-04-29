const crypto = require("node:crypto");

const KEY_PREFIX = "dev";
const KEY_BYTES = 24;
const HASH_BYTES = 64;
const MAX_KEY_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 año

const createDeviceApiKey = () => `${KEY_PREFIX}_${crypto.randomBytes(KEY_BYTES).toString("base64url")}`;

const createDeviceApiKeyHint = (apiKey) => {
  const normalized = String(apiKey || "").trim();
  if (!normalized) return null;

  // Validar formato básico
  if (!normalized.startsWith(KEY_PREFIX + "_")) {
    throw new Error("Formato de clave API inválido");
  }

  return normalized.slice(-6);
};

const hashDeviceApiKey = (apiKey) => {
  const normalized = String(apiKey || "").trim();
  if (!normalized) {
    throw new Error("No se puede hashear una clave vacía");
  }

  // Validar formato de clave
  if (!normalized.startsWith(KEY_PREFIX + "_")) {
    throw new Error("Formato de clave API inválido");
  }

  if (normalized.length < 10) {
    throw new Error("Clave API demasiado corta");
  }

  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(normalized, salt, HASH_BYTES);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
};

const verifyDeviceApiKey = (apiKey, storedHash) => {
  const normalized = String(apiKey || "").trim();
  const encoded = String(storedHash || "").trim();
  if (!normalized || !encoded) return false;

  // Validar formato básico antes de verificar
  if (!normalized.startsWith(KEY_PREFIX + "_")) {
    return false;
  }

  const [scheme, saltBase64, hashBase64] = encoded.split(":");
  if (scheme !== "scrypt" || !saltBase64 || !hashBase64) return false;

  try {
    const salt = Buffer.from(saltBase64, "base64");
    const stored = Buffer.from(hashBase64, "base64");
    const computed = crypto.scryptSync(normalized, salt, stored.length);

    if (computed.length !== stored.length) return false;
    return crypto.timingSafeEqual(computed, stored);
  } catch {
    return false;
  }
};

// Función adicional para validar la fortaleza de claves
const validateDeviceApiKey = (apiKey) => {
  const normalized = String(apiKey || "").trim();

  if (!normalized) {
    throw new Error("Clave API requerida");
  }

  if (!normalized.startsWith(KEY_PREFIX + "_")) {
    throw new Error("Formato de clave API inválido");
  }

  if (normalized.length < 10) {
    throw new Error("Clave API demasiado corta");
  }

  // Verificar que contenga suficientes caracteres aleatorios
  const randomPart = normalized.slice(KEY_PREFIX.length + 1);
  if (randomPart.length < 20) {
    throw new Error("Clave API insuficientemente aleatoria");
  }

  return true;
};

module.exports = {
  createDeviceApiKey,
  createDeviceApiKeyHint,
  hashDeviceApiKey,
  verifyDeviceApiKey,
  validateDeviceApiKey
};
