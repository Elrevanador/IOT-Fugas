const express = require("express");
const { body, param } = require("express-validator");
const { createUser, listUsers, updateUser, deleteUser } = require("../controllers/usersController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();

router.get("/", auth, listUsers);

router.post(
  "/",
  auth,
  [
    body("nombre").trim().isLength({ min: 3 }).withMessage("nombre invalido"),
    body("email").trim().isEmail().withMessage("email invalido").normalizeEmail(),
    body("password").isLength({ min: 6 }).withMessage("password invalido"),
    body("houseId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("houseId invalido"),
    body("role").trim().isIn(["admin", "operator", "resident"]).withMessage("role invalido")
  ],
  validate,
  createUser
);

router.put(
  "/:id",
  auth,
  [
    param("id").isInt({ min: 1 }).withMessage("id invalido"),
    body("nombre").trim().isLength({ min: 3 }).withMessage("nombre invalido"),
    body("email").trim().isEmail().withMessage("email invalido").normalizeEmail(),
    body("password").optional({ values: "falsy" }).isLength({ min: 6 }).withMessage("password invalido"),
    body("houseId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("houseId invalido"),
    body("role").trim().isIn(["admin", "operator", "resident"]).withMessage("role invalido")
  ],
  validate,
  updateUser
);

router.delete(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido")],
  validate,
  deleteUser
);

module.exports = router;
