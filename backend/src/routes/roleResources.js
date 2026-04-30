const express = require("express");
const { body, param, query } = require("express-validator");
const {
  assignRoleResource,
  listRoleResources,
  removeRoleResource
} = require("../controllers/roleResourcesController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();

const permissionValidators = [
  body("roleId").isInt({ min: 1 }).withMessage("roleId invalido"),
  body("resourceId").isInt({ min: 1 }).withMessage("resourceId invalido"),
  body("canView").optional().isBoolean().withMessage("canView invalido"),
  body("canCreate").optional().isBoolean().withMessage("canCreate invalido"),
  body("canUpdate").optional().isBoolean().withMessage("canUpdate invalido"),
  body("canDelete").optional().isBoolean().withMessage("canDelete invalido"),
  body("can_view").optional().isBoolean().withMessage("can_view invalido"),
  body("can_create").optional().isBoolean().withMessage("can_create invalido"),
  body("can_update").optional().isBoolean().withMessage("can_update invalido"),
  body("can_delete").optional().isBoolean().withMessage("can_delete invalido")
];

router.get(
  "/",
  auth,
  [
    query("roleId").optional().isInt({ min: 1 }).withMessage("roleId invalido"),
    query("resourceId").optional().isInt({ min: 1 }).withMessage("resourceId invalido")
  ],
  validate,
  listRoleResources
);
router.post("/", auth, permissionValidators, validate, assignRoleResource);
router.delete(
  "/:roleId/:resourceId",
  auth,
  [
    param("roleId").isInt({ min: 1 }).withMessage("roleId invalido"),
    param("resourceId").isInt({ min: 1 }).withMessage("resourceId invalido")
  ],
  validate,
  removeRoleResource
);

module.exports = router;
