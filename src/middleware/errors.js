const { logError } = require("../logger");

function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Request body is not valid JSON" });
  if (err.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "That name is already in use" });
  if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") return res.status(409).json({ error: "This record is still in use by other records" });
  if (err.code === "SQLITE_CONSTRAINT_CHECK") return res.status(400).json({ error: "One of the values is out of range" });
  const status = err.status || 500;
  if (status >= 500) logError(err, `${req.method} ${req.path}`); // path only: query strings can hold mobile numbers
  res.status(status).json({ error: status >= 500 ? "Something went wrong on the server" : err.message });
}

module.exports = { notFound, errorHandler };
