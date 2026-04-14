require("dotenv").config();
const app = require("./app");
const { sequelize } = require("./models");
const { validateRuntimeConfig } = require("./config/env");

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
const shouldAlterSchema = !isProd && process.env.DB_SYNC_ALTER === "true";

async function start() {
  try {
    validateRuntimeConfig();
    await sequelize.authenticate();
    await sequelize.sync({ alter: shouldAlterSchema });
    app.listen(PORT, () => {
      console.log(`API lista en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Error al iniciar:", error);
    process.exit(1);
  }
}

start();
