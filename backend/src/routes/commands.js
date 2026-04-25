const express = require("express");
const { body, param, query } = require("express-validator");
const {
  listCommands,
  createCommand,
  pollPendingCommandsForDevice,
  submitCommandResponse
} = require("../controllers/commandsController");
const auth = require("../middlewares/auth");
const ingestAuth = require("../middlewares/ingestAuth");
const validate = require("../middlewares/validate");

const router = express.Router();
const tipos = ["CERRAR_VALVULA", "ABRIR_VALVULA", "ACTUALIZAR_CONFIG", "REINICIAR", "SOLICITAR_ESTADO", "OTRO"];
const estados = ["PENDIENTE", "ENVIADO", "EJECUTADO", "ERROR", "EXPIRADO"];
const prioridades = ["BAJA", "NORMAL", "ALTA", "CRITICA"];
const jsonPayload = (value) => value === undefined || value === null || typeof value === "object";

router.get(
  "/",
  auth,
  [
    query("estado").optional().isIn(estados).withMessage("estado invalido"),
    query("tipo").optional().isIn(tipos).withMessage("tipo invalido"),
    query("deviceId").optional().isInt({ min: 1 }).withMessage("deviceId invalido"),
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit invalido"),
    query("page").optional().isInt({ min: 1 }).withMessage("page invalido")
  ],
  validate,
  listCommands
);

router.post(
  "/",
  auth,
  [
    body("deviceId").isInt({ min: 1 }).withMessage("deviceId invalido"),
    body("tipo").isIn(tipos).withMessage("tipo invalido"),
    body("payload").optional({ nullable: true }).custom(jsonPayload).withMessage("payload invalido"),
    body("prioridad").optional({ values: "falsy" }).isIn(prioridades).withMessage("prioridad invalida"),
    body("expiresAt").optional({ values: "falsy" }).isISO8601().withMessage("expiresAt invalido")
  ],
  validate,
  createCommand
);

router.get(
  "/pending",
  ingestAuth,
  [
    query("deviceId").optional().isInt({ min: 1 }).withMessage("deviceId invalido"),
    query("deviceName").optional().trim().isLength({ min: 3 }).withMessage("deviceName invalido")
  ],
  validate,
  pollPendingCommandsForDevice
);

router.post(
  "/:id/response",
  ingestAuth,
  [
    param("id").isInt({ min: 1 }).withMessage("id invalido"),
    body("deviceId").optional().isInt({ min: 1 }).withMessage("deviceId invalido"),
    body("deviceName").optional().trim().isLength({ min: 3 }).withMessage("deviceName invalido"),
    body("codigoResultado").trim().isLength({ min: 1, max: 40 }).withMessage("codigoResultado requerido"),
    body("mensaje").optional({ values: "falsy" }).trim().isLength({ max: 255 }).withMessage("mensaje invalido"),
    body("payload").optional({ nullable: true }).custom(jsonPayload).withMessage("payload invalido")
  ],
  validate,
  submitCommandResponse
);

module.exports = router;
