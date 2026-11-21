/**
 * Real-time layer (Socket.IO).
 *
 * Clients say what they want to watch, and are put in a matching room:
 *   "all"                 - every doctor (home page, admin, all-department display)
 *   "department:<id>"     - one department's page or display board
 *   "doctor:<id>"         - a patient's token tracker or a doctor's console
 *
 * When a queue changes, the server pushes the updated doctor to exactly the
 * rooms that care. Nobody polls.
 */
const ROOM = /^(all|department:\d+|doctor:\d+)$/;

function attachRealtime(io) {
  io.on("connection", (socket) => {
    socket.on("watch", (room) => {
      if (typeof room === "string" && ROOM.test(room)) socket.join(room);
    });
    socket.on("unwatch", (room) => {
      if (typeof room === "string") socket.leave(room);
    });
  });

  function publish(doctor, { announce = false } = {}) {
    io.to("all")
      .to(`department:${doctor.department.id}`)
      .to(`doctor:${doctor.id}`)
      .emit("doctor:update", { doctor, announce });
  }

  function publishStructure() {
    io.emit("structure:changed");
  }

  return { publish, publishStructure };
}

module.exports = { attachRealtime };
