module.exports = (err, req, res, next) => {
  const status =
    err.status ||
    err.statusCode ||
    (err.type === "entity.too.large" ? 413 : 0) ||
    (err instanceof SyntaxError ? 400 : 0) ||
    500;

  const message =
    err.type === "entity.too.large"
      ? "Payload demasiado grande"
      : err instanceof SyntaxError
        ? "JSON invalido"
        : err.message || "Error interno";

  res.status(status).json({
    ok: false,
    msg: message,
    requestId: req.requestId || null
  });
};
