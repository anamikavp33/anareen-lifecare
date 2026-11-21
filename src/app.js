const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const config = require("./config");
const { loadUser } = require("./middleware/auth");
const { notFound, errorHandler } = require("./middleware/errors");
const { logError } = require("./logger");

/**
 * Builds the Express app. The database and the real-time publisher are
 * passed in, so tests can use an in-memory database with no sockets.
 */
function createApp({ db, publish = () => {}, publishStructure = () => {} }) {
  const app = express();
  app.disable("x-powered-by");
  // Behind a reverse proxy, this makes req.secure and req.ip reflect the real visitor.
  app.set("trust proxy", config.trustProxy);
  if (config.forceHttps) {
    // Health checks stay on plain HTTP so a load balancer can call them directly.
    app.use((req, res, next) =>
      req.secure || req.path === "/api/health" ? next() : res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
    );
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    })
  );
  app.use(express.json({ limit: "20kb" }));
  app.use(cookieParser());
  app.use(loadUser);

  const audit = (user, action, detail = null) => {
    db.prepare("INSERT INTO audit_log (user_id, username, action, detail) VALUES (?, ?, ?, ?)").run(
      user?.id ?? user?.sub ?? null,
      user?.username ?? null,
      action,
      detail
    );
  };
  const ctx = { db, audit, publish, publishStructure };

  // For uptime monitors: 200 only if the database answers, 503 otherwise.
  app.get("/api/health", (_req, res) => {
    let database = "ok";
    try {
      db.prepare("SELECT COUNT(*) AS n FROM doctors").get();
    } catch (e) {
      database = "unavailable";
      logError(e, "health check");
    }
    res.status(database === "ok" ? 200 : 503).json({
      ok: database === "ok",
      name: config.hospitalName,
      database,
      uptimeSec: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
  });
  app.get("/api/config", (_req, res) =>
    res.json({ hospitalName: config.hospitalName, timezone: config.timezone, retentionDays: config.retentionDays, backupKeepDays: config.backupKeep })
  );
  app.use("/api/auth", require("./routes/auth")(ctx));
  app.use("/api/queue", require("./routes/queue")(ctx));
  app.use("/api/admin", require("./routes/admin")(ctx));
  app.use("/api/staff/bookings", require("./routes/bookings")(ctx));
  app.use("/api", require("./routes/public")(ctx));
  app.use("/api", notFound);

  app.use(express.static(path.join(__dirname, "..", "public"), { extensions: ["html"] }));
  app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "..", "public", "404.html")));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
