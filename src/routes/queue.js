const express = require("express");
const queue = require("../services/queue");
const { requireAuth, requireRole, canControlDoctor } = require("../middleware/auth");
const { id } = require("../middleware/validate");

/**
 * Queue control. Doctors can control only their own queue;
 * reception and admin can control any doctor's queue.
 */
module.exports = function queueRoutes({ db, publish }) {
  const router = express.Router();

  router.use("/:doctorId", requireAuth, (req, res, next) => {
    req.doctorId = id(req.params.doctorId, "doctorId");
    if (!canControlDoctor(req.user, req.doctorId)) {
      return res.status(403).json({ error: "You can only control your own queue" });
    }
    next();
  });

  const send = (res, result, extra = {}) => {
    publish(result.doctor, extra);
    res.json(result);
  };

  router.post("/:doctorId/next", (req, res) => {
    send(res, queue.callNext(db, req.doctorId, req.user.sub), { announce: true });
  });

  router.post("/:doctorId/previous", (req, res) => {
    send(res, queue.callPrevious(db, req.doctorId, req.user.sub));
  });

  router.post("/:doctorId/set", (req, res) => {
    send(res, queue.setToken(db, req.doctorId, req.user.sub, req.body?.token), { announce: true });
  });

  router.post("/:doctorId/status", (req, res) => {
    send(res, queue.setStatus(db, req.doctorId, req.user.sub, req.body?.status, req.body?.resumeTime));
  });

  // Issuing tokens is a front-desk job. Name and mobile are optional; with a
  // mobile number the patient can track the token from their phone.
  router.post("/:doctorId/issue", requireRole("admin", "reception"), (req, res) => {
    send(res, queue.issueToken(db, req.doctorId, req.user.sub, { name: req.body?.name, phone: req.body?.phone, consent: req.body?.consent }));
  });

  router.post("/:doctorId/reset", (req, res) => {
    send(res, queue.resetQueue(db, req.doctorId, req.user.sub));
  });

  router.get("/:doctorId/history", (req, res) => {
    res.json(queue.todayHistory(db, req.doctorId));
  });

  // Next few patients (names, online/walk-in) for the doctor console.
  router.get("/:doctorId/upcoming", (req, res) => {
    res.json(queue.upcoming(db, req.doctorId));
  });

  router.get("/:doctorId/bookings", (req, res) => {
    res.json(queue.listBookings(db, { doctorId: req.doctorId }));
  });

  return router;
};
