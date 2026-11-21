const express = require("express");
const queue = require("../services/queue");
const { requireAuth, canControlDoctor } = require("../middleware/auth");
const { id } = require("../middleware/validate");

/** Staff actions on individual bookings: arrived, no-show, cancel, restore. */
module.exports = function bookingRoutes({ db, publish }) {
  const router = express.Router();

  router.get("/", requireAuth, (req, res) => {
    if (req.user.role === "doctor") return res.json(queue.listBookings(db, { doctorId: req.user.doctorId }));
    const doctorId = req.query.doctorId ? id(req.query.doctorId, "doctorId") : undefined;
    res.json(queue.listBookings(db, { doctorId }));
  });

  router.post("/:id/status", requireAuth, (req, res) => {
    const booking = queue.getBooking(db, id(req.params.id));
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!canControlDoctor(req.user, booking.doctor_id)) return res.status(403).json({ error: "You can only manage your own patients" });
    const result = queue.setBookingStatus(db, booking.id, req.user.sub, req.body?.status);
    publish(result.doctor);
    res.json(result);
  });

  return router;
};
