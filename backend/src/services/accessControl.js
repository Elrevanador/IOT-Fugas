const { Resource, Role, UserRole } = require("../models");
const { isAdmin, normalizeRole } = require("../middlewares/authorize");

const ACTION_FIELDS = {
  view: "can_view",
  create: "can_create",
  update: "can_update",
  delete: "can_delete"
};

const toPlain = (record) => (record && typeof record.get === "function" ? record.get({ plain: true }) : record);

const serializePermission = (resource, permissionFlags) => ({
  id: resource.id,
  code: resource.code,
  nombre: resource.nombre,
  backendPath: resource.backend_path,
  frontendPath: resource.frontend_path,
  icono: resource.icono,
  orden: resource.orden,
  parentId: resource.parent_id,
  estado: resource.estado,
  permissions: {
    view: Boolean(permissionFlags.can_view),
    create: Boolean(permissionFlags.can_create),
    update: Boolean(permissionFlags.can_update),
    delete: Boolean(permissionFlags.can_delete)
  }
});

const getEffectiveRoleCodes = async (user, { silent = false } = {}) => {
  const codes = new Set();

  if (user?.role) {
    codes.add(normalizeRole(user.role));
  }

  if (Array.isArray(user?.roles)) {
    for (const role of user.roles) {
      const code = normalizeRole(role?.code || role);
      if (code) codes.add(code);
    }
  }

  if (!user?.id || !UserRole || typeof UserRole.findAll !== "function") {
    return [...codes].filter(Boolean);
  }

  try {
    const assignments = await UserRole.findAll({
      where: { user_id: user.id },
      include:
        Role && typeof Role.findByPk === "function"
          ? [{ model: Role, attributes: ["code"], required: false }]
          : []
    });

    for (const assignmentRecord of assignments) {
      const assignment = toPlain(assignmentRecord);
      const role = assignment.Role || assignment.role;
      const code = normalizeRole(role?.code);
      if (code) codes.add(code);
    }
  } catch (error) {
    if (!silent) throw error;
  }

  return [...codes].filter(Boolean);
};

const mergePermissionFlags = (roles = []) => {
  const flags = {
    can_view: false,
    can_create: false,
    can_update: false,
    can_delete: false
  };

  for (const role of roles) {
    const through = role.RoleResource || role.roleResource || {};
    flags.can_view = flags.can_view || Boolean(through.can_view);
    flags.can_create = flags.can_create || Boolean(through.can_create);
    flags.can_update = flags.can_update || Boolean(through.can_update);
    flags.can_delete = flags.can_delete || Boolean(through.can_delete);
  }

  return flags;
};

const getPermissionsForUser = async (user, { silent = false } = {}) => {
  if (!Resource || typeof Resource.findAll !== "function") return [];

  try {
    const roleCodes = await getEffectiveRoleCodes(user, { silent });
    if (!roleCodes.length) return [];

    const resources = await Resource.findAll({
      where: { estado: "ACTIVO" },
      include:
        Role && typeof Role.findAll === "function"
          ? [
              {
                model: Role,
                as: "roles",
                attributes: ["id", "code", "nombre"],
                where: { code: roleCodes },
                through: {
                  attributes: ["can_view", "can_create", "can_update", "can_delete"]
                },
                required: true
              }
            ]
          : [],
      order: [
        ["orden", "ASC"],
        ["id", "ASC"]
      ]
    });

    return resources.map((resourceRecord) => {
      const resource = toPlain(resourceRecord);
      return serializePermission(resource, mergePermissionFlags(resource.roles || resource.Roles || []));
    });
  } catch (error) {
    if (!silent) throw error;
    return [];
  }
};

const buildUserAccessProfile = async (user, { silent = false } = {}) => {
  const roleCodes = await getEffectiveRoleCodes(user, { silent });
  const resources = await getPermissionsForUser(user, { silent });

  return {
    roles: roleCodes,
    permissions: resources
  };
};

const hasPermission = async (user, resourceCode, action = "view") => {
  if (isAdmin(user)) return true;

  const field = ACTION_FIELDS[action] || ACTION_FIELDS.view;
  const permissions = await getPermissionsForUser(user, { silent: true });
  const resource = permissions.find((item) => item.code === resourceCode);
  return Boolean(resource?.permissions?.[field.replace("can_", "")]);
};

const requirePermission = (resourceCode, action = "view") => async (req, res, next) => {
  try {
    const allowed = await hasPermission(req.user, resourceCode, action);
    if (!allowed) {
      return res.status(403).json({ ok: false, msg: "No tienes permisos para este recurso" });
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  ACTION_FIELDS,
  buildUserAccessProfile,
  getEffectiveRoleCodes,
  getPermissionsForUser,
  hasPermission,
  requirePermission,
  serializePermission
};
