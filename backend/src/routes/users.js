const express = require("express");
const { body, param } = require("express-validator");
const { createUser, listUsers, updateUser, deleteUser } = require("../controllers/usersController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();
const strongPassword = (field = "password") =>
  body(field)
    .isLength({ min: 8 })
    .withMessage("password debe tener al menos 8 caracteres")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage("password debe incluir mayusculas, minusculas, numeros y caracteres especiales");

router.get("/", auth, listUsers);

router.post(
  "/",
  auth,
  [
    body("nombre").trim().isLength({ min: 3 }).withMessage("nombre invalido"),
    body("apellido").trim().isLength({ min: 2, max: 120 }).withMessage("apellido invalido"),
    body("username")
      .trim()
      .isLength({ min: 3, max: 80 })
      .withMessage("username invalido")
      .matches(/^[a-zA-Z0-9._-]+$/)
      .withMessage("username solo puede contener letras, numeros, punto, guion o guion bajo"),
    body("email").trim().isEmail().withMessage("email invalido").normalizeEmail(),
    strongPassword("password"),
    body("houseId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("houseId invalido"),
    body("role").trim().isIn(["admin", "operator", "resident"]).withMessage("role invalido"),
    body("estado").optional({ values: "falsy" }).isIn(["ACTIVO", "INACTIVO", "BLOQUEADO"]).withMessage("estado invalido")
  ],
  validate,
  createUser
);

router.put(
  "/:id",
  auth,
  [
    param("id").isInt({ min: 1 }).withMessage("id invalido"),
    body("nombre").trim().isLength({ min: 3 }).withMessage("nombre invalido"),
    body("apellido").trim().isLength({ min: 2, max: 120 }).withMessage("apellido invalido"),
    body("username")
      .trim()
      .isLength({ min: 3, max: 80 })
      .withMessage("username invalido")
      .matches(/^[a-zA-Z0-9._-]+$/)
      .withMessage("username solo puede contener letras, numeros, punto, guion o guion bajo"),
    body("email").trim().isEmail().withMessage("email invalido").normalizeEmail(),
    strongPassword("password").optional({ values: "falsy" }),
    body("houseId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("houseId invalido"),
    body("role").trim().isIn(["admin", "operator", "resident"]).withMessage("role invalido"),
    body("estado").optional({ values: "falsy" }).isIn(["ACTIVO", "INACTIVO", "BLOQUEADO"]).withMessage("estado invalido")
  ],
  validate,
  updateUser
);

router.delete(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido")],
  validate,
  deleteUser
);

module.exports = router;
