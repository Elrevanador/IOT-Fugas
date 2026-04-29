const { getUserHouseScope } = require("./authorize");

/**
 * Middleware para aplicar filtros de scope de casa de manera centralizada
 * Evita duplicación de código en controladores
 */
const createScopeFilter = (options = {}) => {
  return (req, res, next) => {
    const scopedHouseId = getUserHouseScope(req.user);
    const whereKey = options.key || "house_id";

    req.scopeFilter = {
      houseScopedId: scopedHouseId,
      applyToWhere: (where, queryParam = "houseId") => {
        if (scopedHouseId) {
          where[whereKey] = scopedHouseId;
        } else if (req.query[queryParam]) {
          where[whereKey] = Number(req.query[queryParam]);
        }
        return where;
      }
    };

    next();
  };
};

module.exports = { createScopeFilter };