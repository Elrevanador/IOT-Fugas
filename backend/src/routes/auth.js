const express = require("express");
const { body } = require("express-validator");
const { register, login, me } = require("../controllers/authController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const createRateLimiter = require("../middlewares/rateLimit");

const router = express.Router();
const authWindowMs = Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "", 10) || 15 * 60 * 1000;
const loginMax = Number.parseInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX || "", 10) || 10;
const registerMax = Number.parseInt(process.env.AUTH_REGISTER_RATE_LIMIT_MAX || "", 10) || 5;
const loginRateLimit = createRateLimiter({
  key: "auth:login",
  windowMs: authWindowMs,
  maxRequests: loginMax,
  message: "Demasiados intentos de login, intenta de nuevo mas tarde"
});
const registerRateLimit = createRateLimiter({
  key: "auth:register",
  windowMs: authWindowMs,
  maxRequests: registerMax,
  message: "Demasiados intentos de registro, intenta de nuevo mas tarde"
});

router.post(
  "/register",
  registerRateLimit,
  [
    body("nombre").trim().notEmpty().withMessage("Nombre requerido"),
    body("email").trim().isEmail().withMessage("Email invalido").normalizeEmail(),
    body("password").isLength({ min: 6 }).withMessage("Minimo 6 caracteres")
  ],
  validate,
  register
);

router.post(
  "/login",
  loginRateLimit,
  [
    body("email").trim().isEmail().withMessage("Email invalido").normalizeEmail(),
    body("password").notEmpty().withMessage("Password requerido")
  ],
  validate,
  login
);

router.get("/me", auth, me);

module.exports = router;
