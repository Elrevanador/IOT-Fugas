const express = require("express");
const { body, param, query } = require("express-validator");
const {
  listIncidents,
  getIncident,
  updateIncidentStatus
} = require("../controllers/incidentsController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();
const estados = ["ABIERTO", "CONFIRMADO", "FALSO_POSITIVO", "CERRADO"];

router.get(
  "/",
  auth,
  [
    query("estado").optional().isIn(estados).withMessage("estado invalido"),
    query("deviceId").optional().isInt({ min: 1 }).withMessage("deviceId invalido"),
    query("houseId").optional().isInt({ min: 1 }).withMessage("houseId invalido"),
    query("from").optional().isISO8601().withMessage("from invalido"),
    query("until").optional().isISO8601().withMessage("until invalido"),
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit invalido"),
    query("page").optional().isInt({ min: 1 }).withMessage("page invalido")
  ],
  validate,
  listIncidents
);

router.get(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido")],
  validate,
  getIncident
);

router.patch(
  "/:id/status",
  auth,
  [
    param("id").isInt({ min: 1 }).withMessage("id invalido"),
    body("estado").isIn(estados).withMessage("estado invalido"),
    body("observaciones").optional({ values: "falsy" }).trim().isLength({ max: 2000 }).withMessage("observaciones invalidas")
  ],
  validate,
  updateIncidentStatus
);

module.exports = router;
