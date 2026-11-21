/**
 * Data retention: patient names and mobile numbers are removed from bookings
 * older than RETENTION_DAYS. The booking rows themselves stay (doctor, date,
 * token, online/walk-in, status), so analytics counts don't change; they just
 * no longer say who the patient was. Names copied into the queue history
 * ("walk-in · Rahul", "online · Ra*** K.") are cleared the same way.
 *
 * Safe to run any number of times: rows already cleaned are not touched again.
 */
const { today } = require("./queue");

function purgeOldPatientData(db, { days, date = today() } = {}) {
  if (!Number.isInteger(days) || days < 1) throw new Error("Retention must be at least 1 day");
  return db.transaction(() => {
    // Rows dated before the cutoff are older than `days` days; today's live queue is never touched.
    const cutoff = db.prepare("SELECT date(?, ?) AS d").get(date, `-${days} days`).d;
    const bookings = db
      .prepare(
        `UPDATE bookings SET patient_name = NULL, phone = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE queue_date < ? AND (patient_name IS NOT NULL OR phone IS NOT NULL)`
      )
      .run(cutoff).changes;
    const events = db
      .prepare(
        `UPDATE token_events SET detail = CASE action WHEN 'issue' THEN 'walk-in' ELSE 'online' END
         WHERE queue_date < ? AND action IN ('issue', 'book') AND detail NOT IN ('walk-in', 'online')`
      )
      .run(cutoff).changes;
    if (bookings || events) {
      db.prepare("INSERT INTO audit_log (username, action, detail) VALUES ('system', 'privacy.cleanup', ?)").run(
        `Removed patient names and numbers from ${bookings} booking(s) dated before ${cutoff}`
      );
    }
    return { cutoff, bookings, events };
  })();
}

module.exports = { purgeOldPatientData };
