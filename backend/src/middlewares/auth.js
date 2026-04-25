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
    const auth = req.headers.authorization || "";
    const tokenFromHeader = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const tokenFromQuery =
      allowQueryToken && req.method === "GET" && typeof req.query.token === "string"
        ? req.query.token.trim()
        : "";
    const token = tokenFromHeader || tokenFromQuery;
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

// EventSource no permite enviar Authorization de forma nativa.
auth.withQueryToken = createAuthMiddleware({ allowQueryToken: true });

module.exports = auth;
