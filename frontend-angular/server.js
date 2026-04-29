"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const port = Number.parseInt(process.env.PORT || "8080", 10);
const host = process.env.HOST || "0.0.0.0";
const distDir = path.join(__dirname, "dist", "frontend-angular", "browser");
const indexPath = path.join(distDir, "index.html");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const send = (res, statusCode, body, headers = {}) => {
  res.writeHead(statusCode, headers);
  res.end(body);
};

const sendFile = (res, filePath, cacheControl = "no-cache") => {
  fs.readFile(filePath, (error, body) => {
    if (error) {
      send(res, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not found" : "Server error", {
        "Content-Type": "text/plain; charset=utf-8"
      });
      return;
    }

    send(res, 200, body, {
      "Cache-Control": cacheControl,
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
  });
};

const readApiBaseUrl = () => {
  const raw = process.env.API_BASE_URL || process.env.BACKEND_URL || "";
  return raw.trim().replace(/\/+$/, "");
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/health") {
    send(res, 200, JSON.stringify({ ok: true }), { "Content-Type": "application/json; charset=utf-8" });
    return;
  }

  if (requestUrl.pathname === "/app-config.js") {
    const apiBaseUrl = JSON.stringify(readApiBaseUrl());
    send(
      res,
      200,
      `window.__APP_CONFIG__ = window.__APP_CONFIG__ || { apiBaseUrl: ${apiBaseUrl} };\n`,
      {
        "Cache-Control": "no-store",
        "Content-Type": "text/javascript; charset=utf-8"
      }
    );
    return;
  }

  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(distDir, safePath);

  if (!filePath.startsWith(distDir)) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      const immutableAsset = /\.(?:css|js|woff2?|ttf|ico|png|svg)$/.test(filePath);
      sendFile(res, filePath, immutableAsset ? "public, max-age=31536000, immutable" : "no-cache");
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      sendFile(res, indexPath);
      return;
    }

    send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  });
});

server.listen(port, host, () => {
  console.log(`Frontend listo en http://${host}:${port}`);
});
