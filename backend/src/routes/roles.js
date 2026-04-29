const express = require("express");
const { body, param } = require("express-validator");
const { listRoles, createRole, updateRole, deleteRole } = require("../controllers/rolesController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();

const roleValidators = [
  body("code").trim().isLength({ min: 2, max: 40 }).withMessage("code invalido"),
  body("nombre").trim().isLength({ min: 2, max: 120 }).withMessage("nombre invalido"),
  body("descripcion").optional({ values: "falsy" }).trim().isLength({ max: 255 }).withMessage("descripcion invalida")
];

router.get("/", auth, listRoles);
router.post("/", auth, roleValidators, validate, createRole);
router.put(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido"), ...roleValidators],
  validate,
  updateRole
);
router.delete(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido")],
  validate,
  deleteRole
);

module.exports = router;
