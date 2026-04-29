const { Device } = require("../models");
const { getUserHouseScope } = require("../middlewares/authorize");

/**
 * Verifica si un usuario tiene acceso a un dispositivo
 * @param {Object} user - Usuario autenticado
 * @param {number} deviceId - ID del dispositivo
 * @returns {Object} { ok: boolean, device?: Object, status?: number, msg?: string }
 */
const verifyDeviceAccess = async (user, deviceId) => {
  try {
    const device = await Device.findByPk(deviceId, {
      attributes: ["id", "house_id", "name"]
    });

    if (!device) {
      return { ok: false, status: 404, msg: "Dispositivo no encontrado" };
    }

    const scopedHouseId = getUserHouseScope(user);
    if (scopedHouseId && device.house_id !== scopedHouseId) {
      return { ok: false, status: 403, msg: "No tienes acceso a este dispositivo" };
    }

    return { ok: true, device };
  } catch (error) {
    return { ok: false, status: 500, msg: "Error al verificar acceso al dispositivo" };
  }
};

module.exports = { verifyDeviceAccess };