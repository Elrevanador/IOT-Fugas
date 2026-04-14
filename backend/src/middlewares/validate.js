const { validationResult } = require("express-validator");

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      ok: false,
      msg: "Datos invalidos",
      errors: errors.array().map((e) => ({ field: e.path || e.param, msg: e.msg }))
    });
  }
  next();
};
