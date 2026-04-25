const sequelize = require("../db/sequelize");
const HouseModel = require("./House");
const UserModel = require("./User");
const DeviceModel = require("./Device");
const ReadingModel = require("./Reading");
const AlertModel = require("./Alert");

const House = HouseModel(sequelize);
const User = UserModel(sequelize);
const Device = DeviceModel(sequelize);
const Reading = ReadingModel(sequelize);
const Alert = AlertModel(sequelize);

House.hasMany(Device, { foreignKey: "house_id" });
Device.belongsTo(House, { foreignKey: "house_id" });

House.hasMany(User, { foreignKey: "house_id" });
User.belongsTo(House, { foreignKey: "house_id" });

Device.hasMany(Reading, { foreignKey: "device_id" });
Reading.belongsTo(Device, { foreignKey: "device_id" });

Device.hasMany(Alert, { foreignKey: "device_id" });
Alert.belongsTo(Device, { foreignKey: "device_id" });

module.exports = {
  sequelize,
  House,
  User,
  Device,
  Reading,
  Alert
};
