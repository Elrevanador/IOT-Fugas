module.exports = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || "Error interno";
  res.status(status).json({ ok: false, msg: message });
};
