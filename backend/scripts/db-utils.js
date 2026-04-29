const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dotenv = require("dotenv");

const backendRoot = path.resolve(__dirname, "..");

const parseArgs = (argv) => {
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const equalIndex = withoutPrefix.indexOf("=");

    if (equalIndex !== -1) {
      const key = withoutPrefix.slice(0, equalIndex);
      options[key] = withoutPrefix.slice(equalIndex + 1);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options[withoutPrefix] = next;
      index += 1;
    } else {
      options[withoutPrefix] = true;
    }
  }

  return { options, positionals };
};

const loadEnvFile = (envFile) => {
  if (!envFile) return null;

  const absolutePath = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(absolutePath)) return null;

  const result = dotenv.config({ path: absolutePath, override: false });
  if (result.error) throw result.error;

  return absolutePath;
};

const isPlaceholder = (value) =>
  !value ||
  value.includes("${{") ||
  value.includes("pon_") ||
  value.includes("replace_with") ||
  value.includes("change_this");

const normalizeDatabaseConfig = (config, label) => {
  const missing = ["host", "port", "user", "database"].filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`${label}: faltan valores de conexion: ${missing.join(", ")}`);
  }

  return {
    host: config.host,
    port: Number(config.port || 3306),
    user: config.user,
    password: config.password || "",
    database: config.database
  };
};

const parseDatabaseUrl = (rawUrl, label) => {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new Error(`${label}: DATABASE_URL no es una URL valida`);
  }

  if (!["mysql:", "mysql2:", "mariadb:"].includes(url.protocol)) {
    throw new Error(`${label}: la URL debe usar mysql:// o mariadb://`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

  return normalizeDatabaseConfig(
    {
      host: url.hostname,
      port: url.port || 3306,
      user: decodeURIComponent(url.username || ""),
      password: decodeURIComponent(url.password || ""),
      database
    },
    label
  );
};

const readDatabaseConfig = ({ env = process.env, label, urlVars, allowDbVars = true }) => {
  for (const name of urlVars) {
    const value = env[name];
    if (!isPlaceholder(value)) {
      return parseDatabaseUrl(value, `${label} (${name})`);
    }
  }

  if (!allowDbVars) {
    throw new Error(
      `${label}: define una de estas variables: ${urlVars.join(", ")}`
    );
  }

  return normalizeDatabaseConfig(
    {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASS,
      database: env.DB_NAME
    },
    label
  );
};

const isLocalHost = (host) =>
  ["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"].includes(
    String(host).toLowerCase()
  );

const maskTarget = (config) => `${config.user}@${config.host}:${config.port}/${config.database}`;

const quoteOption = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const writeDefaultsFile = (config) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "iot-mysql-"));
  const filePath = path.join(tempDir, "client.cnf");
  const contents = [
    "[client]",
    `host=${quoteOption(config.host)}`,
    `port=${Number(config.port)}`,
    `user=${quoteOption(config.user)}`,
    `password=${quoteOption(config.password)}`,
    "default-character-set=utf8mb4",
    ""
  ].join("\n");

  fs.writeFileSync(filePath, contents, { mode: 0o600 });

  return {
    filePath,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true })
  };
};

const getTimestamp = () =>
  new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const findLatestSqlDump = (dir) => {
  if (!fs.existsSync(dir)) return null;

  const files = fs
    .readdirSync(dir)
    .filter((filename) => filename.endsWith(".sql"))
    .map((filename) => {
      const filePath = path.join(dir, filename);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files[0] ? files[0].filePath : null;
};

module.exports = {
  backendRoot,
  findLatestSqlDump,
  getTimestamp,
  isLocalHost,
  loadEnvFile,
  maskTarget,
  parseArgs,
  readDatabaseConfig,
  writeDefaultsFile
};
