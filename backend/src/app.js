const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const readingsRoutes = require("./routes/readings");
const alertsRoutes = require("./routes/alerts");
const devicesRoutes = require("./routes/devices");
const housesRoutes = require("./routes/houses");
const publicRoutes = require("./routes/public");
const errorHandler = require("./middlewares/errorHandler");
const requestMeta = require("./middlewares/requestMeta");
const requestLogger = require("./middlewares/requestLogger");

const app = express();
app.set("trust proxy", true);
const isProduction = process.env.NODE_ENV === "production";
const defaultDevOrigins = ["http://localhost:8000", "http://127.0.0.1:8000"];
const allowedOriginEnv = process.env.FRONTEND_ORIGIN || "";
const allowedOrigins = new Set(
  allowedOriginEnv
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

if (!isProduction) {
  defaultDevOrigins.forEach((origin) => allowedOrigins.add(origin));
}

const allowAllOrigins = allowedOrigins.has("*");

const isPrivateIpv4Host = (hostname) => {
  if (/^127(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(hostname)) return true;

  const match172 = hostname.match(/^172\.(\d{1,3})(?:\.\d{1,3}){2}$/);
  if (match172) {
    const secondOctet = Number(match172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
};

const isDevelopmentNetworkOrigin = (origin) => {
  if (isProduction) return false;

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname;

    return hostname === "localhost" || hostname === "::1" || isPrivateIpv4Host(hostname);
  } catch {
    return false;
  }
};

app.use(requestMeta);
app.use(requestLogger);
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowAllOrigins) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin) || isDevelopmentNetworkOrigin(origin)) {
        return callback(null, true);
      }

      const error = new Error(`CORS origin denied: ${origin}`);
      error.status = 403;
      callback(error);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "x-device-key", "x-api-key"],
    optionsSuccessStatus: 204
  })
);

