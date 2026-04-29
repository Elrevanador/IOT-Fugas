const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === "production"
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
  ),
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === "production"
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
    }),
    // En producción, agregar archivo
    ...(process.env.NODE_ENV === "production" ? [
      new winston.transports.File({
        filename: "logs/error.log",
        level: "error"
      }),
      new winston.transports.File({
        filename: "logs/combined.log"
      })
    ] : [])
  ]
});

// Si estamos en desarrollo, crear directorio logs
if (process.env.NODE_ENV !== "production") {
  const fs = require("fs");
  if (!fs.existsSync("logs")) {
    fs.mkdirSync("logs");
  }
}

module.exports = logger;