const { Resource, Role, RoleResource } = require("../models");
const { isAdmin } = require("../middlewares/authorize");
const { recordAudit } = require("../services/audit");

const boolValue = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const permissionPayload = (body) => ({
  can_view: boolValue(body.canView ?? body.can_view, true),
  can_create: boolValue(body.canCreate ?? body.can_create, false),
  can_update: boolValue(body.canUpdate ?? body.can_update, false),
  can_delete: boolValue(body.canDelete ?? body.can_delete, false)
});

const serializeRoleResource = (record) => {
  const assignment = record && typeof record.get === "function" ? record.get({ plain: true }) : record;
  return {
    roleId: assignment.role_id,
    resourceId: assignment.resource_id,
    assignedAt: assignment.assigned_at,
    permissions: {
      view: Boolean(assignment.can_view),
      create: Boolean(assignment.can_create),
      update: Boolean(assignment.can_update),
      delete: Boolean(assignment.can_delete)
    },
    role: assignment.Role
      ? {
          id: assignment.Role.id,
          code: assignment.Role.code,
          nombre: assignment.Role.nombre
        }
      : null,
    resource: assignment.Resource
      ? {
          id: assignment.Resource.id,
          code: assignment.Resource.code,
          nombre: assignment.Resource.nombre,
          frontendPath: assignment.Resource.frontend_path,
          backendPath: assignment.Resource.backend_path
        }
      : null
  };
};

const listRoleResources = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden consultar permisos" });
    }

    const where = {};
    if (req.query.roleId) where.role_id = Number(req.query.roleId);
    if (req.query.resourceId) where.resource_id = Number(req.query.resourceId);

    const roleResources = await RoleResource.findAll({
      where,
      include: [
        { model: Role, attributes: ["id", "code", "nombre"], required: false },
        { model: Resource, attributes: ["id", "code", "nombre", "frontend_path", "backend_path"], required: false }
      ],
      order: [
        ["role_id", "ASC"],
        ["resource_id", "ASC"]
      ]
    });

    return res.json({ ok: true, roleResources: roleResources.map(serializeRoleResource) });
  } catch (error) {
    return next(error);
  }
};

const assignRoleResource = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden asignar permisos" });
    }

    const roleId = Number(req.body.roleId);
    const resourceId = Number(req.body.resourceId);
    const [role, resource] = await Promise.all([Role.findByPk(roleId), Resource.findByPk(resourceId)]);
    if (!role) return res.status(404).json({ ok: false, msg: "Rol no encontrado" });
    if (!resource) return res.status(404).json({ ok: false, msg: "Recurso no encontrado" });

    const [assignment] = await RoleResource.findOrCreate({
      where: { role_id: roleId, resource_id: resourceId },
      defaults: {
        role_id: roleId,
        resource_id: resourceId,
        ...permissionPayload(req.body)
      }
    });

    await assignment.update(permissionPayload(req.body));
    await recordAudit({
      user: req.user,
      entidad: "RoleResource",
      entidadId: `${roleId}:${resourceId}`,
      accion: "asignar_recurso_rol",
      detalle: {
        roleId,
        resourceId,
        permissions: permissionPayload(req.body)
      },
      req
    });

    const updated = await RoleResource.findOne({
      where: { role_id: roleId, resource_id: resourceId },
      include: [
        { model: Role, attributes: ["id", "code", "nombre"], required: false },
        { model: Resource, attributes: ["id", "code", "nombre", "frontend_path", "backend_path"], required: false }
      ]
    });

    return res.status(201).json({ ok: true, roleResource: serializeRoleResource(updated) });
  } catch (error) {
    return next(error);
  }
};

const removeRoleResource = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden quitar permisos" });
    }

    const roleId = Number(req.params.roleId);
    const resourceId = Number(req.params.resourceId);
    const assignment = await RoleResource.findOne({ where: { role_id: roleId, resource_id: resourceId } });
    if (!assignment) return res.status(404).json({ ok: false, msg: "Asignacion no encontrada" });

    await assignment.destroy();
    await recordAudit({
      user: req.user,
      entidad: "RoleResource",
      entidadId: `${roleId}:${resourceId}`,
      accion: "quitar_recurso_rol",
      req
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  assignRoleResource,
  listRoleResources,
  removeRoleResource
};
