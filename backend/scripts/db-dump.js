#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  backendRoot,
  getTimestamp,
  loadEnvFile,
  maskTarget,
  parseArgs,
  readDatabaseConfig,
  writeDefaultsFile
} = require("./db-utils");

const help = `Uso:
  npm run db:dump
  npm run db:dump -- --output backups/iot_water.sql
  npm run db:dump -- --env-file .env

Crea un respaldo completo de esquema + datos desde SOURCE_DATABASE_URL, DATABASE_URL o DB_*.
`;

const { options } = parseArgs(process.argv.slice(2));

if (options.help || options.h) {
  console.log(help);
  process.exit(0);
}

try {
  const envFile = options["env-file"] || path.join(backendRoot, ".env");
  const loadedEnvFile = loadEnvFile(envFile);

  const source = readDatabaseConfig({
    label: "origen",
    urlVars: ["SOURCE_DATABASE_URL", "DATABASE_URL"]
  });

  const defaultOutput = path.join(
    backendRoot,
    "backups",
    `${source.database}-${getTimestamp()}.sql`
  );
  const outputPath = path.resolve(process.cwd(), options.output || defaultOutput);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log(`Origen: ${maskTarget(source)}`);
  if (loadedEnvFile) console.log(`Variables: ${loadedEnvFile}`);
  console.log(`Destino: ${outputPath}`);

  if (options["dry-run"]) {
    console.log("Dry run: no se genero ningun dump.");
    process.exit(0);
  }

  const defaults = writeDefaultsFile(source);
  const outFd = fs.openSync(outputPath, "w", 0o600);

  try {
    const args = [
      `--defaults-extra-file=${defaults.filePath}`,
      "--single-transaction",
      "--quick",
      "--skip-lock-tables",
      "--routines",
      "--triggers",
      "--events",
      "--hex-blob",
      "--no-tablespaces",
      "--set-gtid-purged=OFF",
      "--column-statistics=0",
      source.database
    ];

    const result = spawnSync("mysqldump", args, {
      stdio: ["ignore", outFd, "inherit"]
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`mysqldump termino con codigo ${result.status}`);
    }
  } finally {
    fs.closeSync(outFd);
    defaults.cleanup();
  }

  console.log("Backup completo generado correctamente.");
} catch (error) {
  console.error(`Error al generar backup: ${error.message}`);
  process.exit(1);
}
