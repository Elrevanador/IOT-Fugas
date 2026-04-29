#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  backendRoot,
  findLatestSqlDump,
  isLocalHost,
  loadEnvFile,
  maskTarget,
  parseArgs,
  readDatabaseConfig,
  writeDefaultsFile
} = require("./db-utils");

const help = `Uso:
  npm run db:restore -- backups/iot_water.sql --yes
  npm run db:restore -- --env-file .env.railway.local backups/iot_water.sql --yes

Importa un dump completo en TARGET_DATABASE_URL, RAILWAY_DATABASE_URL o DATABASE_URL.
Por seguridad requiere --yes y bloquea destinos localhost salvo que agregues --allow-local-target.
`;

const { options, positionals } = parseArgs(process.argv.slice(2));

if (options.help || options.h) {
  console.log(help);
  process.exit(0);
}

try {
  const defaultRailwayEnv = path.join(backendRoot, ".env.railway.local");
  const envFile = options["env-file"] || (fs.existsSync(defaultRailwayEnv) ? defaultRailwayEnv : null);
  const loadedEnvFile = loadEnvFile(envFile);

  const inputPath = positionals[0]
    ? path.resolve(process.cwd(), positionals[0])
    : findLatestSqlDump(path.join(backendRoot, "backups"));

  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error("no se encontro el archivo .sql a importar");
  }

  const target = readDatabaseConfig({
    label: "destino",
    urlVars: ["TARGET_DATABASE_URL", "RAILWAY_DATABASE_URL", "DATABASE_URL"],
    allowDbVars: options["allow-db-vars"] === true
  });

  if (isLocalHost(target.host) && options["allow-local-target"] !== true) {
    throw new Error(
      "el destino parece localhost. Agrega --allow-local-target solo si quieres restaurar localmente"
    );
  }

  console.log(`Destino: ${maskTarget(target)}`);
  if (loadedEnvFile) console.log(`Variables: ${loadedEnvFile}`);
  console.log(`Dump: ${inputPath}`);

  if (options.yes !== true) {
    throw new Error("este comando reemplazara datos. Vuelve a ejecutarlo con --yes para confirmar");
  }

  if (options["dry-run"]) {
    console.log("Dry run: no se importo ningun dump.");
    process.exit(0);
  }

  const defaults = writeDefaultsFile(target);
  const inFd = fs.openSync(inputPath, "r");

  try {
    const args = [
      `--defaults-extra-file=${defaults.filePath}`,
      "--binary-mode=1",
      target.database
    ];

    const result = spawnSync("mysql", args, {
      stdio: [inFd, "inherit", "inherit"]
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`mysql termino con codigo ${result.status}`);
    }
  } finally {
    fs.closeSync(inFd);
    defaults.cleanup();
  }

  console.log("Dump importado correctamente.");
} catch (error) {
  console.error(`Error al importar backup: ${error.message}`);
  process.exit(1);
}
