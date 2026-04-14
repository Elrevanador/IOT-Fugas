const express = require("express");
const { getPublicDashboard } = require("../controllers/publicController");

const router = express.Router();

router.get("/dashboard", getPublicDashboard);

module.exports = router;
