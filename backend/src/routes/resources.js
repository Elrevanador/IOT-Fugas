const express = require("express");
const { body, param } = require("express-validator");
const {
  createResource,
  deleteResource,
  listResources,
  updateResource
} = require("../controllers/resourcesController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();

const resourceValidators = [
  body("code")
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage("code invalido")
    .matches(/^[a-zA-Z0-9._:-]+$/)
    .withMessage("code solo puede contener letras, numeros, punto, guion, guion bajo o dos puntos"),
  body("nombre").trim().isLength({ min: 2, max: 120 }).withMessage("nombre invalido"),
  body("backendPath").optional({ values: "falsy" }).trim().isLength({ max: 160 }).withMessage("backendPath invalido"),
  body("backend_path").optional({ values: "falsy" }).trim().isLength({ max: 160 }).withMessage("backend_path invalido"),
  body("frontendPath").optional({ values: "falsy" }).trim().isLength({ max: 160 }).withMessage("frontendPath invalido"),
  body("frontend_path").optional({ values: "falsy" }).trim().isLength({ max: 160 }).withMessage("frontend_path invalido"),
  body("icono").optional({ values: "falsy" }).trim().isLength({ max: 80 }).withMessage("icono invalido"),
  body("orden").optional({ values: "falsy" }).isInt({ min: 0, max: 10000 }).withMessage("orden invalido"),
  body("parentId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("parentId invalido"),
  body("parent_id").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("parent_id invalido"),
  body("estado").optional({ values: "falsy" }).isIn(["ACTIVO", "INACTIVO"]).withMessage("estado invalido")
];

router.get("/", auth, listResources);
router.post("/", auth, resourceValidators, validate, createResource);
router.put(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido"), ...resourceValidators],
  validate,
  updateResource
);
router.delete(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido")],
  validate,
  deleteResource
);

module.exports = router;
