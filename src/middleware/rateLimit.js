/**
 * Small in-memory rate limiter for the login route: after `max` failed
 * attempts from one IP inside `windowMs`, further attempts get HTTP 429.
 * (For a multi-server deployment this would move to Redis.)
 */
function loginLimiter({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const failures = new Map();

  function check(req, res, next) {
    const now = Date.now();
    const entry = failures.get(req.ip);
    if (entry && now - entry.first > windowMs) failures.delete(req.ip);
    const current = failures.get(req.ip);
    if (current && current.count >= max) {
      const retry = Math.ceil((windowMs - (now - current.first)) / 1000);
      res.set("Retry-After", String(retry));
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(retry / 60)} minutes.` });
    }
    next();
  }

  check.fail = (ip) => {
    const e = failures.get(ip);
    if (e) e.count++;
    else failures.set(ip, { count: 1, first: Date.now() });
  };
  check.succeed = (ip) => failures.delete(ip);
  return check;
}

module.exports = { loginLimiter };

/** Fixed-window limiter for public endpoints (booking, lookup by mobile number). */
function windowLimiter({ max, windowMs, message = "Too many requests. Please wait a few minutes and try again." }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    let e = hits.get(req.ip);
    if (!e || now - e.start > windowMs) {
      e = { start: now, count: 0 };
      hits.set(req.ip, e);
    }
    e.count++;
    if (e.count > max) {
      res.set("Retry-After", String(Math.ceil((windowMs - (now - e.start)) / 1000)));
      return res.status(429).json({ error: message });
    }
    if (hits.size > 10000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    next();
  };
}

module.exports.windowLimiter = windowLimiter;
