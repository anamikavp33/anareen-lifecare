const express = require("express");
const bcrypt = require("bcryptjs");
const config = require("../config");
const queue = require("../services/queue");
const { requireRole } = require("../middleware/auth");
const { text, integer, id, slugify, ValidationError } = require("../middleware/validate");

module.exports = function adminRoutes({ db, audit, publish, publishStructure }) {
  const router = express.Router();
  const adminOnly = requireRole("admin");
  const staff = requireRole("admin", "reception");

  // ---------- Departments ----------
  router.get("/departments", staff, (_req, res) => {
    res.json(db.prepare("SELECT * FROM departments ORDER BY name").all());
  });

  router.post("/departments", adminOnly, (req, res) => {
    const name = text(req.body?.name, "Name", { max: 60 });
    const icon = text(req.body?.icon, "Icon", { required: false, max: 8 }) || "🏥";
    const description = text(req.body?.description, "Description", { required: false, max: 300 }) || "";
    const slug = slugify(name);
    if (!slug) throw new ValidationError("Name must contain letters or numbers");
    const info = db.prepare("INSERT INTO departments (name, slug, icon, description) VALUES (?, ?, ?, ?)").run(name, slug, icon, description);
    audit(req.user, "department.create", name);
    publishStructure();
    res.status(201).json(db.prepare("SELECT * FROM departments WHERE id = ?").get(info.lastInsertRowid));
  });

  router.put("/departments/:id", adminOnly, (req, res) => {
    const depId = id(req.params.id);
    const existing = db.prepare("SELECT * FROM departments WHERE id = ?").get(depId);
    if (!existing) return res.status(404).json({ error: "Department not found" });
    const name = text(req.body?.name, "Name", { required: false, max: 60 }) ?? existing.name;
    const icon = text(req.body?.icon, "Icon", { required: false, max: 8 }) ?? existing.icon;
    const description = text(req.body?.description, "Description", { required: false, max: 300 }) ?? existing.description;
    db.prepare("UPDATE departments SET name = ?, slug = ?, icon = ?, description = ? WHERE id = ?").run(name, slugify(name), icon, description, depId);
    audit(req.user, "department.update", name);
    publishStructure();
    res.json(db.prepare("SELECT * FROM departments WHERE id = ?").get(depId));
  });

  router.delete("/departments/:id", adminOnly, (req, res) => {
    const depId = id(req.params.id);
    const dep = db.prepare("SELECT * FROM departments WHERE id = ?").get(depId);
    if (!dep) return res.status(404).json({ error: "Department not found" });
    const n = db.prepare("SELECT COUNT(*) AS n FROM doctors WHERE department_id = ?").get(depId).n;
    if (n > 0) return res.status(409).json({ error: `Move or remove the ${n} doctor(s) in ${dep.name} first` });
    db.prepare("DELETE FROM departments WHERE id = ?").run(depId);
    audit(req.user, "department.delete", dep.name);
    publishStructure();
    res.json({ ok: true });
  });

  // ---------- Doctors ----------
  router.get("/doctors", staff, (_req, res) => {
    const doctors = queue.listDoctors(db, { includeInactive: true });
    const logins = db.prepare("SELECT doctor_id, username FROM users WHERE role = 'doctor'").all();
    const byDoctor = Object.fromEntries(logins.map((l) => [l.doctor_id, l.username]));
    res.json(doctors.map((d) => ({ ...d, username: byDoctor[d.id] || null })));
  });

  function readDoctor(body, partial = false) {
    const req = !partial;
    return {
      departmentId: integer(body?.departmentId, "Department", { required: req, min: 1 }),
      name: text(body?.name, "Name", { required: req, max: 80 }),
      designation: text(body?.designation, "Designation", { required: false, max: 120 }),
      room: text(body?.room, "Room", { required: false, max: 20 }),
      avgConsultMin: integer(body?.avgConsultMin, "Average consultation time", { required: false, min: 1, max: 120 }),
      active: body?.active === undefined ? undefined : !!body.active,
      onlineEnabled: body?.onlineEnabled === undefined ? undefined : !!body.onlineEnabled,
      onlineLimit: integer(body?.onlineLimit, "Online tokens per day", { required: false, min: 0, max: 500 }),
    };
  }

  router.post("/doctors", adminOnly, (req, res) => {
    const d = readDoctor(req.body);
    const username = text(req.body?.username, "Login username", { required: false, min: 3, max: 40 });
    const password = text(req.body?.password, "Login password", { required: !!username, min: 8, max: 200 });
    if (!db.prepare("SELECT 1 FROM departments WHERE id = ?").get(d.departmentId)) throw new ValidationError("Department does not exist");

    const docId = db.transaction(() => {
      const info = db
        .prepare("INSERT INTO doctors (department_id, name, designation, room, avg_consult_min, online_enabled, online_limit) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(d.departmentId, d.name, d.designation || "", d.room || "", d.avgConsultMin || 10, d.onlineEnabled === false ? 0 : 1, d.onlineLimit ?? 20);
      if (username) {
        db.prepare("INSERT INTO users (username, password_hash, role, doctor_id) VALUES (?, ?, 'doctor', ?)").run(
          username,
          bcrypt.hashSync(password, 10),
          info.lastInsertRowid
        );
      }
      return info.lastInsertRowid;
    })();
    audit(req.user, "doctor.create", d.name);
    const doctor = queue.getDoctor(db, docId);
    publish(doctor);
    publishStructure();
    res.status(201).json(doctor);
  });

  router.put("/doctors/:id", adminOnly, (req, res) => {
    const docId = id(req.params.id);
    const cur = db.prepare("SELECT * FROM doctors WHERE id = ?").get(docId);
    if (!cur) return res.status(404).json({ error: "Doctor not found" });
    const d = readDoctor(req.body, true);
    if (d.departmentId && !db.prepare("SELECT 1 FROM departments WHERE id = ?").get(d.departmentId)) throw new ValidationError("Department does not exist");
    db.prepare(
      "UPDATE doctors SET department_id = ?, name = ?, designation = ?, room = ?, avg_consult_min = ?, active = ?, online_enabled = ?, online_limit = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(
      d.departmentId ?? cur.department_id,
      d.name ?? cur.name,
      d.designation ?? cur.designation,
      d.room ?? cur.room,
      d.avgConsultMin ?? cur.avg_consult_min,
      d.active === undefined ? cur.active : d.active ? 1 : 0,
      d.onlineEnabled === undefined ? cur.online_enabled : d.onlineEnabled ? 1 : 0,
      d.onlineLimit ?? cur.online_limit,
      docId
    );
    audit(req.user, "doctor.update", d.name ?? cur.name);
    const doctor = queue.getDoctor(db, docId);
    publish(doctor);
    publishStructure();
    res.json(doctor);
  });

  router.delete("/doctors/:id", adminOnly, (req, res) => {
    const docId = id(req.params.id);
    const cur = db.prepare("SELECT * FROM doctors WHERE id = ?").get(docId);
    if (!cur) return res.status(404).json({ error: "Doctor not found" });
    db.prepare("DELETE FROM doctors WHERE id = ?").run(docId);
    audit(req.user, "doctor.delete", cur.name);
    publishStructure();
    res.json({ ok: true });
  });

  // ---------- Users ----------
  router.get("/users", adminOnly, (_req, res) => {
    res.json(
      db
        .prepare(
          `SELECT u.id, u.username, u.role, u.doctor_id AS doctorId, d.name AS doctorName, u.created_at AS createdAt
           FROM users u LEFT JOIN doctors d ON d.id = u.doctor_id ORDER BY u.role, u.username`
        )
        .all()
    );
  });

  router.post("/users", adminOnly, (req, res) => {
    const username = text(req.body?.username, "Username", { min: 3, max: 40 });
    const password = text(req.body?.password, "Password", { min: 8, max: 200 });
    const role = req.body?.role;
    if (!["admin", "reception", "doctor"].includes(role)) throw new ValidationError("Role must be admin, reception or doctor");
    const doctorId = role === "doctor" ? id(req.body?.doctorId, "Doctor") : null;
    const info = db.prepare("INSERT INTO users (username, password_hash, role, doctor_id) VALUES (?, ?, ?, ?)").run(username, bcrypt.hashSync(password, 10), role, doctorId);
    audit(req.user, "user.create", `${username} (${role})`);
    res.status(201).json({ id: info.lastInsertRowid, username, role, doctorId });
  });

  router.post("/users/:id/password", adminOnly, (req, res) => {
    const userId = id(req.params.id);
    const password = text(req.body?.password, "Password", { min: 8, max: 200 });
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(password, 10), userId);
    audit(req.user, "user.password-reset", user.username);
    res.json({ ok: true });
  });

  router.delete("/users/:id", adminOnly, (req, res) => {
    const userId = id(req.params.id);
    if (userId === Number(req.user.sub)) return res.status(400).json({ error: "You can't delete your own account" });
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role === "admin" && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n <= 1) {
      return res.status(400).json({ error: "At least one admin account must remain" });
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    audit(req.user, "user.delete", user.username);
    res.json({ ok: true });
  });

  // ---------- Analytics ----------
  router.get("/stats", staff, (_req, res) => {
    const date = queue.today();
    const doctors = queue.listDoctors(db, { includeInactive: false });
    // Patients called per hour today, bucketed in the hospital's time zone.
    const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, hour: "2-digit", hourCycle: "h23" });
    const counts = {};
    for (const { created_at } of db.prepare("SELECT created_at FROM token_events WHERE queue_date = ? AND action = 'next'").all(date)) {
      const h = hourFmt.format(new Date(created_at));
      counts[h] = (counts[h] || 0) + 1;
    }
    const hourly = Object.keys(counts).sort().map((hour) => ({ hour, n: counts[hour] }));
    const daily = db
      .prepare(
        `SELECT queue_date AS date, SUM(maxTok) AS served FROM (
           SELECT queue_date, doctor_id, MAX(token) AS maxTok FROM token_events
           WHERE action IN ('next','set') AND queue_date >= date(?, '-6 days')
           GROUP BY queue_date, doctor_id)
         GROUP BY queue_date ORDER BY queue_date`
      )
      .all(date);
    const b = db
      .prepare(
        `SELECT
           SUM(source = 'online' AND status <> 'cancelled') AS online,
           SUM(source = 'walkin' AND status <> 'cancelled') AS walkin,
           SUM(status = 'no_show') AS noShow,
           SUM(status = 'cancelled') AS cancelled
         FROM bookings WHERE queue_date = ?`
      )
      .get(date);
    res.json({
      date,
      bookings: { online: b.online || 0, walkin: b.walkin || 0, noShow: b.noShow || 0, cancelled: b.cancelled || 0 },
      totals: {
        served: doctors.reduce((s, d) => s + d.currentToken, 0),
        issued: doctors.reduce((s, d) => s + d.issuedTokens, 0),
        waiting: doctors.reduce((s, d) => s + d.waiting, 0),
        consulting: doctors.filter((d) => d.status === "consulting").length,
        doctors: doctors.length,
      },
      doctors: doctors.map((d) => ({
        id: d.id,
        name: d.name,
        department: d.department.name,
        served: d.currentToken,
        issued: d.issuedTokens,
        waiting: d.waiting,
        avgConsultMin: d.avgConsultMin,
        avgIsLearned: d.avgIsLearned,
        status: d.status,
      })),
      hourly,
      daily,
    });
  });

  router.get("/audit", adminOnly, (req, res) => {
    const limit = integer(req.query.limit, "limit", { required: false, min: 1, max: 500 }) || 100;
    const rows = db
      .prepare(
        `SELECT 'audit' AS kind, a.username, a.action, a.detail, a.created_at AS at FROM audit_log a
         UNION ALL
         SELECT 'queue' AS kind, u.username, 'queue.' || e.action, d.name || COALESCE(' · token ' || e.token, '') || COALESCE(' · ' || e.detail, ''), e.created_at
         FROM token_events e JOIN doctors d ON d.id = e.doctor_id LEFT JOIN users u ON u.id = e.user_id
         ORDER BY at DESC LIMIT ?`
      )
      .all(limit);
    res.json(rows);
  });

  return router;
};
