const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_REQUESTS = 10;
const RATE_LIMIT_STORE = new Map();

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getClientIp = (req) => req.ip || req.socket?.remoteAddress || "unknown";

const cleanupIfExpired = (key, now) => {
  const entry = RATE_LIMIT_STORE.get(key);
  if (entry && entry.resetAt <= now) {
    RATE_LIMIT_STORE.delete(key);
    return null;
  }
  return entry || null;
};

const createRateLimiter = ({
  key = "default",
  windowMs = DEFAULT_WINDOW_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
  message = "Demasiadas solicitudes, intenta de nuevo mas tarde"
} = {}) => {
  const resolvedWindowMs = toPositiveInt(windowMs, DEFAULT_WINDOW_MS);
  const resolvedMaxRequests = toPositiveInt(maxRequests, DEFAULT_MAX_REQUESTS);

  return (req, res, next) => {
    const now = Date.now();
    const bucketKey = `${key}:${getClientIp(req)}`;
    let entry = cleanupIfExpired(bucketKey, now);

    if (!entry) {
      entry = { count: 0, resetAt: now + resolvedWindowMs };
      RATE_LIMIT_STORE.set(bucketKey, entry);
    }

    entry.count += 1;

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader("Retry-After", retryAfterSeconds);
    res.setHeader("X-RateLimit-Limit", resolvedMaxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, resolvedMaxRequests - entry.count));

    if (entry.count > resolvedMaxRequests) {
      return res.status(429).json({
        ok: false,
        msg: message
      });
    }

    return next();
  };
};

module.exports = createRateLimiter;
