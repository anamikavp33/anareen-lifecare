const http = require("http");
const { Server } = require("socket.io");
const config = require("./config");
const { openDatabase } = require("./db");
const { seedDatabase, DEMO_PASSWORDS } = require("./db/seed");
const { createApp } = require("./app");
const { attachRealtime } = require("./realtime");
const { startMaintenance } = require("./maintenance");
const { logError } = require("./logger");

process.on("uncaughtException", (e) => {
  logError(e, "uncaught exception");
  process.exit(1); // state may be broken; let the process manager restart it
});
process.on("unhandledRejection", (e) => logError(e, "unhandled promise rejection"));

const db = openDatabase(config.dbPath);
if (seedDatabase(db).seeded) {
  console.log(`First run: demo data created. Sign in as admin / ${DEMO_PASSWORDS.admin}`);
}

// The app needs `publish`, and `publish` needs the socket server, which needs
// the HTTP server, which needs the app. Late-binding breaks the cycle.
let realtime = { publish: () => {}, publishStructure: () => {} };
const app = createApp({
  db,
  publish: (...a) => realtime.publish(...a),
  publishStructure: (...a) => realtime.publishStructure(...a),
});
const server = http.createServer(app);
const io = new Server(server);
realtime = attachRealtime(io);
const maintenance = startMaintenance(db); // privacy cleanup + backup now, then once a day

server.listen(config.port, () => {
  console.log(`${config.hospitalName} running at http://localhost:${config.port}`);
});

function shutdown() {
  maintenance.stop();
  io.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
