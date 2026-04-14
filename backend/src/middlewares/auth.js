const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../config/env");

module.exports = (req, res, next) => {
  let jwtSecret = "";

  try {
    jwtSecret = getJwtSecret();
  } catch (error) {
    return next(error);
  }

  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
      return res.status(401).json({ ok: false, msg: "Token requerido" });
    }
    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, msg: "Token invalido" });
  }
};
