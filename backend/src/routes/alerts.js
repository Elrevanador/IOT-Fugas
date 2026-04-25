const express = require("express");
const { body, param, query } = require("express-validator");
const { listAlerts, ackAlert } = require("../controllers/alertsController");
const validate = require("../middlewares/validate");
const auth = require("../middlewares/auth");

const router = express.Router();

router.get(
  "/",
  auth,
  [
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit invalido"),
    query("page").optional().isInt({ min: 1 }).withMessage("page invalido"),
    query("deviceId").optional().isInt({ min: 1 }).withMessage("deviceId invalido"),
    query("houseId").optional().isInt({ min: 1 }).withMessage("houseId invalido"),
    query("acknowledged").optional().isBoolean().withMessage("acknowledged invalido"),
    query("severity").optional().isIn(["ALERTA", "FUGA", "ERROR"]).withMessage("severity invalido")
  ],
  validate,
  listAlerts
);

router.patch(
  "/:id/ack",
  auth,
  [
    param("id").isInt({ min: 1 }).withMessage("id invalido"),
    body("note").optional({ values: "falsy" }).trim().isLength({ max: 500 }).withMessage("note invalida"),
    body("ackNote").optional({ values: "falsy" }).trim().isLength({ max: 500 }).withMessage("ackNote invalida")
  ],
  validate,
  ackAlert
);

module.exports = router;
