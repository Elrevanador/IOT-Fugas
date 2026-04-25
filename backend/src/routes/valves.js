const express = require("express");
const { body, param, query } = require("express-validator");
const {
  listValves,
  getValveByDevice,
  triggerValveAction,
  listValveActions
} = require("../controllers/valvesController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();
const acciones = ["ABRIR", "CERRAR", "RESETEAR", "CAMBIAR_MODO"];
const modos = ["AUTO", "MANUAL", "BLOQUEADA"];

router.get(
  "/",
  auth,
  [
    query("houseId").optional().isInt({ min: 1 }).withMessage("houseId invalido"),
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit invalido"),
    query("page").optional().isInt({ min: 1 }).withMessage("page invalido")
  ],
  validate,
  listValves
);

router.get(
  "/device/:deviceId",
  auth,
  [param("deviceId").isInt({ min: 1 }).withMessage("deviceId invalido")],
  validate,
  getValveByDevice
);

router.get(
  "/device/:deviceId/actions",
  auth,
  [
    param("deviceId").isInt({ min: 1 }).withMessage("deviceId invalido"),
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit invalido"),
    query("page").optional().isInt({ min: 1 }).withMessage("page invalido")
  ],
  validate,
  listValveActions
);

router.post(
  "/device/:deviceId/actions",
  auth,
  [
    param("deviceId").isInt({ min: 1 }).withMessage("deviceId invalido"),
    body("tipo").isIn(acciones).withMessage("tipo invalido"),
    body("modo").optional({ values: "falsy" }).isIn(modos).withMessage("modo invalido"),
    body("detalle").optional({ values: "falsy" }).trim().isLength({ max: 255 }).withMessage("detalle invalido")
  ],
  validate,
  triggerValveAction
);

module.exports = router;
