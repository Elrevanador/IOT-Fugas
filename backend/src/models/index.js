const sequelize = require("../db/sequelize");
const UserModel = require("./User");
const DeviceModel = require("./Device");
const ReadingModel = require("./Reading");
const AlertModel = require("./Alert");

const User = UserModel(sequelize);
const Device = DeviceModel(sequelize);
const Reading = ReadingModel(sequelize);
const Alert = AlertModel(sequelize);

Device.hasMany(Reading, { foreignKey: "device_id" });
Reading.belongsTo(Device, { foreignKey: "device_id" });

Device.hasMany(Alert, { foreignKey: "device_id" });
Alert.belongsTo(Device, { foreignKey: "device_id" });

module.exports = {
  sequelize,
  User,
  Device,
  Reading,
  Alert
};
