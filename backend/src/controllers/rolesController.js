const { Role, User, UserRole } = require("../models");
const { isAdmin } = require("../middlewares/authorize");
const { recordAudit } = require("../services/audit");

const serializeRoleCode = (value) => String(value || "").trim().toLowerCase().slice(0, 40);

const listRoles = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden consultar roles" });
    }

    const roles = await Role.findAll({
      include: [
        {
          model: User,
          as: "users",
          attributes: ["id", "nombre", "email", "role"],
          through: { attributes: ["assigned_at"] },
          required: false
        }
      ],
      order: [["id", "ASC"]]
    });

    return res.json({ ok: true, roles });
  } catch (error) {
    return next(error);
  }
};

const createRole = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden crear roles" });
    }

    const code = serializeRoleCode(req.body.code);
    const exists = await Role.findOne({ where: { code } });
    if (exists) return res.status(409).json({ ok: false, msg: "Codigo de rol ya existe" });

    const role = await Role.create({
      code,
      nombre: String(req.body.nombre || "").trim().slice(0, 120),
      descripcion: req.body.descripcion ? String(req.body.descripcion).trim().slice(0, 255) : null
    });

    await recordAudit({
      user: req.user,
      entidad: "Role",
      entidadId: role.id,
      accion: "crear_rol",
      detalle: { code },
      req
    });

    return res.status(201).json({ ok: true, role });
  } catch (error) {
    return next(error);
  }
};

const updateRole = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden editar roles" });
    }

    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ ok: false, msg: "Rol no encontrado" });

    const patch = {
      nombre: String(req.body.nombre || "").trim().slice(0, 120),
      descripcion: req.body.descripcion ? String(req.body.descripcion).trim().slice(0, 255) : null
    };

    if (req.body.code !== undefined) {
      const code = serializeRoleCode(req.body.code);
      if (code !== role.code) {
        const exists = await Role.findOne({ where: { code } });
        if (exists) return res.status(409).json({ ok: false, msg: "Codigo de rol ya existe" });
      }
      patch.code = code;
    }

    await role.update(patch);

    await recordAudit({
      user: req.user,
      entidad: "Role",
      entidadId: role.id,
      accion: "actualizar_rol",
      detalle: patch,
      req
    });

    return res.json({ ok: true, role });
  } catch (error) {
    return next(error);
  }
};

const deleteRole = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden eliminar roles" });
    }

    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ ok: false, msg: "Rol no encontrado" });

    const assigned = await UserRole.count({ where: { role_id: role.id } });
    if (assigned > 0) {
      return res.status(409).json({ ok: false, msg: "No puedes eliminar un rol asignado a usuarios" });
    }

    await role.destroy();
    await recordAudit({
      user: req.user,
      entidad: "Role",
      entidadId: role.id,
      accion: "eliminar_rol",
      req
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listRoles, createRole, updateRole, deleteRole };
