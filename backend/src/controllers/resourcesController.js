const { Resource, Role, RoleResource } = require("../models");
const { getPermissionsForUser } = require("../services/accessControl");
const { isAdmin } = require("../middlewares/authorize");
const { recordAudit } = require("../services/audit");

const normalizeCode = (value) => String(value || "").trim().toLowerCase().slice(0, 80);
const nullableString = (value, maxLength) => {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const serializeResource = (record) => {
  const resource = record && typeof record.get === "function" ? record.get({ plain: true }) : record;
  return {
    id: resource.id,
    code: resource.code,
    nombre: resource.nombre,
    backendPath: resource.backend_path,
    frontendPath: resource.frontend_path,
    icono: resource.icono,
    orden: resource.orden,
    parentId: resource.parent_id,
    estado: resource.estado,
    roles: (resource.roles || resource.Roles || []).map((role) => ({
      id: role.id,
      code: role.code,
      nombre: role.nombre,
      permissions: {
        view: Boolean(role.RoleResource?.can_view),
        create: Boolean(role.RoleResource?.can_create),
        update: Boolean(role.RoleResource?.can_update),
        delete: Boolean(role.RoleResource?.can_delete)
      }
    }))
  };
};

const buildPayload = (body) => ({
  code: normalizeCode(body.code),
  nombre: String(body.nombre || "").trim().slice(0, 120),
  backend_path: nullableString(body.backendPath ?? body.backend_path, 160),
  frontend_path: nullableString(body.frontendPath ?? body.frontend_path, 160),
  icono: nullableString(body.icono, 80),
  orden: body.orden === undefined || body.orden === null || body.orden === "" ? 0 : Number(body.orden),
  parent_id:
    body.parentId === undefined && body.parent_id === undefined
      ? null
      : Number(body.parentId ?? body.parent_id) || null,
  estado: String(body.estado || "ACTIVO").trim().toUpperCase() === "INACTIVO" ? "INACTIVO" : "ACTIVO"
});

const includeRoles = [
  {
    model: Role,
    as: "roles",
    attributes: ["id", "code", "nombre"],
    through: { attributes: ["can_view", "can_create", "can_update", "can_delete"] },
    required: false
  }
];

const listResources = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      const resources = await getPermissionsForUser(req.user);
      return res.json({ ok: true, resources });
    }

    const resources = await Resource.findAll({
      include: includeRoles,
      order: [
        ["orden", "ASC"],
        ["id", "ASC"]
      ]
    });

    return res.json({ ok: true, resources: resources.map(serializeResource) });
  } catch (error) {
    return next(error);
  }
};

const createResource = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden crear recursos" });
    }

    const payload = buildPayload(req.body);
    const exists = await Resource.findOne({ where: { code: payload.code } });
    if (exists) return res.status(409).json({ ok: false, msg: "Codigo de recurso ya existe" });

    if (payload.parent_id) {
      const parent = await Resource.findByPk(payload.parent_id);
      if (!parent) return res.status(404).json({ ok: false, msg: "Recurso padre no encontrado" });
    }

    const resource = await Resource.create(payload);
    await recordAudit({
      user: req.user,
      entidad: "Resource",
      entidadId: resource.id,
      accion: "crear_recurso",
      detalle: { code: resource.code },
      req
    });

    return res.status(201).json({ ok: true, resource: serializeResource(resource) });
  } catch (error) {
    return next(error);
  }
};

const updateResource = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden editar recursos" });
    }

    const resource = await Resource.findByPk(req.params.id);
    if (!resource) return res.status(404).json({ ok: false, msg: "Recurso no encontrado" });

    const payload = buildPayload({ ...req.body, code: req.body.code ?? resource.code });
    if (payload.code !== resource.code) {
      const duplicate = await Resource.findOne({ where: { code: payload.code } });
      if (duplicate) return res.status(409).json({ ok: false, msg: "Codigo de recurso ya existe" });
    }

    if (payload.parent_id) {
      if (Number(payload.parent_id) === Number(resource.id)) {
        return res.status(409).json({ ok: false, msg: "Un recurso no puede ser padre de si mismo" });
      }
      const parent = await Resource.findByPk(payload.parent_id);
      if (!parent) return res.status(404).json({ ok: false, msg: "Recurso padre no encontrado" });
    }

    await resource.update(payload);
    await recordAudit({
      user: req.user,
      entidad: "Resource",
      entidadId: resource.id,
      accion: "actualizar_recurso",
      detalle: payload,
      req
    });

    const updated = await Resource.findByPk(resource.id, { include: includeRoles });
    return res.json({ ok: true, resource: serializeResource(updated) });
  } catch (error) {
    return next(error);
  }
};

const deleteResource = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden eliminar recursos" });
    }

    const resource = await Resource.findByPk(req.params.id);
    if (!resource) return res.status(404).json({ ok: false, msg: "Recurso no encontrado" });

    const [childrenCount, assignmentsCount] = await Promise.all([
      Resource.count({ where: { parent_id: resource.id } }),
      RoleResource.count({ where: { resource_id: resource.id } })
    ]);

    if (childrenCount > 0) {
      return res.status(409).json({ ok: false, msg: "No puedes eliminar un recurso con hijos" });
    }

    if (assignmentsCount > 0) {
      return res.status(409).json({ ok: false, msg: "No puedes eliminar un recurso asignado a roles" });
    }

    await resource.destroy();
    await recordAudit({
      user: req.user,
      entidad: "Resource",
      entidadId: resource.id,
      accion: "eliminar_recurso",
      req
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createResource,
  deleteResource,
  listResources,
  updateResource
};
