const crypto = require("node:crypto");

module.exports = (req, res, next) => {
  const incomingRequestId = req.headers["x-request-id"];
  const requestId =
    typeof incomingRequestId === "string" && incomingRequestId.trim()
      ? incomingRequestId.trim()
      : crypto.randomUUID();

  req.requestId = requestId;
  req.requestStartedAt = Date.now();
  res.setHeader("X-Request-Id", requestId);
  next();
};
