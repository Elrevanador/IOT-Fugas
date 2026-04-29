const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../config/env");

const createAuthMiddleware = ({ allowQueryToken = false } = {}) => (req, res, next) => {
  let jwtSecret = "";

  try {
    jwtSecret = getJwtSecret();
  } catch (error) {
    return next(error);
  }

  try {
    const authHeader = req.headers.authorization || "";
    let token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token && allowQueryToken) {
      const raw = req.query?.token;
      if (raw !== undefined && raw !== null && raw !== "") {
        token = String(raw).trim();
      }
    }
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

const auth = createAuthMiddleware();
/** Solo para GET /api/public/dashboard/stream: EventSource del navegador no envía Authorization. */
auth.authStream = createAuthMiddleware({ allowQueryToken: true });

module.exports = auth;
