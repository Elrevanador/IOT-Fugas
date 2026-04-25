const crypto = require("node:crypto");
const { Device } = require("../models");
const { getIngestApiKey } = require("../config/env");
const { verifyDeviceApiKey } = require("../services/deviceCredentials");

const safeCompare = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const findDeviceForCredential = async (req) => {
  const deviceId =
    req.body && req.body.deviceId !== undefined && req.body.deviceId !== null && req.body.deviceId !== ""
      ? Number(req.body.deviceId)
      : null;

  if (deviceId) {
    return Device.findByPk(deviceId, {
      attributes: ["id", "name", "api_key_hash", "api_key_hint"]
    });
  }

  const deviceName = typeof req.body?.deviceName === "string" ? req.body.deviceName.trim() : "";
  if (!deviceName) return null;

  return Device.findOne({
    where: { name: deviceName },
    attributes: ["id", "name", "api_key_hash", "api_key_hint", "hardware_uid"]
  });
};

const enforceAuthenticatedDeviceIdentity = (req, device) => {
  if (!device) return null;

  const incomingDeviceId =
    req.body && req.body.deviceId !== undefined && req.body.deviceId !== null && req.body.deviceId !== ""
      ? Number(req.body.deviceId)
      : null;
  const incomingDeviceName = typeof req.body?.deviceName === "string" ? req.body.deviceName.trim() : "";
  const incomingHardwareUid = typeof req.body?.hardwareUid === "string" ? req.body.hardwareUid.trim() : "";

  if (incomingDeviceId && incomingDeviceId !== Number(device.id)) {
    return "La credencial del dispositivo no coincide con deviceId";
  }

  if (incomingDeviceName && incomingDeviceName !== device.name) {
    return "La credencial del dispositivo no coincide con deviceName";
  }

  if (incomingHardwareUid && device.hardware_uid && incomingHardwareUid !== device.hardware_uid) {
    return "La credencial del dispositivo no coincide con hardwareUid";
  }

  return null;
};

module.exports = async (req, res, next) => {
  let ingestApiKey = "";
  try {
    ingestApiKey = getIngestApiKey();
  } catch (error) {
    return next(error);
  }

  const rawDeviceKey = req.headers["x-device-key"] || req.headers["x-api-key"] || "";
  const deviceKey = Array.isArray(rawDeviceKey) ? rawDeviceKey[0] : String(rawDeviceKey).trim();

  if (deviceKey) {
    if (ingestApiKey && safeCompare(deviceKey, ingestApiKey)) {
      req.deviceAuth = { type: "global-key" };
      return next();
    }

    try {
      const device = await findDeviceForCredential(req);
      if (device?.api_key_hash && verifyDeviceApiKey(deviceKey, device.api_key_hash)) {
        const identityError = enforceAuthenticatedDeviceIdentity(req, device);
        if (identityError) {
          return res.status(403).json({ ok: false, msg: identityError });
        }
        req.deviceAuth = { type: "device-key", deviceId: device.id, deviceName: device.name };
        req.authenticatedDevice = device;
        return next();
      }
    } catch (error) {
      return next(error);
    }
  }

  if (!ingestApiKey) {
    return res.status(401).json({ ok: false, msg: "Clave de dispositivo invalida" });
  }

  return res.status(401).json({ ok: false, msg: "x-device-key requerido" });
};
