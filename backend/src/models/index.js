const sequelize = require("../db/sequelize");
const HouseModel = require("./House");
const UserModel = require("./User");
const DeviceModel = require("./Device");
const ReadingModel = require("./Reading");
const AlertModel = require("./Alert");
const RoleModel = require("./Role");
const UserRoleModel = require("./UserRole");
const ResourceModel = require("./Resource");
const RoleResourceModel = require("./RoleResource");
const UbicacionInstalacionModel = require("./UbicacionInstalacion");
const SensorModel = require("./Sensor");
const EstadoSistemaModel = require("./EstadoSistema");
const IncidenteFugaModel = require("./IncidenteFuga");
const ElectrovalvulaModel = require("./Electrovalvula");
const AccionValvulaModel = require("./AccionValvula");
const ConfiguracionDeteccionModel = require("./ConfiguracionDeteccion");
const ComandoRemotoModel = require("./ComandoRemoto");
const RespuestaComandoModel = require("./RespuestaComando");
const AuditoriaSistemaModel = require("./AuditoriaSistema");

// ---------- Instancias ----------
const House = HouseModel(sequelize);
const User = UserModel(sequelize);
const Device = DeviceModel(sequelize);
const Reading = ReadingModel(sequelize);
const Alert = AlertModel(sequelize);
const Role = RoleModel(sequelize);
const UserRole = UserRoleModel(sequelize);
const Resource = ResourceModel(sequelize);
const RoleResource = RoleResourceModel(sequelize);
const UbicacionInstalacion = UbicacionInstalacionModel(sequelize);
const Sensor = SensorModel(sequelize);
const EstadoSistema = EstadoSistemaModel(sequelize);
const IncidenteFuga = IncidenteFugaModel(sequelize);
const Electrovalvula = ElectrovalvulaModel(sequelize);
const AccionValvula = AccionValvulaModel(sequelize);
const ConfiguracionDeteccion = ConfiguracionDeteccionModel(sequelize);
const ComandoRemoto = ComandoRemotoModel(sequelize);
const RespuestaComando = RespuestaComandoModel(sequelize);
const AuditoriaSistema = AuditoriaSistemaModel(sequelize);

// ---------- Asociaciones existentes ----------
House.hasMany(Device, { foreignKey: "house_id" });
Device.belongsTo(House, { foreignKey: "house_id" });

House.hasMany(User, { foreignKey: "house_id" });
User.belongsTo(House, { foreignKey: "house_id" });

Device.hasMany(Reading, { foreignKey: "device_id" });
Reading.belongsTo(Device, { foreignKey: "device_id" });

Device.hasMany(Alert, { foreignKey: "device_id" });
Alert.belongsTo(Device, { foreignKey: "device_id" });

// ---------- Roles y usuarios ----------
User.belongsToMany(Role, { through: UserRole, foreignKey: "user_id", otherKey: "role_id", as: "roles" });
Role.belongsToMany(User, { through: UserRole, foreignKey: "role_id", otherKey: "user_id", as: "users" });
UserRole.belongsTo(User, { foreignKey: "user_id" });
UserRole.belongsTo(Role, { foreignKey: "role_id" });
User.hasMany(UserRole, { foreignKey: "user_id" });
Role.hasMany(UserRole, { foreignKey: "role_id" });

Role.belongsToMany(Resource, {
  through: RoleResource,
  foreignKey: "role_id",
  otherKey: "resource_id",
  as: "resources"
});
Resource.belongsToMany(Role, {
  through: RoleResource,
  foreignKey: "resource_id",
  otherKey: "role_id",
  as: "roles"
});
RoleResource.belongsTo(Role, { foreignKey: "role_id" });
RoleResource.belongsTo(Resource, { foreignKey: "resource_id" });
Role.hasMany(RoleResource, { foreignKey: "role_id" });
Resource.hasMany(RoleResource, { foreignKey: "resource_id" });
Resource.belongsTo(Resource, { foreignKey: "parent_id", as: "parent" });
Resource.hasMany(Resource, { foreignKey: "parent_id", as: "children" });

