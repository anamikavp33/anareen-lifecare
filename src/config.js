require("dotenv").config({ quiet: true });

const env = process.env.NODE_ENV || "development";

function wholeNumber(name, fallback, min) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be a whole number of at least ${min} (got "${raw}")`);
  return n;
}

// Number of reverse proxies (nginx, Caddy, a load balancer) in front of the app,
// so req.ip and req.secure come from X-Forwarded-For / X-Forwarded-Proto. 0 = none.
function trustProxy() {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === "") return 1;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw === "true" ? true : raw === "false" ? false : raw; // also accepts "loopback", IPs, subnets
}

const config = {
  env,
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || "data/anareen.db",
  jwtSecret: process.env.JWT_SECRET || (env === "production" ? null : "dev-only-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  timezone: process.env.TZ_NAME || "Asia/Kolkata",
  hospitalName: process.env.HOSPITAL_NAME || "Anareen Lifecare Hospital",
  // Online booking window (24-hour HH:MM, hospital time zone). Bookings are for the same day.
  bookingOpen: process.env.BOOKING_OPEN || "06:00",
  bookingClose: process.env.BOOKING_CLOSE || "19:00",
  // Patient names and mobile numbers are removed from bookings older than this many days.
  retentionDays: wholeNumber("RETENTION_DAYS", 30, 1),
  // Daily database copies (VACUUM INTO); only the newest `backupKeep` are kept.
  backupDir: process.env.BACKUP_DIR || "backups",
  backupKeep: wholeNumber("BACKUP_KEEP", 14, 1),
  // Server errors are appended here with a timestamp. Empty turns file logging off.
  logFile: process.env.LOG_FILE ?? (env === "test" ? "" : "logs/error.log"),
  trustProxy: trustProxy(),
  // Redirect plain-HTTP requests to HTTPS (needs TRUST_PROXY when behind a proxy).
  forceHttps: process.env.FORCE_HTTPS === "true",
};

if (!config.jwtSecret) {
  throw new Error("JWT_SECRET must be set in production. Copy .env.example to .env and set it.");
}

module.exports = config;
