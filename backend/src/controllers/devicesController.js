const { Device } = require("../models");

const listDevices = async (req, res, next) => {
  try {
    const devices = await Device.findAll({ order: [["id", "ASC"]] });
    return res.json({ ok: true, devices });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listDevices };
