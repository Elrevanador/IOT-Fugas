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

const firstPresent = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== "");

const getIncomingDeviceId = (req) => {
  const deviceId =
    firstPresent(req.body?.deviceId, req.params?.deviceId, req.query?.deviceId) !== undefined
      ? Number(firstPresent(req.body?.deviceId, req.params?.deviceId, req.query?.deviceId))
      : null;
  return Number.isFinite(deviceId) && deviceId > 0 ? deviceId : null;
};

const getIncomingDeviceName = (req) => {
  const value = firstPresent(req.body?.deviceName, req.params?.deviceName, req.query?.deviceName);
  return typeof value === "string" ? value.trim() : "";
};

const getIncomingHardwareUid = (req) => {
  const value = firstPresent(req.body?.hardwareUid, req.params?.hardwareUid, req.query?.hardwareUid);
  return typeof value === "string" ? value.trim() : "";
};

const findDeviceForCredential = async (req) => {
  const deviceId = getIncomingDeviceId(req);

  if (deviceId) {
    return Device.findByPk(deviceId, {
      attributes: ["id", "name", "api_key_hash", "api_key_hint", "hardware_uid"]
    });
  }

  const deviceName = getIncomingDeviceName(req);
  if (deviceName) {
    const device = await Device.findOne({
      where: { name: deviceName },
      attributes: ["id", "name", "api_key_hash", "api_key_hint", "hardware_uid"]
    });
    if (device) return device;
  }

  const hardwareUid = getIncomingHardwareUid(req);
  if (!hardwareUid) return null;

  return Device.findOne({
    where: { hardware_uid: hardwareUid },
    attributes: ["id", "name", "api_key_hash", "api_key_hint", "hardware_uid"]
  });
};

const enforceAuthenticatedDeviceIdentity = (req, device) => {
  if (!device) return null;

  const incomingDeviceId = getIncomingDeviceId(req);
  const incomingDeviceName = getIncomingDeviceName(req);
  const incomingHardwareUid = getIncomingHardwareUid(req);
  const hardwareUidMatches = incomingHardwareUid && device.hardware_uid && incomingHardwareUid === device.hardware_uid;

  if (incomingDeviceId && incomingDeviceId !== Number(device.id)) {
    return "La credencial del dispositivo no coincide con deviceId";
  }

  if (incomingDeviceName && incomingDeviceName !== device.name && !hardwareUidMatches) {
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
      const device = await findDeviceForCredential(req);
      req.deviceAuth = { type: "global-key", deviceId: device?.id || null, deviceName: device?.name || null };
      if (device) req.authenticatedDevice = device;
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
