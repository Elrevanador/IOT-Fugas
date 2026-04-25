const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const readingsRoutes = require("./routes/readings");
const alertsRoutes = require("./routes/alerts");
const devicesRoutes = require("./routes/devices");
const housesRoutes = require("./routes/houses");
const locationsRoutes = require("./routes/locations");
const sensorsRoutes = require("./routes/sensors");
const incidentsRoutes = require("./routes/incidents");
const valvesRoutes = require("./routes/valves");
const detectionConfigRoutes = require("./routes/detectionConfig");
const commandsRoutes = require("./routes/commands");
const auditRoutes = require("./routes/audit");
const publicRoutes = require("./routes/public");
const errorHandler = require("./middlewares/errorHandler");
const requestMeta = require("./middlewares/requestMeta");
const requestLogger = require("./middlewares/requestLogger");
const { getTrustProxySetting } = require("./config/env");

const app = express();
app.set("trust proxy", getTrustProxySetting());
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

const routeGroups = [
  {
    name: "Sistema",
    routes: [
      ["GET", "/"],
      ["GET", "/api/health"]
    ]
  },
  {
    name: "Autenticacion",
    routes: [
      ["POST", "/api/auth/register"],
      ["POST", "/api/auth/login"],
      ["GET", "/api/auth/me"]
    ]
  },
  {
    name: "Casas y usuarios",
    routes: [
      ["GET", "/api/houses"],
      ["GET", "/api/houses/:id"],
      ["POST", "/api/houses"],
      ["PUT", "/api/houses/:id"],
      ["DELETE", "/api/houses/:id"],
      ["GET", "/api/users"],
      ["POST", "/api/users"],
      ["PUT", "/api/users/:id"],
      ["DELETE", "/api/users/:id"]
    ]
  },
  {
    name: "Dispositivos y sensores",
    routes: [
      ["GET", "/api/devices"],
      ["POST", "/api/devices"],
      ["PUT", "/api/devices/:id"],
      ["DELETE", "/api/devices/:id"],
      ["POST", "/api/devices/:id/credentials"],
      ["GET", "/api/locations"],
      ["POST", "/api/locations"],
      ["PUT", "/api/locations/:id"],
      ["DELETE", "/api/locations/:id"],
      ["GET", "/api/sensors"],
      ["POST", "/api/sensors"],
      ["PUT", "/api/sensors/:id"],
      ["DELETE", "/api/sensors/:id"]
    ]
  },
  {
    name: "Lecturas, alertas e incidentes",
    routes: [
      ["POST", "/api/readings"],
      ["GET", "/api/readings"],
      ["GET", "/api/readings/latest"],
      ["GET", "/api/alerts"],
      ["PATCH", "/api/alerts/:id/ack"],
      ["GET", "/api/incidents"],
      ["GET", "/api/incidents/:id"],
      ["PATCH", "/api/incidents/:id/status"]
    ]
  },
  {
    name: "Valvula, comandos y deteccion",
    routes: [
      ["GET", "/api/valves"],
      ["GET", "/api/valves/device/:deviceId"],
      ["GET", "/api/valves/device/:deviceId/actions"],
      ["POST", "/api/valves/device/:deviceId/actions"],
      ["GET", "/api/detection-config/:deviceId"],
      ["PUT", "/api/detection-config/:deviceId"],
      ["GET", "/api/commands"],
      ["POST", "/api/commands"],
      ["GET", "/api/commands/pending"],
      ["POST", "/api/commands/:id/response"]
    ]
  },
  {
    name: "Dashboard y auditoria",
    routes: [
      ["GET", "/api/public/dashboard"],
      ["GET", "/api/public/dashboard/stream"],
      ["GET", "/api/audit"]
    ]
  }
];

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const renderRouteDebugPage = ({ req, statusCode = 200, title = "IoT Water Backend" }) => {
  const requestUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const routeList = routeGroups
    .map(
      (group) => `<section class="route-group">
        <h2>${escapeHtml(group.name)}</h2>
        <ol>
          ${group.routes
            .map(([method, path]) => `<li><span class="method">${method}</span> <code>${escapeHtml(path)}</code></li>`)
            .join("")}
        </ol>
      </section>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: #111;
        background: #f1f1f1;
      }
      header {
        padding: 6px 8px 12px;
        background: #ffffcc;
        border-bottom: 1px solid #cfcfcf;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 31px;
        line-height: 1.2;
        font-weight: 400;
      }
      .status {
        color: ${statusCode >= 400 ? "#666" : "#1f6f50"};
        font-size: 18px;
      }
      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 4px 12px;
        margin: 0 0 0 38px;
      }
      dt {
        font-weight: 700;
        color: #666;
        text-align: right;
      }
      dd { margin: 0; }
      main {
        padding: 10px 6px 28px;
        background: #f7f7f7;
      }
      .lead {
        margin: 0 0 12px;
        font-size: 16px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px 20px;
      }
      .route-group {
        min-width: 0;
      }
      h2 {
        margin: 8px 0 6px;
        font-size: 15px;
        color: #333;
      }
      ol {
        margin: 0 0 0 38px;
        padding: 0;
      }
      li {
        margin: 2px 0;
        line-height: 1.35;
      }
      .method {
        display: inline-block;
        min-width: 54px;
        font-weight: 700;
        color: #0f766e;
      }
      code {
        font-family: Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 13px;
      }
      .note {
        margin-top: 16px;
        padding-top: 10px;
        border-top: 1px solid #d3d3d3;
        font-size: 15px;
      }
      .note p {
        margin: 0 0 8px;
      }
      @media (max-width: 640px) {
        h1 { font-size: 26px; }
        dl {
          margin-left: 0;
          grid-template-columns: 1fr;
          gap: 2px;
        }
        dt { text-align: left; }
        ol { margin-left: 24px; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(title)} <span class="status">(${statusCode})</span></h1>
      <dl>
        <dt>Metodo de solicitud:</dt>
        <dd>${escapeHtml(req.method)}</dd>
        <dt>URL de la solicitud:</dt>
        <dd>${escapeHtml(requestUrl)}</dd>
        <dt>Modo:</dt>
        <dd>${isProduction ? "production" : "development"}</dd>
      </dl>
    </header>
    <main>
      <p class="lead">Usando la configuracion de rutas definida en <code>backend/src/app.js</code>, Express tiene disponibles estos patrones:</p>
      <div class="grid">${routeList}</div>
      <div class="note">
        <p><strong>Prueba rapida:</strong> abre <code>/api/health</code>. Si responde <code>{"ok":true}</code>, el backend esta arriba.</p>
        <p><strong>Nota:</strong> varias rutas requieren token JWT; las rutas del ESP32 requieren <code>x-device-key</code>.</p>
      </div>
    </main>
  </body>
</html>`;
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
  res.type("html").send(renderRouteDebugPage({ req, title: "IoT Water Backend" }));
});

