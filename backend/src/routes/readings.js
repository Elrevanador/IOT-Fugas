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
      const hasHouseId = req.body.houseId !== undefined && req.body.houseId !== null && req.body.houseId !== "";
      const hasDeviceId = req.body.deviceId !== undefined && req.body.deviceId !== null && req.body.deviceId !== "";
      const hasDeviceName =
        typeof req.body.deviceName === "string" && req.body.deviceName.trim().length >= 3;

      if (!hasDeviceId && !hasDeviceName) {
        throw new Error("deviceId o deviceName es requerido");
      }

      if (hasHouseId && Number.isNaN(Number(req.body.houseId))) {
        throw new Error("houseId invalido");
      }

      return true;
    }),
    body("houseId").optional().isInt({ min: 1 }).withMessage("houseId invalido"),
    body("deviceId").optional().isInt({ min: 1 }).withMessage("deviceId invalido"),
    body("deviceName")
      .optional()
      .trim()
      .isString()
      .isLength({ min: 3 })
      .withMessage("deviceName invalido"),
    body("deviceType")
      .optional({ values: "falsy" })
      .trim()
      .isLength({ min: 2, max: 64 })
      .withMessage("deviceType invalido"),
    body("firmwareVersion")
      .optional({ values: "falsy" })
      .trim()
      .isLength({ min: 1, max: 64 })
      .withMessage("firmwareVersion invalido"),
    body("hardwareUid")
      .optional({ values: "falsy" })
      .trim()
      .isLength({ min: 3, max: 120 })
      .withMessage("hardwareUid invalido"),
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
  [
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit invalido"),
    query("page").optional().isInt({ min: 1 }).withMessage("page invalido"),
    query("deviceId").optional().isInt({ min: 1 }).withMessage("deviceId invalido"),
    query("houseId").optional().isInt({ min: 1 }).withMessage("houseId invalido"),
    query("state").optional().isIn(["NORMAL", "ALERTA", "FUGA", "ERROR"]).withMessage("state invalido"),
    query("from").optional().isISO8601().withMessage("from invalido"),
    query("until").optional().isISO8601().withMessage("until invalido")
  ],
  validate,
  listReadings
);

router.get("/latest", auth, latestReading);

module.exports = router;
