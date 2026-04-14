const { Alert } = require("../models");

const listAlerts = async (req, res, next) => {
  try {
    const alerts = await Alert.findAll({
      order: [["ts", "DESC"]],
      limit: 200
    });
    return res.json({ ok: true, alerts });
  } catch (error) {
    return next(error);
  }
};

const ackAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const alert = await Alert.findByPk(id);
    if (!alert) {
      return res.status(404).json({ ok: false, msg: "Alerta no encontrada" });
    }
    alert.acknowledged = true;
    alert.ack_at = new Date();
    await alert.save();
    return res.json({ ok: true, alert });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listAlerts, ackAlert };
