const { buildPublicDashboardPayload } = require("./publicDashboard");

const DASHBOARD_CLIENTS = new Set();
const STREAM_RETRY_MS = 3000;
const STREAM_KEEPALIVE_MS = 15000;

const sendDashboardEvent = (res, payload) => {
  res.write("event: dashboard\n");
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const buildScopeKey = (user) => `${user?.houseId || "all"}:${user?.role || "guest"}`;

const attachDashboardStream = (req, res, initialPayload, user) => {
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();
  res.write(`retry: ${STREAM_RETRY_MS}\n\n`);

  const client = { res, user, scopeKey: buildScopeKey(user) };
  DASHBOARD_CLIENTS.add(client);

  const keepAlive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": keepalive\n\n");
    }
  }, STREAM_KEEPALIVE_MS);

  const cleanup = () => {
    clearInterval(keepAlive);
    DASHBOARD_CLIENTS.delete(client);
  };

  req.on("close", cleanup);
  req.on("end", cleanup);

  sendDashboardEvent(res, initialPayload);
};

const broadcastDashboardUpdate = async () => {
  if (!DASHBOARD_CLIENTS.size) return;
  const payloadCache = new Map();

  for (const client of Array.from(DASHBOARD_CLIENTS)) {
    if (client.res.writableEnded) {
      DASHBOARD_CLIENTS.delete(client);
      continue;
    }

    if (!payloadCache.has(client.scopeKey)) {
      payloadCache.set(client.scopeKey, await buildPublicDashboardPayload(client.user));
    }

    sendDashboardEvent(client.res, payloadCache.get(client.scopeKey));
  }
};

module.exports = { attachDashboardStream, broadcastDashboardUpdate };
