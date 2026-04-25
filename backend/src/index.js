require("dotenv").config();
console.log("Environment loaded, NODE_ENV:", process.env.NODE_ENV);

const app = require("./app");
console.log("App module loaded");

const { sequelize } = require("./models");
console.log("Models loaded");

const { validateRuntimeConfig, shouldSyncSchema } = require("./config/env");
console.log("Config validation loaded");

const { runMigrations } = require("./db/migrate");
console.log("Migrations loaded");

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
const syncSchemaEnabled = shouldSyncSchema();
const shouldAlterSchema = syncSchemaEnabled && !isProd && process.env.DB_SYNC_ALTER === "true";
const shouldRunMigrations = process.env.DB_RUN_MIGRATIONS !== "false";

console.log("Starting server with config:", {
  PORT,
  isProd,
  syncSchemaEnabled,
  shouldAlterSchema,
  shouldRunMigrations
});

async function start() {
  try {
    console.log("Validating runtime config...");
    validateRuntimeConfig();

    console.log("Authenticating database connection...");
    await sequelize.authenticate();
    console.log("Database connection successful");

    if (shouldRunMigrations) {
      console.log("Running migrations...");
      await runMigrations(sequelize);
      console.log("Migrations completed");
    }

    if (syncSchemaEnabled) {
      console.log("Syncing schema...");
      await sequelize.sync({ alter: shouldAlterSchema });
      console.log("Schema sync completed");
    }

    console.log(`Starting server on port ${PORT}...`);
    app.listen(PORT, () => {
      console.log(`API lista en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Error al iniciar:", error);
    process.exit(1);
  }
}

start();
