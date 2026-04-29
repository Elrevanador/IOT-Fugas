const { Role, User, UserRole } = require("../models");
const { isAdmin } = require("../middlewares/authorize");
const { recordAudit } = require("../services/audit");

const listUserRoles = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden consultar roles de usuario" });
    }

    const where = {};
    if (req.query.userId) where.user_id = Number(req.query.userId);
    if (req.query.roleId) where.role_id = Number(req.query.roleId);

    const userRoles = await UserRole.findAll({
      where,
      include: [
        { model: User, attributes: ["id", "nombre", "email", "role"], required: false },
        { model: Role, attributes: ["id", "code", "nombre"], required: false }
      ],
      order: [["assigned_at", "DESC"]]
    });

    return res.json({ ok: true, userRoles });
  } catch (error) {
    return next(error);
  }
};

const assignUserRole = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden asignar roles" });
    }

    const userId = Number(req.body.userId);
    const roleId = Number(req.body.roleId);
    const [user, role] = await Promise.all([User.findByPk(userId), Role.findByPk(roleId)]);
    if (!user) return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    if (!role) return res.status(404).json({ ok: false, msg: "Rol no encontrado" });

    const [userRole] = await UserRole.findOrCreate({
      where: { user_id: userId, role_id: roleId },
      defaults: { user_id: userId, role_id: roleId }
    });

    await recordAudit({
      user: req.user,
      entidad: "UserRole",
      entidadId: `${userId}:${roleId}`,
      accion: "asignar_rol_usuario",
      detalle: { userId, roleId },
      req
    });

    return res.status(201).json({ ok: true, userRole });
  } catch (error) {
    return next(error);
  }
};

const removeUserRole = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, msg: "Solo administradores pueden quitar roles" });
    }

    const userId = Number(req.params.userId);
    const roleId = Number(req.params.roleId);
    const userRole = await UserRole.findOne({ where: { user_id: userId, role_id: roleId } });
    if (!userRole) return res.status(404).json({ ok: false, msg: "Asignacion no encontrada" });

    await userRole.destroy();
    await recordAudit({
      user: req.user,
      entidad: "UserRole",
      entidadId: `${userId}:${roleId}`,
      accion: "quitar_rol_usuario",
      req
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listUserRoles, assignUserRole, removeUserRole };
