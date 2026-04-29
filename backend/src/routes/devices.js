const express = require("express");
const { body, param, query } = require("express-validator");
const {
  createDevice,
  updateDevice,
  deleteDevice,
  listDevices,
  rotateDeviceCredential
} = require("../controllers/devicesController");
const auth = require("../middlewares/auth");
const { createScopeFilter } = require("../middlewares/scopeFilter");
const validate = require("../middlewares/validate");

const router = express.Router();

router.post(
  "/",
  auth,
  [
    body("name").trim().isLength({ min: 3, max: 120 }).withMessage("name invalido"),
    body("location").trim().isLength({ min: 3 }).withMessage("location invalido"),
    body("deviceType").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 64 }).withMessage("deviceType invalido"),
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
    body("status")
      .trim()
      .isIn(["ACTIVO", "NORMAL", "ALERTA", "FUGA", "ERROR", "INACTIVO", "MANTENIMIENTO"])
      .withMessage("status invalido"),
    body("houseId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("houseId invalido")
  ],
  validate,
  createDevice
);

router.put(
  "/:id",
  auth,
  [
    param("id").isInt({ min: 1 }).withMessage("id invalido"),
    body("name").trim().isLength({ min: 3, max: 120 }).withMessage("name invalido"),
    body("location").trim().isLength({ min: 3 }).withMessage("location invalido"),
    body("deviceType").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 64 }).withMessage("deviceType invalido"),
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
    body("status")
      .trim()
      .isIn(["ACTIVO", "NORMAL", "ALERTA", "FUGA", "ERROR", "INACTIVO", "MANTENIMIENTO"])
      .withMessage("status invalido"),
    body("houseId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("houseId invalido")
  ],
  validate,
  updateDevice
);

router.delete(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido")],
  validate,
  deleteDevice
);

router.post(
  "/:id/credentials",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido")],
  validate,
  rotateDeviceCredential
);

router.get(
  "/",
  auth,
  createScopeFilter(), // Aplicar scope de casa
  [
    query("houseId").optional().isInt({ min: 1 }).withMessage("houseId invalido"),
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit invalido"),
    query("page").optional().isInt({ min: 1 }).withMessage("page invalido"),
    query("status")
      .optional()
      .isIn(["ACTIVO", "NORMAL", "ALERTA", "FUGA", "ERROR", "INACTIVO", "MANTENIMIENTO"])
      .withMessage("status invalido"),
    query("deviceType").optional().isLength({ min: 1, max: 64 }).withMessage("deviceType invalido"),
    query("search").optional().isLength({ min: 1, max: 120 }).withMessage("search invalido")
  ],
  validate,
  listDevices
);

module.exports = router;
