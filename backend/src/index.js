require("dotenv").config();
const app = require("./app");
const { sequelize } = require("./models");
const { validateRuntimeConfig, shouldSyncSchema } = require("./config/env");
const { runMigrations } = require("./db/migrate");

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
const syncSchemaEnabled = shouldSyncSchema();
const shouldAlterSchema = syncSchemaEnabled && !isProd && process.env.DB_SYNC_ALTER === "true";
const shouldRunMigrations = process.env.DB_RUN_MIGRATIONS !== "false";

async function start() {
  try {
    validateRuntimeConfig();
    await sequelize.authenticate();
    if (shouldRunMigrations) {
      await runMigrations(sequelize);
    }
    if (syncSchemaEnabled) {
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
