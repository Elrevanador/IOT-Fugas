const { body, param, query } = require("express-validator");

/**
 * Validadores centralizados para requests comunes
 */

const validators = {
  // IDs
  id: (field = "id") => param(field).isInt({ min: 1 }).withMessage(`${field} debe ser un entero positivo`),

  // Paginación
  pagination: [
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit debe estar entre 1 y 200"),
    query("page").optional().isInt({ min: 1 }).withMessage("page debe ser un entero positivo"),
    query("offset").optional().isInt({ min: 0 }).withMessage("offset debe ser un entero no negativo")
  ],

  // Búsqueda
  search: (field = "search") => query(field).optional().trim().isLength({ max: 100 }).withMessage("search demasiado largo"),

  // Estados comunes
  status: (field = "status", validStatuses = ["ACTIVO", "INACTIVO", "MANTENIMIENTO"]) =>
    body(field).optional().isIn(validStatuses).withMessage(`status debe ser uno de: ${validStatuses.join(", ")}`),

  // Strings comunes
  name: (field = "name") => body(field).trim().isLength({ min: 2, max: 120 }).withMessage(`${field} debe tener entre 2 y 120 caracteres`),

  location: (field = "location") => body(field).trim().isLength({ min: 2 }).withMessage(`${field} debe tener al menos 2 caracteres`),

  // Números
  houseId: (field = "houseId") => body(field).optional().isInt({ min: 1 }).withMessage(`${field} debe ser un entero positivo`),

  // Lecturas IoT
  flow: () => body("flow_lmin").isFloat({ min: 0 }).withMessage("flow_lmin debe ser un número positivo"),

  pressure: () => body("pressure_kpa").optional().isFloat({ min: 0 }).withMessage("pressure_kpa debe ser un número positivo"),

  state: () => body("state").isIn(["NORMAL", "ALERTA", "FUGA", "ERROR"]).withMessage("state debe ser NORMAL, ALERTA, FUGA o ERROR"),

  // Dispositivos
  deviceName: () => body("deviceName").optional().trim().isLength({ min: 2, max: 120 }).withMessage("deviceName inválido"),

  deviceId: () => body("deviceId").optional().isInt({ min: 1 }).withMessage("deviceId debe ser un entero positivo"),

  // Usuarios
  email: () => body("email").isEmail().normalizeEmail().withMessage("email inválido"),

  password: () => body("password").isLength({ min: 8 }).withMessage("password debe tener al menos 8 caracteres")
};

module.exports = validators;