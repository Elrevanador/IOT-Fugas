require("dotenv").config();

const sequelize = require("./sequelize");
const { runMigrations } = require("./migrate");

async function main() {
  try {
    await sequelize.authenticate();
    await runMigrations(sequelize);
    console.log("Migraciones aplicadas correctamente");
    await sequelize.close();
  } catch (error) {
    console.error("Error al ejecutar migraciones:", error);
    process.exit(1);
  }
}

main();
