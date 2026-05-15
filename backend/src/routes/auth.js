const express = require("express");
const { body } = require("express-validator");
const {
  register,
  login,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  me,
  changePassword
} = require("../controllers/authController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const createRateLimiter = require("../middlewares/rateLimit");

const router = express.Router();
const authWindowMs = Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "", 10) || 15 * 60 * 1000;
const loginMax = Number.parseInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX || "", 10) || 10;
const registerMax = Number.parseInt(process.env.AUTH_REGISTER_RATE_LIMIT_MAX || "", 10) || 5;
const profileMax = Number.parseInt(process.env.AUTH_PROFILE_RATE_LIMIT_MAX || "", 10) || 30;
const passwordResetMax = Number.parseInt(process.env.AUTH_PASSWORD_RESET_RATE_LIMIT_MAX || "", 10) || 5;

const loginRateLimit = createRateLimiter({
  key: "auth:login",
  windowMs: authWindowMs,
  maxRequests: loginMax,
  message: "Demasiados intentos de login, intenta de nuevo más tarde"
});

const registerRateLimit = createRateLimiter({
  key: "auth:register",
  windowMs: authWindowMs,
  maxRequests: registerMax,
  message: "Demasiados intentos de registro, intenta de nuevo más tarde"
});

const profileRateLimit = createRateLimiter({
  key: "auth:profile",
  windowMs: authWindowMs,
  maxRequests: profileMax,
  message: "Demasiadas consultas al perfil, intenta de nuevo más tarde"
});

const passwordResetRateLimit = createRateLimiter({
  key: "auth:password-reset",
  windowMs: authWindowMs,
  maxRequests: passwordResetMax,
  message: "Demasiadas solicitudes de recuperacion, intenta de nuevo más tarde"
});

router.post(
  "/register",
  registerRateLimit,
  [
    body("nombre")
      .trim()
      .isLength({ min: 3, max: 120 })
      .withMessage("Nombre invalido"),
    body("apellido")
      .trim()
      .isLength({ min: 2, max: 120 })
      .withMessage("Apellido invalido"),
    body("username")
      .trim()
      .isLength({ min: 3, max: 80 })
      .withMessage("Username invalido")
      .matches(/^[a-zA-Z0-9._-]+$/)
      .withMessage("Username invalido"),
    body("email")
      .trim()
      .isEmail()
      .withMessage("Email invalido")
      .isLength({ max: 254 })
      .withMessage("Email demasiado largo"),
    body("password")
      .isLength({ min: 8, max: 128 })
      .withMessage("Contraseña invalida"),
    body("confirmPassword")
      .custom((value, { req }) => value === req.body.password)
      .withMessage("Las contraseñas no coinciden")
  ],
  validate,
  register
);

router.post(
  "/login",
  loginRateLimit,
  [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email o username requerido")
      .isLength({ max: 254 })
      .withMessage("Email o username demasiado largo"),
    body("password")
      .notEmpty()
      .withMessage("Contraseña requerida")
  ],
  validate,
  login
);

router.get("/me", auth, profileRateLimit, me);

router.post(
  "/forgot-password",
  passwordResetRateLimit,
  [
    body("email")
      .trim()
      .isEmail()
      .withMessage("Email invalido")
      .isLength({ max: 254 })
      .withMessage("Email demasiado largo")
  ],
  validate,
  forgotPassword
);

router.post(
  "/verify-reset-code",
  passwordResetRateLimit,
  [
    body("email")
      .trim()
      .isEmail()
      .withMessage("Email invalido")
      .isLength({ max: 254 })
      .withMessage("Email demasiado largo"),
    body("code")
      .trim()
      .isLength({ min: 6, max: 6 })
      .withMessage("Código invalido")
      .isNumeric()
      .withMessage("Código invalido")
  ],
  validate,
  verifyResetCode
);

router.post(
  "/reset-password",
  passwordResetRateLimit,
  [
    body("token")
      .optional({ values: "falsy" })
      .trim()
      .isLength({ min: 64, max: 128 })
      .withMessage("Token invalido"),
    body("email")
      .optional({ values: "falsy" })
      .trim()
      .isEmail()
      .withMessage("Email invalido")
      .isLength({ max: 254 })
      .withMessage("Email demasiado largo"),
    body("code")
      .optional({ values: "falsy" })
      .trim()
      .isLength({ min: 6, max: 6 })
      .withMessage("Código invalido")
      .isNumeric()
      .withMessage("Código invalido"),
    body()
      .custom((value) => Boolean(value.token || (value.email && value.code)))
      .withMessage("Token o código requerido"),
    body("password")
      .isLength({ min: 8, max: 128 })
      .withMessage("Contraseña debe tener al menos 8 caracteres")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .withMessage("Contraseña debe incluir mayúsculas, minúsculas, números y caracteres especiales"),
    body("confirmPassword")
      .custom((value, { req }) => value === req.body.password)
      .withMessage("Las contraseñas no coinciden")
  ],
  validate,
  resetPassword
);

router.post(
  "/change-password",
  auth,
  profileRateLimit,
  [
    body("currentPassword")
      .notEmpty()
      .withMessage("Contraseña actual requerida"),
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Nueva contraseña debe tener al menos 8 caracteres")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .withMessage("Nueva contraseña debe incluir mayúsculas, minúsculas, números y caracteres especiales")
  ],
  validate,
  changePassword
);

module.exports = router;
