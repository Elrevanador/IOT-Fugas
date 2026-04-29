const express = require("express");
const { body, param, query } = require("express-validator");
const { listUserRoles, assignUserRole, removeUserRole } = require("../controllers/userRolesController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();

router.get(
  "/",
  auth,
  [
    query("userId").optional().isInt({ min: 1 }).withMessage("userId invalido"),
    query("roleId").optional().isInt({ min: 1 }).withMessage("roleId invalido")
  ],
  validate,
  listUserRoles
);

router.post(
  "/",
  auth,
  [
    body("userId").isInt({ min: 1 }).withMessage("userId invalido"),
    body("roleId").isInt({ min: 1 }).withMessage("roleId invalido")
  ],
  validate,
  assignUserRole
);

router.delete(
  "/:userId/:roleId",
  auth,
  [
    param("userId").isInt({ min: 1 }).withMessage("userId invalido"),
    param("roleId").isInt({ min: 1 }).withMessage("roleId invalido")
  ],
  validate,
  removeUserRole
);

module.exports = router;
