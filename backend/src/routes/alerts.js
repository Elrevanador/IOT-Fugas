const express = require("express");
const { param } = require("express-validator");
const { listAlerts, ackAlert } = require("../controllers/alertsController");
const validate = require("../middlewares/validate");
const auth = require("../middlewares/auth");

const router = express.Router();

router.get("/", auth, listAlerts);

router.patch(
  "/:id/ack",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido")],
  validate,
  ackAlert
);

module.exports = router;
