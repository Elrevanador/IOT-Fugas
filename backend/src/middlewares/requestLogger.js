const buildSafePath = (req) => {
  const baseUrl = typeof req.baseUrl === "string" ? req.baseUrl : "";
  const path = typeof req.path === "string" ? req.path : "";
  return `${baseUrl}${path}` || req.originalUrl || req.url || "/";
};

module.exports = (req, res, next) => {
  const startedAt = req.requestStartedAt || Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const safePath = buildSafePath(req);
    const sourceIp = req.ip || req.socket?.remoteAddress || "unknown";

    console.info(
      JSON.stringify({
        type: "http_request",
        requestId: req.requestId || null,
        method: req.method,
        path: safePath,
        status: res.statusCode,
        durationMs,
        ip: sourceIp
      })
    );
  });

  next();
};
