const express = require("express");
const { body, query } = require("express-validator");
const { createReading, listReadings, latestReading } = require("../controllers/readingsController");
const validate = require("../middlewares/validate");
const auth = require("../middlewares/auth");
const ingestAuth = require("../middlewares/ingestAuth");

const router = express.Router();

router.post(
  "/",
  ingestAuth,
  [
    body().custom((_, { req }) => {
      const hasDeviceId = req.body.deviceId !== undefined && req.body.deviceId !== null && req.body.deviceId !== "";
      const hasDeviceName =
        typeof req.body.deviceName === "string" && req.body.deviceName.trim().length >= 3;

      if (!hasDeviceId && !hasDeviceName) {
        throw new Error("deviceId o deviceName es requerido");
      }

      return true;
    }),
    body("deviceId").optional().isInt({ min: 1 }).withMessage("deviceId invalido"),
    body("deviceName")
      .optional()
      .trim()
      .isString()
      .isLength({ min: 3 })
      .withMessage("deviceName invalido"),
    body("ts").optional().isISO8601().withMessage("ts invalido"),
    body("flow_lmin").isFloat({ min: 0 }).withMessage("flow_lmin invalido").toFloat(),
    body("pressure_kpa").isFloat({ min: 0 }).withMessage("pressure_kpa invalido").toFloat(),
    body("risk").isInt({ min: 0, max: 100 }).withMessage("risk invalido").toInt(),
    body("state").isIn(["NORMAL", "ALERTA", "FUGA", "ERROR"]).withMessage("state invalido")
  ],
  validate,
  createReading
);

router.get(
  "/",
  auth,
  [query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit invalido")],
  validate,
  listReadings
);

router.get("/latest", auth, latestReading);

module.exports = router;
