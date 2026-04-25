const crypto = require("node:crypto");

const KEY_PREFIX = "dev";
const KEY_BYTES = 24;
const HASH_BYTES = 64;

const createDeviceApiKey = () => `${KEY_PREFIX}_${crypto.randomBytes(KEY_BYTES).toString("base64url")}`;

const createDeviceApiKeyHint = (apiKey) => {
  const normalized = String(apiKey || "").trim();
  if (!normalized) return null;
  return normalized.slice(-6);
};

const hashDeviceApiKey = (apiKey) => {
  const normalized = String(apiKey || "").trim();
  if (!normalized) {
    throw new Error("No se puede hashear una clave vacia");
  }

  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(normalized, salt, HASH_BYTES);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
};

const verifyDeviceApiKey = (apiKey, storedHash) => {
  const normalized = String(apiKey || "").trim();
  const encoded = String(storedHash || "").trim();
  if (!normalized || !encoded) return false;

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

module.exports = {
  createDeviceApiKey,
  createDeviceApiKeyHint,
  hashDeviceApiKey,
  verifyDeviceApiKey
};
