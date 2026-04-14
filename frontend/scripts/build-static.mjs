import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "..");
const distDir = path.join(frontendDir, "dist");
const apiBaseUrl = (process.env.PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const entries = [
  "index.html",
  "styles.css",
  "common.js",
  "config.js",
  "login",
  "register",
  "dashboard"
];

entries.forEach((entry) => {
  const sourcePath = path.join(frontendDir, entry);
  if (!existsSync(sourcePath)) {
    throw new Error(`No se encontro ${sourcePath}`);
  }

  const targetPath = path.join(distDir, entry);
  cpSync(sourcePath, targetPath, { recursive: true });
});

const configPath = path.join(distDir, "config.js");
const renderedConfig = readFileSync(configPath, "utf8").replace(
  /__API_BASE_URL__/g,
  apiBaseUrl.replace(/\$/g, "$$$$")
);

writeFileSync(configPath, renderedConfig, "utf8");

console.log(
  `Frontend estatico generado en ${distDir}${apiBaseUrl ? ` con API ${apiBaseUrl}` : " usando misma URL/origen"}`
);
