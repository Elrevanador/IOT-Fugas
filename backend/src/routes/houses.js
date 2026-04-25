const express = require("express");
const { body, param } = require("express-validator");
const {
  listHouses,
  getHouse,
  createHouse,
  updateHouse,
  deleteHouse
} = require("../controllers/housesController");
const auth = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();

const houseBodyValidators = [
  body("name").trim().isLength({ min: 3 }).withMessage("name invalido"),
  body("address").trim().isLength({ min: 5 }).withMessage("address invalido"),
  body("owner_name").trim().isLength({ min: 3 }).withMessage("owner_name invalido"),
  body("contact_phone").trim().isLength({ min: 7, max: 40 }).withMessage("contact_phone invalido"),
  body("status")
    .optional({ values: "falsy" })
    .trim()
    .isIn(["ACTIVA", "INACTIVA", "MANTENIMIENTO"])
    .withMessage("status invalido")
];

const houseUpdateValidators = [
  body("name").optional().trim().isLength({ min: 3 }).withMessage("name invalido"),
  body("code").optional().trim().isLength({ min: 2, max: 64 }).withMessage("code invalido"),
  body("address").optional({ values: "falsy" }).trim().isLength({ min: 5 }).withMessage("address invalido"),
  body("owner_name")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ min: 3 })
    .withMessage("owner_name invalido"),
  body("contact_phone")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ min: 7, max: 40 })
    .withMessage("contact_phone invalido"),
  body("status")
    .optional({ values: "falsy" })
    .trim()
    .isIn(["ACTIVA", "INACTIVA", "MANTENIMIENTO"])
    .withMessage("status invalido")
];

router.get("/", auth, listHouses);
router.get("/:id", auth, [param("id").isInt({ min: 1 }).withMessage("id invalido")], validate, getHouse);
router.post("/", auth, houseBodyValidators, validate, createHouse);
router.put(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido"), ...houseUpdateValidators],
  validate,
  updateHouse
);
router.delete(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 }).withMessage("id invalido")],
  validate,
  deleteHouse
);

module.exports = router;
