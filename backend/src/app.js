const path = require("node:path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const readingsRoutes = require("./routes/readings");
const alertsRoutes = require("./routes/alerts");
const devicesRoutes = require("./routes/devices");
const publicRoutes = require("./routes/public");
const errorHandler = require("./middlewares/errorHandler");

const app = express();
const publicDir = path.join(__dirname, "..", "public");
const isProduction = process.env.NODE_ENV === "production";
const defaultDevOrigins = ["http://localhost:8000", "http://127.0.0.1:8000"];
const allowedOriginEnv = process.env.FRONTEND_ORIGIN || "";
const allowedOrigins = new Set(
  allowedOriginEnv
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

if (!isProduction) {
  defaultDevOrigins.forEach((origin) => allowedOrigins.add(origin));
}

const allowAllOrigins = allowedOrigins.has("*");

const isPrivateIpv4Host = (hostname) => {
  if (/^127(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(hostname)) return true;

  const match172 = hostname.match(/^172\.(\d{1,3})(?:\.\d{1,3}){2}$/);
  if (match172) {
    const secondOctet = Number(match172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
};

const isDevelopmentNetworkOrigin = (origin) => {
  if (isProduction) return false;

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname;

    return hostname === "localhost" || hostname === "::1" || isPrivateIpv4Host(hostname);
  } catch {
    return false;
  }
};

app.use(express.json());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowAllOrigins) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin) || isDevelopmentNetworkOrigin(origin)) {
        return callback(null, true);
      }

      const error = new Error(`CORS origin denied: ${origin}`);
      error.status = 403;
      callback(error);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-device-key"],
    optionsSuccessStatus: 204
  })
);

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/readings", readingsRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/devices", devicesRoutes);

app.get(/^\/login$/, (req, res) => res.redirect(301, "/login/"));
app.get(/^\/register$/, (req, res) => res.redirect(301, "/register/"));
app.get(/^\/dashboard$/, (req, res) => res.redirect(301, "/dashboard/"));
app.use(express.static(publicDir));

app.use(errorHandler);

module.exports = app;
