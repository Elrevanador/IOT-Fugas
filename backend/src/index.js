require("dotenv").config();
const app = require("./app");
const { sequelize } = require("./models");
const { validateRuntimeConfig } = require("./config/env");
const { runMigrations } = require("./db/migrate");

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
const shouldSyncSchema = process.env.DB_USE_SYNC !== "false";
const shouldAlterSchema = shouldSyncSchema && !isProd && process.env.DB_SYNC_ALTER === "true";
const shouldRunMigrations = process.env.DB_RUN_MIGRATIONS !== "false";

async function start() {
  try {
    validateRuntimeConfig();
    await sequelize.authenticate();
    if (shouldRunMigrations) {
      await runMigrations(sequelize);
    }
    if (shouldSyncSchema) {
      await sequelize.sync({ alter: shouldAlterSchema });
    }
    app.listen(PORT, () => {
      console.log(`API lista en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Error al iniciar:", error);
    process.exit(1);
  }
}

start();
