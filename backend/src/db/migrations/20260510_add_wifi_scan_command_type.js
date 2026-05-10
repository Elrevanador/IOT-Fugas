const commandTypes = [
  "CERRAR_VALVULA",
  "ABRIR_VALVULA",
  "ACTUALIZAR_CONFIG",
  "ESCANEAR_WIFI",
  "REINICIAR",
  "SOLICITAR_ESTADO",
  "OTRO"
];

const enumSql = commandTypes.map((value) => `'${value}'`).join(",");

module.exports = {
  up: async ({ sequelize, queryInterface, transaction }) => {
    const table = await queryInterface.describeTable("comandos_remotos");
    if (!table.tipo) return;

    await sequelize.query(
      `ALTER TABLE comandos_remotos MODIFY COLUMN tipo ENUM(${enumSql}) NOT NULL`,
      { transaction }
    );
  }
};
