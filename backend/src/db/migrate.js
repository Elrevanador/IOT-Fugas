const fs = require("node:fs");
const path = require("node:path");

const MIGRATIONS_TABLE = "schema_migrations";
const migrationsDir = path.join(__dirname, "migrations");

const getMigrationFiles = () =>
  fs
    .readdirSync(migrationsDir)
    .filter((filename) => filename.endsWith(".js"))
    .sort();

const ensureMigrationsTable = async (sequelize) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id VARCHAR(255) PRIMARY KEY,
      executed_at DATETIME NOT NULL
    )
  `);
};

const getExecutedMigrationIds = async (sequelize) => {
  const [rows] = await sequelize.query(`SELECT id FROM ${MIGRATIONS_TABLE}`);
  return new Set(rows.map((row) => row.id));
};

const runMigrations = async (sequelize, logger = console) => {
  await ensureMigrationsTable(sequelize);
  const executed = await getExecutedMigrationIds(sequelize);
  const queryInterface = sequelize.getQueryInterface();

  for (const filename of getMigrationFiles()) {
    if (executed.has(filename)) continue;

    const migrationPath = path.join(migrationsDir, filename);
    delete require.cache[migrationPath];
    const migration = require(migrationPath);

    logger.info(`Aplicando migracion ${filename}`);

    await sequelize.transaction(async (transaction) => {
      await migration.up({ sequelize, queryInterface, transaction });
      await sequelize.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (id, executed_at) VALUES (?, NOW())`,
        {
          replacements: [filename],
          transaction
        }
      );
    });
  }
};

module.exports = {
  MIGRATIONS_TABLE,
  runMigrations
};
