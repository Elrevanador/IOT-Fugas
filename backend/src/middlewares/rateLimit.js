const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('redis');

const createRateLimiter = ({
  key = "default",
  windowMs = 15 * 60 * 1000,
  maxRequests = 10,
  message = "Demasiadas solicitudes, intenta de nuevo mas tarde"
} = {}) => {
  // Intentar usar Redis si las variables de entorno están configuradas
  if (process.env.REDIS_HOST || process.env.REDIS_PORT) {
    try {
      const redisClient = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      });

      return rateLimit({
        store: new RedisStore({
          sendCommand: (...args) => redisClient.sendCommand(args),
        }),
        windowMs,
        max: maxRequests,
        message: { ok: false, msg: message },
        standardHeaders: true,
        legacyHeaders: false,
      });
    } catch (error) {
      console.warn('Error configurando Redis, usando memoria:', error.message);
    }
  }

  // Fallback a memoria
  console.warn(`Rate limiter usando memoria para key: ${key}. Configura REDIS_HOST para usar Redis.`);
  return rateLimit({
    windowMs,
    max: maxRequests,
    message: { ok: false, msg: message },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = createRateLimiter;