// ---------- Ubicaciones ----------
House.hasMany(UbicacionInstalacion, { foreignKey: "house_id", as: "ubicaciones" });
UbicacionInstalacion.belongsTo(House, { foreignKey: "house_id" });

// ---------- Sensores ----------
Device.hasMany(Sensor, { foreignKey: "device_id", as: "sensores" });
Sensor.belongsTo(Device, { foreignKey: "device_id" });

UbicacionInstalacion.hasMany(Sensor, { foreignKey: "ubicacion_id" });
Sensor.belongsTo(UbicacionInstalacion, { foreignKey: "ubicacion_id", as: "ubicacion" });

Sensor.hasMany(Reading, { foreignKey: "sensor_id" });
Reading.belongsTo(Sensor, { foreignKey: "sensor_id", as: "sensor" });

// ---------- Estado y fugas ----------
Device.hasMany(EstadoSistema, { foreignKey: "device_id", as: "estados" });
EstadoSistema.belongsTo(Device, { foreignKey: "device_id" });

Device.hasMany(IncidenteFuga, { foreignKey: "device_id", as: "incidentes" });
IncidenteFuga.belongsTo(Device, { foreignKey: "device_id" });

IncidenteFuga.belongsTo(User, { foreignKey: "resuelto_por_user_id", as: "resueltoPor" });

IncidenteFuga.hasMany(Alert, { foreignKey: "incidente_id", as: "alertas" });
Alert.belongsTo(IncidenteFuga, { foreignKey: "incidente_id", as: "incidente" });

Alert.belongsTo(User, { foreignKey: "ack_by_user_id", as: "ackBy" });

// ---------- Electrovalvulas ----------
Device.hasOne(Electrovalvula, { foreignKey: "device_id", as: "electrovalvula" });
Electrovalvula.belongsTo(Device, { foreignKey: "device_id" });

Electrovalvula.hasMany(AccionValvula, { foreignKey: "valvula_id", as: "acciones" });
AccionValvula.belongsTo(Electrovalvula, { foreignKey: "valvula_id" });
AccionValvula.belongsTo(User, { foreignKey: "user_id", as: "usuario" });

// ---------- Configuracion de deteccion ----------
Device.hasOne(ConfiguracionDeteccion, { foreignKey: "device_id", as: "configuracionDeteccion" });
ConfiguracionDeteccion.belongsTo(Device, { foreignKey: "device_id" });
ConfiguracionDeteccion.belongsTo(User, { foreignKey: "updated_by_user_id", as: "updatedBy" });

// ---------- Comandos remotos ----------
Device.hasMany(ComandoRemoto, { foreignKey: "device_id", as: "comandos" });
ComandoRemoto.belongsTo(Device, { foreignKey: "device_id" });
ComandoRemoto.belongsTo(User, { foreignKey: "user_id", as: "emisor" });

ComandoRemoto.hasOne(RespuestaComando, { foreignKey: "comando_id", as: "respuesta" });
RespuestaComando.belongsTo(ComandoRemoto, { foreignKey: "comando_id" });

// ---------- Auditoria ----------
User.hasMany(AuditoriaSistema, { foreignKey: "user_id", as: "auditorias" });
AuditoriaSistema.belongsTo(User, { foreignKey: "user_id" });

module.exports = {
  sequelize,
  House,
  User,
  Device,
  Reading,
  Alert,
  Role,
  UserRole,
  Resource,
  RoleResource,
  UbicacionInstalacion,
  Sensor,
  EstadoSistema,
  IncidenteFuga,
  Electrovalvula,
  AccionValvula,
  ConfiguracionDeteccion,
  ComandoRemoto,
  RespuestaComando,
  AuditoriaSistema
};