app.get("/", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>IoT Water Backend</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f7fb;
        --panel: #ffffff;
        --text: #172033;
        --muted: #5a6780;
        --line: #d9e2f0;
        --accent: #0f766e;
        --badge: #e6fffb;
        --accent-strong: #115e59;
        --code-bg: #0f172a;
        --code-text: #e2e8f0;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #eef6ff 0%, var(--bg) 100%);
        color: var(--text);
      }
      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 40px 20px 64px;
      }
      .hero,
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
      }
      .hero {
        padding: 28px;
        margin-bottom: 20px;
      }
      .hero h1 {
        margin: 0 0 10px;
        font-size: 2rem;
      }
      .hero p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .hero strong {
        color: var(--accent-strong);
      }
      .meta {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 16px;
      }
      .badge {
        display: inline-block;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--badge);
        color: var(--accent);
        border: 1px solid #b7f0e8;
        font-size: 0.92rem;
        font-weight: 600;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }
      .wide {
        grid-column: 1 / -1;
      }
      .panel {
        padding: 20px;
      }
      .panel h2 {
        margin: 0 0 14px;
        font-size: 1.1rem;
      }
      .panel p {
        margin: 0 0 14px;
        color: var(--muted);
        line-height: 1.5;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      li + li {
        margin-top: 10px;
      }
      code {
        font-family: "Fira Code", "Cascadia Code", monospace;
        background: #f5f7fb;
        border: 1px solid #e4e9f2;
        border-radius: 8px;
        padding: 2px 6px;
        word-break: break-word;
      }
      .method {
        font-weight: 700;
        color: var(--accent);
        margin-right: 6px;
      }
      pre {
        margin: 0;
        padding: 14px 16px;
        border-radius: 14px;
        background: var(--code-bg);
        color: var(--code-text);
        overflow-x: auto;
        border: 1px solid #1e293b;
      }
      pre code {
        background: transparent;
        border: 0;
        padding: 0;
        color: inherit;
      }
      .steps {
        display: grid;
        gap: 12px;
      }
      .step {
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: #fbfdff;
      }
      .step strong {
        display: block;
        margin-bottom: 6px;
      }
      .hint {
        font-size: 0.95rem;
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>IoT Water Backend</h1>
        <p>Backend activo. Este servicio expone la API y esta listo para pruebas desde navegador, <strong>curl</strong>, Postman o Insomnia.</p>
        <div class="meta">
          <span class="badge">Modo: ${isProduction ? "production" : "development"}</span>
          <span class="badge">Base URL: ${baseUrl}</span>
        </div>
      </section>

      <section class="grid">
        <article class="panel">
          <h2>Prueba Rapida</h2>
          <ul>
            <li><span class="method">GET</span><code>/api/health</code></li>
            <li><span class="method">GET</span><code>/api/readings/latest</code></li>
            <li><span class="method">GET</span><code>/api/public/dashboard</code></li>
          </ul>
        </article>

        <article class="panel">
          <h2>Como Probar</h2>
          <div class="steps">
            <div class="step">
              <strong>1. Verifica que el backend responde</strong>
              <span class="hint">Abre <code>${baseUrl}/api/health</code> en el navegador.</span>
            </div>
            <div class="step">
              <strong>2. Prueba autenticacion</strong>
              <span class="hint">Usa <code>POST /api/auth/register</code> y luego <code>POST /api/auth/login</code>.</span>
            </div>
            <div class="step">
              <strong>3. Simula una lectura del dispositivo</strong>
              <span class="hint">Enviala a <code>POST /api/readings</code> con el header <code>x-device-key</code>.</span>
            </div>
          </div>
        </article>

        <article class="panel">
          <h2>Autenticacion</h2>
          <ul>
            <li><span class="method">POST</span><code>/api/auth/register</code></li>
            <li><span class="method">POST</span><code>/api/auth/login</code></li>
            <li><span class="method">GET</span><code>/api/auth/me</code></li>
          </ul>
        </article>

        <article class="panel">
          <h2>Casas</h2>
          <ul>
            <li><span class="method">GET</span><code>/api/houses</code></li>
            <li><span class="method">GET</span><code>/api/houses/:id</code></li>
            <li><span class="method">POST</span><code>/api/houses</code></li>
            <li><span class="method">PUT</span><code>/api/houses/:id</code></li>
            <li><span class="method">DELETE</span><code>/api/houses/:id</code></li>
          </ul>
        </article>

        <article class="panel">
          <h2>Lecturas</h2>
          <ul>
            <li><span class="method">POST</span><code>/api/readings</code></li>
            <li><span class="method">GET</span><code>/api/readings</code></li>
            <li><span class="method">GET</span><code>/api/readings/latest</code></li>
          </ul>
        </article>

        <article class="panel">
          <h2>Alertas</h2>
          <ul>
            <li><span class="method">GET</span><code>/api/alerts</code></li>
            <li><span class="method">PATCH</span><code>/api/alerts/:id/ack</code></li>
          </ul>
        </article>

        <article class="panel">
          <h2>Dispositivos</h2>
          <ul>
            <li><span class="method">GET</span><code>/api/devices</code></li>
          </ul>
        </article>

        <article class="panel">
          <h2>Publico</h2>
          <ul>
            <li><span class="method">GET</span><code>/api/public/dashboard</code></li>
            <li><span class="method">GET</span><code>/api/public/dashboard/stream</code></li>
          </ul>
        </article>

        <article class="panel wide">
          <h2>Pruebas Con curl</h2>
          <p>Reemplaza los valores de ejemplo por los tuyos si hace falta. La URL ya queda armada con este despliegue.</p>
<pre><code>curl ${baseUrl}/api/health</code></pre>
        </article>

        <article class="panel wide">
          <h2>Registro y Login</h2>
<pre><code>curl -X POST ${baseUrl}/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Duvan","email":"duvan@test.com","password":"123456"}'

curl -X POST ${baseUrl}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"duvan@test.com","password":"123456"}'</code></pre>
        </article>

        <article class="panel wide">
          <h2>Lectura Del Dispositivo</h2>
<pre><code>curl -X POST ${baseUrl}/api/readings \\
  -H "Content-Type: application/json" \\
  -H "x-device-key: TU_INGEST_API_KEY" \\
  -d '{"deviceName":"ESP32-WOKWI-01","flow_lmin":1.8,"pressure_kpa":100.4,"risk":62,"state":"ALERTA"}'

curl ${baseUrl}/api/readings/latest</code></pre>
        </article>

        <article class="panel wide">
          <h2>Notas</h2>
          <ul>
            <li>Si <code>/api/health</code> responde <code>{"ok":true}</code>, el backend esta arriba.</li>
            <li>Si falla <code>/api/readings</code>, revisa que <code>x-device-key</code> coincida con <code>INGEST_API_KEY</code>.</li>
            <li>Si falla login o registro, revisa los logs del deploy y la conexion a MySQL.</li>
          </ul>
        </article>
      </section>
    </main>
  </body>
</html>`;

  res.type("html").send(html);
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/houses", housesRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/readings", readingsRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/devices", devicesRoutes);

app.use(errorHandler);

module.exports = app;
