const express = require("express");
const { body, param, query } = require("express-validator");
const {
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation
} = require("../controllers/locationsController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();

router.get(
  "/",
  auth,
  [
    query("houseId").optional().isInt({ min: 1 }).withMessage("houseId invalido"),
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit invalido"),
    query("page").optional().isInt({ min: 1 }).withMessage("page invalido")
  ],
  validate,
  listLocations
);

router.post(
  "/",
  auth,
  [
    body("houseId").isInt({ min: 1 }).withMessage("houseId invalido"),
    body("nombre").trim().isLength({ min: 2, max: 120 }).withMessage("nombre invalido"),
    body("descripcion").optional({ values: "falsy" }).trim().isLength({ max: 255 }).withMessage("descripcion invalida"),
    body("area").optional({ values: "falsy" }).trim().isLength({ max: 80 }).withMessage("area invalida"),
    body("piso").optional({ values: "falsy" }).trim().isLength({ max: 40 }).withMessage("piso invalido")
  ],
  validate,
  createLocation
);

router.put(
  "/:id",
  auth,
  [
    param("id").isInt({ min: 1 }).withMessage("id invalido"),
    body("nombre").optional().trim().isLength({ min: 2, max: 120 }).withMessage("nombre invalido"),
    body("descripcion").optional({ values: "falsy" }).trim().isLength({ max: 255 }).withMessage("descripcion invalida"),
    body("area").optional({ values: "falsy" }).trim().isLength({ max: 80 }).withMessage("area invalida"),
    body("piso").optional({ values: "falsy" }).trim().isLength({ max: 40 }).withMessage("piso invalido")
  ],
  validate,
  updateLocation
);

router.delete(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido")],
  validate,
  deleteLocation
);

module.exports = router;
