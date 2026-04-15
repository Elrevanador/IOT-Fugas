const express = require("express");
const { getPublicDashboard, streamPublicDashboard } = require("../controllers/publicController");
const auth = require("../middlewares/auth");

const router = express.Router();

router.get("/dashboard", auth, getPublicDashboard);
router.get("/dashboard/stream", auth, streamPublicDashboard);

module.exports = router;
