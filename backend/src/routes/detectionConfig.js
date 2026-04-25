const express = require("express");
const { body, param } = require("express-validator");
const { getConfig, updateConfig } = require("../controllers/detectionConfigController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();

router.get(
  "/:deviceId",
  auth,
  [param("deviceId").isInt({ min: 1 }).withMessage("deviceId invalido")],
  validate,
  getConfig
);

router.put(
  "/:deviceId",
  auth,
  [
    param("deviceId").isInt({ min: 1 }).withMessage("deviceId invalido"),
    body("umbral_flow_lmin").optional().isFloat({ min: 0.01 }).withMessage("umbral_flow_lmin invalido"),
    body("ventana_minutos").optional().isInt({ min: 1, max: 1440 }).withMessage("ventana_minutos invalido"),
    body("umbral_presion_min_kpa").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("umbral_presion_min_kpa invalido"),
    body("umbral_presion_max_kpa").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("umbral_presion_max_kpa invalido"),
    body("auto_cierre_valvula").optional().isBoolean().withMessage("auto_cierre_valvula invalido"),
    body("notificar_email").optional().isBoolean().withMessage("notificar_email invalido"),
    body("activo").optional().isBoolean().withMessage("activo invalido")
  ],
  validate,
  updateConfig
);

module.exports = router;