app.get("/api/docs", (req, res) => {
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
            <li><span class="method">GET</span><code>/api/sensors</code></li>
            <li><span class="method">GET</span><code>/api/valves</code></li>
          </ul>
        </article>

        <article class="panel">
          <h2>Operacion</h2>
          <ul>
            <li><span class="method">GET</span><code>/api/incidents</code></li>
            <li><span class="method">GET</span><code>/api/commands</code></li>
            <li><span class="method">GET</span><code>/api/detection-config/:deviceId</code></li>
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
  -d '{"nombre":"Duvan","email":"duvan@test.com","password":"123456"}'

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
app.use("/api/locations", locationsRoutes);
app.use("/api/sensors", sensorsRoutes);
app.use("/api/incidents", incidentsRoutes);
app.use("/api/valves", valvesRoutes);
app.use("/api/detection-config", detectionConfigRoutes);
app.use("/api/commands", commandsRoutes);
app.use("/api/audit", auditRoutes);

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      ok: false,
      msg: "Ruta no encontrada",
      method: req.method,
      path: req.originalUrl
    });
  }

  return res.status(404).type("html").send(
    renderRouteDebugPage({
      req,
      statusCode: 404,
      title: "Pagina no encontrada"
    })
  );
});

app.use(errorHandler);

module.exports = app;
