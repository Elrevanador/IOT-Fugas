const { Sequelize } = require("sequelize");

const {
  DB_HOST = "localhost",
  DB_PORT = "3306",
  DB_USER = "root",
  DB_PASS = "",
  DB_NAME = "iot_water",
  DATABASE_URL
} = process.env;

const sequelize = DATABASE_URL
  ? new Sequelize(DATABASE_URL, {
      dialect: "mysql",
      logging: false,
      timezone: "-05:00",
      dialectOptions: {
        timezone: "-05:00"
      }
    })
  : new Sequelize(DB_NAME, DB_USER, DB_PASS, {
      host: DB_HOST,
      port: Number(DB_PORT),
      dialect: "mysql",
      logging: false,
      timezone: "-05:00",
      dialectOptions: {
        timezone: "-05:00"
      }
    });

module.exports = sequelize;
