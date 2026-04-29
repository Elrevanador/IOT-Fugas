/**
 * Normalizadores centralizados para datos de entrada
 * Evitan duplicación y aseguran consistencia
 */

const normalizers = {
  /**
   * Normaliza strings: trim, toUpperCase/toLowerCase opcional, maxLength
   */
  string: (value, options = {}) => {
    if (value == null) return options.default || null;
    let str = String(value).trim();
    if (options.toUpperCase) str = str.toUpperCase();
    if (options.toLowerCase) str = str.toLowerCase();
    if (options.maxLength && str.length > options.maxLength) {
      str = str.slice(0, options.maxLength);
    }
    return str || null;
  },

  /**
   * Normaliza números: parse, min/max validation
   */
  number: (value, options = {}) => {
    if (value == null) return options.default || null;
    const num = Number(value);
    if (!Number.isFinite(num)) return options.default || null;
    if (options.min !== undefined && num < options.min) return options.default || null;
    if (options.max !== undefined && num > options.max) return options.default || null;
    return num;
  },

  /**
   * Normaliza estados: valida contra lista permitida
   */
  status: (value, options = {}) => {
    const validStatuses = options.valid || ["ACTIVO", "INACTIVO", "MANTENIMIENTO"];
    const normalized = normalizers.string(value, { toUpperCase: true });
    return validStatuses.includes(normalized) ? normalized : (options.default || "ACTIVO");
  },

  /**
   * Normaliza emails: trim y lowercase
   */
  email: (value) => {
    return normalizers.string(value, { toLowerCase: true, maxLength: 254 });
  },

  /**
   * Normaliza códigos: uppercase, sin espacios
   */
  code: (value) => {
    return normalizers.string(value, { toUpperCase: true }).replace(/\s+/g, '');
  },

  /**
   * Normaliza timestamps: valida formato ISO
   */
  timestamp: (value) => {
    if (!value) return new Date();
    const date = new Date(value);
    return isNaN(date.getTime()) ? new Date() : date;
  }
};

module.exports = normalizers;