const express = require("express");
const { body, param, query } = require("express-validator");
const {
  listSensors,
  createSensor,
  updateSensor,
  deleteSensor
} = require("../controllers/sensorsController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();
const tiposSensor = ["caudal", "presion", "valvula", "temperatura", "otro"];

router.get(
  "/",
  auth,
  [
    query("deviceId").optional().isInt({ min: 1 }).withMessage("deviceId invalido"),
    query("tipo").optional().isIn(tiposSensor).withMessage("tipo invalido"),
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit invalido"),
    query("page").optional().isInt({ min: 1 }).withMessage("page invalido")
  ],
  validate,
  listSensors
);

router.post(
  "/",
  auth,
  [
    body("deviceId").isInt({ min: 1 }).withMessage("deviceId invalido"),
    body("tipo").isIn(tiposSensor).withMessage("tipo invalido"),
    body("modelo").optional({ values: "falsy" }).trim().isLength({ max: 80 }).withMessage("modelo invalido"),
    body("unidad").optional({ values: "falsy" }).trim().isLength({ max: 20 }).withMessage("unidad invalida"),
    body("rango_min").optional({ values: "falsy" }).isFloat().withMessage("rango_min invalido"),
    body("rango_max").optional({ values: "falsy" }).isFloat().withMessage("rango_max invalido"),
    body("ubicacionId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("ubicacionId invalido")
  ],
  validate,
  createSensor
);

router.put(
  "/:id",
  auth,
  [
    param("id").isInt({ min: 1 }).withMessage("id invalido"),
    body("tipo").optional().isIn(tiposSensor).withMessage("tipo invalido"),
    body("modelo").optional({ values: "falsy" }).trim().isLength({ max: 80 }).withMessage("modelo invalido"),
    body("unidad").optional({ values: "falsy" }).trim().isLength({ max: 20 }).withMessage("unidad invalida"),
    body("rango_min").optional({ values: "falsy" }).isFloat().withMessage("rango_min invalido"),
    body("rango_max").optional({ values: "falsy" }).isFloat().withMessage("rango_max invalido"),
    body("ubicacionId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("ubicacionId invalido"),
    body("ubicacion_id").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("ubicacion_id invalido"),
    body("activo").optional().isBoolean().withMessage("activo invalido")
  ],
  validate,
  updateSensor
);

router.delete(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido")],
  validate,
  deleteSensor
);

module.exports = router;
