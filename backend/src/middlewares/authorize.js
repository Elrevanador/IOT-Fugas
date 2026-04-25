const ADMIN_ROLES = new Set(["admin"]);
const OPERATOR_ROLES = new Set(["admin", "operator"]);
const USER_ROLES = new Set(["admin", "operator", "resident"]);

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

const hasRole = (user, allowedRoles) => {
  const role = normalizeRole(user?.role);
  return allowedRoles.has(role);
};

const requireRole = (roles) => (req, res, next) => {
  const allowedRoles = new Set(roles.map(normalizeRole));
  if (!hasRole(req.user, allowedRoles)) {
    return res.status(403).json({ ok: false, msg: "No tienes permisos para esta accion" });
  }
  return next();
};

const isAdmin = (user) => hasRole(user, ADMIN_ROLES);
const isOperator = (user) => hasRole(user, OPERATOR_ROLES);
const isKnownUser = (user) => hasRole(user, USER_ROLES);

const getUserHouseScope = (user) => {
  if (!isKnownUser(user) || isAdmin(user)) return null;
  return user?.houseId ? Number(user.houseId) : null;
};

module.exports = {
  ADMIN_ROLES,
  OPERATOR_ROLES,
  USER_ROLES,
  getUserHouseScope,
  isAdmin,
  isOperator,
  normalizeRole,
  requireRole
};
