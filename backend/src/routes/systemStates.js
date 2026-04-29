const express = require("express");
const { body, query } = require("express-validator");
const { listSystemStates, createSystemState } = require("../controllers/systemStatesController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();
const estados = ["NORMAL", "ALERTA", "FUGA", "MANTENIMIENTO", "OFFLINE"];
const jsonPayload = (value) => value === undefined || value === null || typeof value === "object";

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
  listSystemStates
);

router.post(
  "/",
  auth,
  [
    body("deviceId").isInt({ min: 1 }).withMessage("deviceId invalido"),
    body("estado").isIn(estados).withMessage("estado invalido"),
    body("ts").optional({ values: "falsy" }).isISO8601().withMessage("ts invalido"),
    body("motivo").optional({ values: "falsy" }).trim().isLength({ max: 180 }).withMessage("motivo invalido"),
    body("metadata").optional({ nullable: true }).custom(jsonPayload).withMessage("metadata invalido")
  ],
  validate,
  createSystemState
);

module.exports = router;
