const express = require("express");
const config = require("../config");
const queue = require("../services/queue");
const { id, integer } = require("../middleware/validate");
const { windowLimiter } = require("../middleware/rateLimit");

/** Endpoints anyone can call: patients, the waiting-hall display, the home page. */
module.exports = function publicRoutes({ db, publish }) {
  const router = express.Router();
  const relaxed = config.env === "test";
  const bookLimit = windowLimiter({ max: relaxed ? 1000 : 10, windowMs: 60 * 60 * 1000, message: "Too many bookings from this network. Please try again later or visit reception." });
  const lookupLimit = windowLimiter({ max: relaxed ? 1000 : 60, windowMs: 10 * 60 * 1000 });

  router.get("/departments", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT dep.id, dep.name, dep.slug, dep.icon, dep.description,
                COUNT(d.id) AS doctorCount
         FROM departments dep LEFT JOIN doctors d ON d.department_id = dep.id AND d.active = 1
         GROUP BY dep.id ORDER BY dep.name`
      )
      .all();
    res.json(rows);
  });

  router.get("/departments/:slug", (req, res) => {
    const dep = db.prepare("SELECT id, name, slug, icon, description FROM departments WHERE slug = ?").get(req.params.slug);
    if (!dep) return res.status(404).json({ error: "Department not found" });
    res.json({ ...dep, doctors: queue.listDoctors(db, { departmentSlug: dep.slug }) });
  });

  router.get("/doctors", (req, res) => {
    const slug = typeof req.query.department === "string" ? req.query.department : undefined;
    res.json(queue.listDoctors(db, { departmentSlug: slug }));
  });

  router.get("/doctors/:id", (req, res) => {
    res.json(queue.getDoctor(db, id(req.params.id)));
  });

  router.get("/track", (req, res) => {
    const doctorId = id(req.query.doctorId, "doctorId");
    const token = integer(req.query.token, "token", { min: 1, max: 9999 });
    res.json(queue.trackToken(db, doctorId, token));
  });

  // ---------- Online booking ----------
  router.post("/book", bookLimit, (req, res) => {
    const doctorId = id(req.body?.doctorId, "doctorId");
    const result = queue.bookOnline(db, doctorId, { name: req.body?.name, phone: req.body?.phone, consent: req.body?.consent });
    publish(result.doctor);
    res.status(201).json({
      token: result.token,
      code: result.code,
      bookingId: result.bookingId,
      doctor: result.doctor,
      ...queue.trackToken(db, doctorId, result.token),
    });
  });

  // ---------- Track by mobile number (no link or QR needed) ----------
  router.get("/my-tokens", lookupLimit, (req, res) => {
    res.json(queue.tokensForPhone(db, req.query.phone));
  });

  router.post("/bookings/:id/cancel", bookLimit, (req, res) => {
    const result = queue.cancelByPatient(db, id(req.params.id), { phone: req.body?.phone, code: req.body?.code });
    publish(result.doctor);
    res.json({ ok: true });
  });

  router.get("/summary", (_req, res) => {
    const doctors = queue.listDoctors(db);
    res.json({
      doctors: doctors.length,
      consulting: doctors.filter((d) => d.status === "consulting").length,
      waiting: doctors.reduce((s, d) => s + d.waiting, 0),
      served: doctors.reduce((s, d) => s + d.currentToken, 0),
    });
  });

  return router;
};
