const { buildPublicDashboardPayload } = require("./publicDashboard");

const DASHBOARD_CLIENTS = new Set();
const STREAM_RETRY_MS = 3000;
const STREAM_KEEPALIVE_MS = 15000;

const sendDashboardEvent = (res, payload) => {
  if (res.writableEnded || !res.writable) {
    return false;
  }
  res.write("event: dashboard\n");
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  return true;
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
    if (!res.writableEnded && res.writable) {
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
  const clientsToRemove = [];

  for (const client of Array.from(DASHBOARD_CLIENTS)) {
    try {
      if (client.res.writableEnded || client.res.destroyed) {
        clientsToRemove.push(client);
        continue;
      }

      if (!payloadCache.has(client.scopeKey)) {
        payloadCache.set(client.scopeKey, await buildPublicDashboardPayload(client.user));
      }

      const sent = sendDashboardEvent(client.res, payloadCache.get(client.scopeKey));
      if (!sent) {
        clientsToRemove.push(client);
      }
    } catch (error) {
      console.error(`Error broadcasting to client:`, error);
      clientsToRemove.push(client);
    }
  }

  // Cleanup en batch
  clientsToRemove.forEach(client => DASHBOARD_CLIENTS.delete(client));
};

module.exports = { attachDashboardStream, broadcastDashboardUpdate };

