const express = require("express");
const { listDevices } = require("../controllers/devicesController");
const auth = require("../middlewares/auth");

const router = express.Router();

router.get("/", auth, listDevices);

module.exports = router;
