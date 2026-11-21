class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function text(value, field, { required = true, max = 120, min = 1 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ValidationError(`${field} is required`);
    return undefined;
  }
  if (typeof value !== "string") throw new ValidationError(`${field} must be text`);
  const v = value.trim();
  if (v.length < min) throw new ValidationError(`${field} must be at least ${min} characters`);
  if (v.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
  return v;
}

function integer(value, field, { required = true, min = 0, max = 1e9 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ValidationError(`${field} is required`);
    return undefined;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`${field} must be a whole number from ${min} to ${max}`);
  return n;
}

function id(value, field = "id") {
  return integer(value, field, { min: 1 });
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

module.exports = { ValidationError, text, integer, id, slugify };
