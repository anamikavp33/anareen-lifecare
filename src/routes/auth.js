const express = require("express");
const bcrypt = require("bcryptjs");
const { COOKIE, cookieOptions, signSession, requireAuth } = require("../middleware/auth");
const { loginLimiter } = require("../middleware/rateLimit");
const { text } = require("../middleware/validate");

// A real bcrypt hash of a random string, compared against when the username
// doesn't exist, so response time doesn't reveal which usernames are valid.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

module.exports = function authRoutes({ db, audit }) {
  const router = express.Router();
  const limiter = loginLimiter();

  router.post("/login", limiter, (req, res) => {
    const username = text(req.body?.username, "Username", { max: 60 });
    const password = text(req.body?.password, "Password", { max: 200 });

    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      limiter.fail(req.ip);
      return res.status(401).json({ error: "Incorrect username or password" });
    }
    limiter.succeed(req.ip);
    res.cookie(COOKIE, signSession(user), cookieOptions());
    audit(user, "login");
    res.json({ user: { id: user.id, username: user.username, role: user.role, doctorId: user.doctor_id } });
  });

  router.post("/logout", (req, res) => {
    res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  });

  router.get("/me", requireAuth, (req, res) => {
    const { sub, username, role, doctorId } = req.user;
    res.json({ user: { id: sub, username, role, doctorId } });
  });

  router.post("/change-password", requireAuth, (req, res) => {
    const current = text(req.body?.currentPassword, "Current password", { max: 200 });
    const next = text(req.body?.newPassword, "New password", { min: 8, max: 200 });
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.sub);
    if (!user || !bcrypt.compareSync(current, user.password_hash)) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(next, 10), user.id);
    audit(user, "change-password");
    res.json({ ok: true });
  });

  return router;
};
