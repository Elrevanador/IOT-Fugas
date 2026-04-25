const express = require("express");
const { query } = require("express-validator");
const { listAudit } = require("../controllers/auditController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();

router.get(
  "/",
  auth,
  [
    query("entidad").optional().trim().isLength({ min: 1, max: 80 }).withMessage("entidad invalida"),
    query("accion").optional().trim().isLength({ min: 1, max: 80 }).withMessage("accion invalida"),
    query("userId").optional().isInt({ min: 1 }).withMessage("userId invalido"),
    query("from").optional().isISO8601().withMessage("from invalido"),
    query("until").optional().isISO8601().withMessage("until invalido"),
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit invalido"),
    query("page").optional().isInt({ min: 1 }).withMessage("page invalido")
  ],
  validate,
  listAudit
);

module.exports = router;
