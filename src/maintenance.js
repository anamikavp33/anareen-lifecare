/**
 * Daily housekeeping: remove old patient details, then back up the database.
 *
 * Runs once at startup and again whenever the date changes (checked every
 * hour, in the hospital's time zone). A restart never skips a day and never
 * makes a second backup for the same day. If a step fails it is logged and
 * retried at the next hourly check.
 */
const config = require("./config");
const { today } = require("./services/queue");
const { purgeOldPatientData } = require("./services/retention");
const { backupDatabase } = require("./db/backup");
const { logError } = require("./logger");

function startMaintenance(db, { intervalMs = 60 * 60 * 1000, log = console.log } = {}) {
  let doneFor = null;

  function run() {
    const date = today();
    if (doneFor === date) return;
    let ok = true;
    try {
      const r = purgeOldPatientData(db, { days: config.retentionDays, date });
      if (r.bookings) log(`Privacy cleanup: removed patient details from ${r.bookings} booking(s) older than ${config.retentionDays} days.`);
    } catch (e) {
      ok = false;
      logError(e, "privacy cleanup");
    }
    try {
      const b = backupDatabase(db, { dir: config.backupDir, keep: config.backupKeep, date });
      if (!b.skipped) log(`Backup saved: ${b.file}`);
    } catch (e) {
      ok = false;
      logError(e, "daily backup");
    }
    if (ok) doneFor = date;
  }

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref(); // don't keep the process alive just for this
  return { run, stop: () => clearInterval(timer) };
}

module.exports = { startMaintenance };
