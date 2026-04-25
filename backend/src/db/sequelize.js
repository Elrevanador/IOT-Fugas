const { Sequelize } = require("sequelize");

const {
  DB_HOST = "localhost",
  DB_PORT = "3306",
  DB_USER = "root",
  DB_PASS = "",
  DB_NAME = "iot_water",
  DATABASE_URL
} = process.env;

let sequelize;

try {
  if (DATABASE_URL) {
    sequelize = new Sequelize(DATABASE_URL, {
      dialect: "mysql",
      logging: false,
      timezone: "-05:00",
      dialectOptions: {
        timezone: "-05:00",
        connectTimeout: 60000,
        acquireTimeout: 60000,
        timeout: 60000
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });
  } else {
    sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
      host: DB_HOST,
      port: Number(DB_PORT),
      dialect: "mysql",
      logging: false,
      timezone: "-05:00",
      dialectOptions: {
        timezone: "-05:00",
        connectTimeout: 60000,
        acquireTimeout: 60000,
        timeout: 60000
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });
  }
} catch (error) {
  console.error("Error creating Sequelize instance:", error);
  throw error;
}

module.exports = sequelize;
