const jwt = require("jsonwebtoken");
const config = require("../config");

const COOKIE = "anareen_session";

function cookieOptions() {
  return {
    httpOnly: true, // not readable from JavaScript, so XSS cannot steal it
    sameSite: "strict", // not sent on cross-site requests, which blocks CSRF
    secure: config.env === "production",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  };
}

function signSession(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, doctorId: user.doctor_id ?? null },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/** Reads the session cookie if present; never rejects. */
function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret);
    } catch {
      req.user = null;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in" });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Please sign in" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "You don't have permission to do that" });
    next();
  };
}

/** Doctors may only control their own queue; admin and reception may control any. */
function canControlDoctor(user, doctorId) {
  if (!user) return false;
  if (user.role === "admin" || user.role === "reception") return true;
  return user.role === "doctor" && Number(user.doctorId) === Number(doctorId);
}

module.exports = { COOKIE, cookieOptions, signSession, loadUser, requireAuth, requireRole, canControlDoctor };
