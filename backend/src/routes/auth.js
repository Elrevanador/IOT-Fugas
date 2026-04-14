const express = require("express");
const { body } = require("express-validator");
const { register, login } = require("../controllers/authController");
const validate = require("../middlewares/validate");

const router = express.Router();

router.post(
  "/register",
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
  [
    body("email").trim().isEmail().withMessage("Email invalido").normalizeEmail(),
    body("password").notEmpty().withMessage("Password requerido")
  ],
  validate,
  login
);

module.exports = router;
