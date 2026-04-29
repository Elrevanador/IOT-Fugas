module.exports = {
  up: async (queryInterface, Sequelize) => {
    const indexes = [
      'CREATE INDEX idx_readings_device_ts ON readings(device_id, ts DESC)',
      'CREATE INDEX idx_readings_ts ON readings(ts DESC)',
      'CREATE INDEX idx_alerts_device_acknowledged ON alerts(device_id, acknowledged)',
      'CREATE INDEX idx_alerts_ts ON alerts(ts DESC)',
      'CREATE INDEX idx_users_email ON users(email)',
      'CREATE INDEX idx_devices_name ON devices(name)',
      'CREATE INDEX idx_devices_hardware_uid ON devices(hardware_uid)',
      'CREATE INDEX idx_devices_house_id ON devices(house_id)'
    ];

    for (const sql of indexes) {
      try {
        await queryInterface.sequelize.query(sql);
      } catch (error) {
        // Ignorar si el índice ya existe
        if (!error.message.includes('Duplicate key name')) {
          throw error;
        }
      }
    }
  },
  down: async (queryInterface, Sequelize) => {
    const indexes = [
      'DROP INDEX idx_readings_device_ts ON readings',
      'DROP INDEX idx_readings_ts ON readings',
      'DROP INDEX idx_alerts_device_acknowledged ON alerts',
      'DROP INDEX idx_alerts_ts ON alerts',
      'DROP INDEX idx_users_email ON users',
      'DROP INDEX idx_devices_name ON devices',
      'DROP INDEX idx_devices_hardware_uid ON devices',
      'DROP INDEX idx_devices_house_id ON devices'
    ];

    for (const sql of indexes) {
      try {
        await queryInterface.sequelize.query(sql);
      } catch (error) {
        // Ignorar si el índice no existe
        if (!error.message.includes('check that column/key exists')) {
          throw error;
        }
      }
    }
  }
};