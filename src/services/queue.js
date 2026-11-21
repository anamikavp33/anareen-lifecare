/**
 * Queue service: all token and booking logic lives here so routes stay thin
 * and the rules are easy to test and explain.
 *
 * Terms
 *   currentToken  - the token number the doctor is seeing right now
 *   issuedTokens  - the highest token handed out today (online or at the desk)
 *   booking       - one row per token handed out; holds the patient's name and
 *                   mobile number, which is how patients find their token later
 *   skipped       - tokens that were cancelled or marked no-show. "Next" jumps
 *                   over them and they don't count as patients ahead.
 *
 * Queues reset automatically at the start of each day (in the configured
 * time zone): the first read or write of a new day sets both counters to 0.
 */
const crypto = require("crypto");
const config = require("../config");

const STATUSES = ["consulting", "break", "unavailable"];
const BOOKING_STATUSES = ["booked", "arrived", "done", "no_show", "cancelled"];
const SKIPPED = ["no_show", "cancelled"];
const MAX_TOKEN = 9999;

class QueueError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function today() {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date());
}

function nowHHMM() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

function bookingWindowOpen() {
  const now = nowHHMM();
  return now >= config.bookingOpen && now < config.bookingClose;
}

/** Accepts "98765 43210", "+91 9876543210", "09876543210" → "9876543210". */
function normalizePhone(input) {
  if (typeof input !== "string" && typeof input !== "number") throw new QueueError(400, "Enter your 10-digit mobile number");
  let digits = String(input).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) throw new QueueError(400, "Enter a valid 10-digit Indian mobile number");
  return digits;
}

function cleanName(input, required) {
  if (input === undefined || input === null || String(input).trim() === "") {
    if (required) throw new QueueError(400, "Please enter the patient's name");
    return null;
  }
  const name = String(input).trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) throw new QueueError(400, "Name must be 2 to 60 characters");
  return name;
}

/** "Rahul Krishnan" → "Ra*** K." — enough for the patient to recognise, not enough to identify. */
function maskName(name) {
  if (!name) return null;
  const [first, ...rest] = name.split(" ");
  const last = rest.length ? ` ${rest[rest.length - 1][0].toUpperCase()}.` : "";
  return `${first.slice(0, 2)}***${last}`;
}

function maskPhone(phone) {
  return phone ? `•••••${phone.slice(5)}` : null;
}

function getDoctorRow(db, doctorId) {
  const row = db
    .prepare(
      `SELECT d.*, dep.name AS department_name, dep.slug AS department_slug, dep.icon AS department_icon
       FROM doctors d JOIN departments dep ON dep.id = d.department_id
       WHERE d.id = ?`
    )
    .get(doctorId);
  if (!row) throw new QueueError(404, "Doctor not found");
  return row;
}

/** Resets a doctor's counters if the stored queue belongs to a previous day. */
function ensureToday(db, doctorId) {
  const date = today();
  db.prepare(
    `UPDATE doctors SET current_token = 0, issued_tokens = 0, queue_date = ?, updated_at = datetime('now')
     WHERE id = ? AND (queue_date IS NULL OR queue_date <> ?)`
  ).run(date, doctorId, date);
  return date;
}

function skippedSet(db, doctorId, date) {
  return new Set(
    db
      .prepare(`SELECT token FROM bookings WHERE doctor_id = ? AND queue_date = ? AND status IN ('no_show', 'cancelled')`)
      .all(doctorId, date)
      .map((r) => r.token)
  );
}

/** Number of skipped tokens strictly between lo and hi. */
function skippedBetween(skipped, lo, hi) {
  let n = 0;
  for (const t of skipped) if (t > lo && t < hi) n++;
  return n;
}

/**
 * Average minutes per patient, learned from today's "next" presses.
 * Uses the median of the last 10 gaps (ignoring gaps under 1 or over 90 minutes,
 * which are usually breaks or double clicks). Falls back to the doctor's
 * configured average until there are at least 3 samples.
 */
function learnedAverage(db, doctorId, fallback) {
  const rows = db
    .prepare(
      `SELECT created_at FROM token_events
       WHERE doctor_id = ? AND queue_date = ? AND action = 'next'
       ORDER BY id DESC LIMIT 11`
    )
    .all(doctorId, today());
  const gaps = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const min = (Date.parse(rows[i].created_at) - Date.parse(rows[i + 1].created_at)) / 60000;
    if (min >= 1 && min <= 90) gaps.push(min);
  }
  if (gaps.length < 3) return { minutes: fallback, learned: false };
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return { minutes: Math.max(1, Math.round(median)), learned: true };
}

function onlineUsed(db, doctorId, date) {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM bookings WHERE doctor_id = ? AND queue_date = ? AND source = 'online' AND status <> 'cancelled'`)
    .get(doctorId, date).n;
}

function toPublic(db, row) {
  const avg = learnedAverage(db, row.id, row.avg_consult_min);
  const date = today();
  const skipped = skippedSet(db, row.id, date);
  const skippedAhead = skippedBetween(skipped, row.current_token, row.issued_tokens + 1);
  const used = onlineUsed(db, row.id, date);
  const left = Math.max(row.online_limit - used, 0);
  const windowOpen = bookingWindowOpen();
  let bookingNote = null;
  let reason = null; // lets the patient pages show the note in the chosen language
  if (!row.active) [reason, bookingNote] = ["inactive", "Not taking patients"];
  else if (!row.online_enabled) [reason, bookingNote] = ["off", "Online booking is off for this doctor. Please book at the reception desk."];
  else if (!windowOpen) [reason, bookingNote] = ["closed", `Online booking is open from ${config.bookingOpen} to ${config.bookingClose}.`];
  else if (left <= 0) [reason, bookingNote] = ["full", "All online tokens for today are taken. Please visit the reception desk."];
  return {
    id: row.id,
    name: row.name,
    designation: row.designation,
    room: row.room,
    department: { id: row.department_id, name: row.department_name, slug: row.department_slug, icon: row.department_icon },
    status: row.status,
    resumeTime: row.resume_time,
    currentToken: row.current_token,
    issuedTokens: row.issued_tokens,
    waiting: Math.max(row.issued_tokens - row.current_token - skippedAhead, 0),
    avgConsultMin: avg.minutes,
    avgIsLearned: avg.learned,
    defaultConsultMin: row.avg_consult_min,
    active: !!row.active,
    online: {
      enabled: !!row.online_enabled,
      limit: row.online_limit,
      used,
      left,
      open: !bookingNote,
      note: bookingNote,
      reason,
      hours: { open: config.bookingOpen, close: config.bookingClose },
    },
    updatedAt: row.updated_at,
  };
}

function getDoctor(db, doctorId) {
  getDoctorRow(db, doctorId);
  ensureToday(db, doctorId);
  return toPublic(db, getDoctorRow(db, doctorId));
}

function listDoctors(db, { departmentSlug, includeInactive = false } = {}) {
  let sql = `SELECT d.id FROM doctors d JOIN departments dep ON dep.id = d.department_id WHERE 1=1`;
  const params = [];
  if (!includeInactive) sql += " AND d.active = 1";
  if (departmentSlug) {
    sql += " AND dep.slug = ?";
    params.push(departmentSlug);
  }
  sql += " ORDER BY dep.name, d.name";
  return db.prepare(sql).all(...params).map((r) => getDoctor(db, r.id));
}

function logEvent(db, { doctorId, userId, action, token = null, detail = null, date }) {
  db.prepare(
    "INSERT INTO token_events (doctor_id, user_id, action, token, detail, queue_date) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(doctorId, userId ?? null, action, token, detail, date);
}

function mutate(db, doctorId, userId, fn) {
  return db.transaction(() => {
    getDoctorRow(db, doctorId);
    const date = ensureToday(db, doctorId);
    const row = getDoctorRow(db, doctorId);
    const extra = fn(row, date) || {};
    db.prepare("UPDATE doctors SET updated_at = datetime('now') WHERE id = ?").run(doctorId);
    logEvent(db, { doctorId, userId, date, ...extra.event });
    return { doctor: toPublic(db, getDoctorRow(db, doctorId)), ...extra.result };
  })();
}

function setBookingRowStatus(db, doctorId, date, token, from, to) {
  db.prepare(
    `UPDATE bookings SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE doctor_id = ? AND queue_date = ? AND token = ? AND status IN (${from.map(() => "?").join(",")})`
  ).run(to, doctorId, date, token, ...from);
}

function callNext(db, doctorId, userId) {
  return mutate(db, doctorId, userId, (row, date) => {
    const skipped = skippedSet(db, doctorId, date);
    let next = row.current_token + 1;
    while (skipped.has(next)) next++; // jump over cancelled and no-show tokens
    if (next > MAX_TOKEN) throw new QueueError(400, "Token limit reached for today");
    if (row.current_token > 0) setBookingRowStatus(db, doctorId, date, row.current_token, ["booked", "arrived"], "done");
    db.prepare(
      "UPDATE doctors SET current_token = ?, issued_tokens = MAX(issued_tokens, ?), status = 'consulting', resume_time = NULL WHERE id = ?"
    ).run(next, next, doctorId);
    const jumped = next - row.current_token - 1;
    return { event: { action: "next", token: next, detail: jumped ? `skipped ${jumped}` : null } };
  });
}

function callPrevious(db, doctorId, userId) {
  return mutate(db, doctorId, userId, (row, date) => {
    if (row.current_token <= 0) throw new QueueError(400, "Already at the start of the queue");
    const skipped = skippedSet(db, doctorId, date);
    let prev = row.current_token - 1;
    while (prev > 0 && skipped.has(prev)) prev--;
    setBookingRowStatus(db, doctorId, date, prev, ["done"], "arrived");
    db.prepare("UPDATE doctors SET current_token = ? WHERE id = ?").run(prev, doctorId);
    return { event: { action: "previous", token: prev } };
  });
}

function setToken(db, doctorId, userId, token) {
  const n = Number(token);
  if (!Number.isInteger(n) || n < 0 || n > MAX_TOKEN) throw new QueueError(400, `Token must be a whole number from 0 to ${MAX_TOKEN}`);
  return mutate(db, doctorId, userId, () => {
    db.prepare("UPDATE doctors SET current_token = ?, issued_tokens = MAX(issued_tokens, ?) WHERE id = ?").run(n, n, doctorId);
    return { event: { action: "set", token: n } };
  });
}

/** Shared by desk issuing and online booking. Must run inside mutate(). */
function createBooking(db, row, date, { name, phone, source, consentAt = null }) {
  if (!row.active) throw new QueueError(400, "This doctor is not taking patients");
  if (row.issued_tokens >= MAX_TOKEN) throw new QueueError(400, "Token limit reached for today");
  if (phone) {
    const dup = db
      .prepare(`SELECT token FROM bookings WHERE doctor_id = ? AND queue_date = ? AND phone = ? AND status <> 'cancelled'`)
      .get(row.id, date, phone);
    if (dup) throw new QueueError(409, `This mobile number already has token ${dup.token} for ${row.name} today`);
  }
  const token = Math.max(row.issued_tokens, row.current_token) + 1;
  const code = String(crypto.randomInt(1000, 10000));
  db.prepare("UPDATE doctors SET issued_tokens = ? WHERE id = ?").run(token, row.id);
  const info = db
    .prepare("INSERT INTO bookings (doctor_id, queue_date, token, patient_name, phone, source, code, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, date, token, name, phone, source, code, consentAt);
  return { token, code, bookingId: Number(info.lastInsertRowid) };
}

/**
 * Reception hands out a token. Name and mobile are optional for walk-ins, and so
 * is consent: `consent: true` records that the patient agreed to the privacy notice.
 */
function issueToken(db, doctorId, userId, { name, phone, consent } = {}) {
  const cleanPhone = phone ? normalizePhone(phone) : null;
  const cleanedName = cleanName(name, false);
  const consentAt = consent === true ? new Date().toISOString() : null;
  return mutate(db, doctorId, userId, (row, date) => {
    const b = createBooking(db, row, date, { name: cleanedName, phone: cleanPhone, source: "walkin", consentAt });
    return { event: { action: "issue", token: b.token, detail: cleanedName ? `walk-in · ${cleanedName}` : "walk-in" }, result: { ...b } };
  });
}

/** A patient books today's token from home. They must agree to the privacy notice (`consent: true`). */
function bookOnline(db, doctorId, { name, phone, consent } = {}) {
  const cleanedName = cleanName(name, true);
  const cleanPhone = normalizePhone(phone);
  if (consent !== true) throw new QueueError(400, "Please agree to the privacy notice to book online");
  const consentAt = new Date().toISOString();
  return mutate(db, doctorId, null, (row, date) => {
    if (!row.online_enabled) throw new QueueError(400, "Online booking is off for this doctor. Please book at the reception desk.");
    if (!bookingWindowOpen()) throw new QueueError(400, `Online booking is open from ${config.bookingOpen} to ${config.bookingClose}.`);
    if (onlineUsed(db, row.id, date) >= row.online_limit) throw new QueueError(409, "All online tokens for today are taken. Please visit the reception desk.");
    const b = createBooking(db, row, date, { name: cleanedName, phone: cleanPhone, source: "online", consentAt });
    return { event: { action: "book", token: b.token, detail: `online · ${maskName(cleanedName)}` }, result: { ...b } };
  });
}

function resetQueue(db, doctorId, userId) {
  return mutate(db, doctorId, userId, (_row, date) => {
    db.prepare("UPDATE doctors SET current_token = 0, issued_tokens = 0 WHERE id = ?").run(doctorId);
    db.prepare("DELETE FROM bookings WHERE doctor_id = ? AND queue_date = ?").run(doctorId, date);
    return { event: { action: "reset", token: 0 } };
  });
}

function setStatus(db, doctorId, userId, status, resumeTime) {
  if (!STATUSES.includes(status)) throw new QueueError(400, `Status must be one of: ${STATUSES.join(", ")}`);
  let resume = null;
  if (resumeTime) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(resumeTime)) throw new QueueError(400, "Resume time must be HH:MM (24-hour)");
    resume = status === "consulting" ? null : resumeTime;
  }
  return mutate(db, doctorId, userId, () => {
    db.prepare("UPDATE doctors SET status = ?, resume_time = ? WHERE id = ?").run(status, resume, doctorId);
    return { event: { action: "status", detail: resume ? `${status} until ${resume}` : status } };
  });
}

/** Position of `token` in this doctor's queue right now. */
function position(db, doctor, token) {
  const date = today();
  const cur = doctor.currentToken;
  const booking = db
    .prepare("SELECT status FROM bookings WHERE doctor_id = ? AND queue_date = ? AND token = ?")
    .get(doctor.id, date, token);
  if (booking && (booking.status === "cancelled" || booking.status === "no_show")) {
    return { state: booking.status, ahead: 0, etaMin: 0 };
  }
  if (token < cur || booking?.status === "done") return { state: "passed", ahead: 0, etaMin: 0 };
  if (token === cur) return { state: "now", ahead: 0, etaMin: 0 };
  const ahead = token - cur - 1 - skippedBetween(skippedSet(db, doctor.id, date), cur, token);
  // the patient being seen now still needs some time, unless nobody has been called yet
  const etaMin = (ahead + (cur === 0 ? 0 : 1)) * doctor.avgConsultMin;
  return { state: "waiting", ahead, etaMin };
}

/** What a patient holding `token` for this doctor should know right now. */
function trackToken(db, doctorId, token) {
  const n = Number(token);
  if (!Number.isInteger(n) || n < 1 || n > MAX_TOKEN) throw new QueueError(400, "Enter a valid token number");
  const doctor = getDoctor(db, doctorId);
  return { doctor, token: n, ...position(db, doctor, n) };
}

/** All of today's tokens held by a mobile number, with live positions. */
function tokensForPhone(db, phone) {
  const p = normalizePhone(phone);
  const rows = db
    .prepare(
      `SELECT b.id, b.doctor_id, b.token, b.patient_name, b.source, b.status, b.created_at
       FROM bookings b WHERE b.phone = ? AND b.queue_date = ? AND b.status <> 'cancelled'
       ORDER BY b.created_at`
    )
    .all(p, today());
  return rows.map((b) => {
    const doctor = getDoctor(db, b.doctor_id);
    return {
      bookingId: b.id,
      token: b.token,
      patient: maskName(b.patient_name),
      source: b.source,
      bookingStatus: b.status,
      bookedAt: b.created_at,
      doctor,
      ...position(db, doctor, b.token),
    };
  });
}

/** A patient cancels their own booking: needs the mobile number and the 4-digit code. */
function cancelByPatient(db, bookingId, { phone, code } = {}) {
  const p = normalizePhone(phone);
  const b = db.prepare("SELECT * FROM bookings WHERE id = ? AND queue_date = ?").get(bookingId, today());
  if (!b || b.phone !== p) throw new QueueError(404, "Booking not found for this mobile number");
  if (String(code ?? "").trim() !== b.code) throw new QueueError(403, "The booking code is incorrect");
  if (!["booked", "arrived"].includes(b.status)) throw new QueueError(400, "This token can no longer be cancelled");
  return mutate(db, b.doctor_id, null, (row) => {
    if (b.token <= row.current_token) throw new QueueError(400, "This token has already been called");
    db.prepare("UPDATE bookings SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(b.id);
    return { event: { action: "cancel", token: b.token, detail: "by patient" } };
  });
}

/** Reception or the doctor updates a booking: arrived, no-show, cancelled, or back to booked. */
function setBookingStatus(db, bookingId, userId, status) {
  if (!["booked", "arrived", "no_show", "cancelled"].includes(status)) throw new QueueError(400, "Status must be booked, arrived, no_show or cancelled");
  const b = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
  if (!b) throw new QueueError(404, "Booking not found");
  if (b.queue_date !== today()) throw new QueueError(400, "Only today's bookings can be changed");
  const action = { booked: "status", arrived: "arrived", no_show: "no_show", cancelled: "cancel" }[status];
  return mutate(db, b.doctor_id, userId, () => {
    db.prepare("UPDATE bookings SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(status, b.id);
    return { event: { action, token: b.token, detail: status === "booked" ? `token ${b.token} restored` : null }, result: { bookingId: b.id, doctorId: b.doctor_id } };
  });
}

function getBooking(db, bookingId) {
  return db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
}

/** Today's bookings for staff screens (full names and numbers). */
function listBookings(db, { doctorId } = {}) {
  const params = [today()];
  let sql = `SELECT b.id, b.doctor_id AS doctorId, d.name AS doctorName, d.current_token AS currentToken,
                    b.token, b.patient_name AS name, b.phone, b.source, b.status, b.consent_at AS consentAt, b.created_at AS createdAt
             FROM bookings b JOIN doctors d ON d.id = b.doctor_id
             WHERE b.queue_date = ?`;
  if (doctorId) {
    sql += " AND b.doctor_id = ?";
    params.push(doctorId);
  }
  sql += " ORDER BY d.name, b.token";
  return db.prepare(sql).all(...params);
}

/** The next few patients for the doctor console. */
function upcoming(db, doctorId, limit = 6) {
  const doctor = getDoctor(db, doctorId);
  return db
    .prepare(
      `SELECT id, token, patient_name AS name, source, status FROM bookings
       WHERE doctor_id = ? AND queue_date = ? AND token >= ? AND status NOT IN ('cancelled', 'no_show', 'done')
       ORDER BY token LIMIT ?`
    )
    .all(doctorId, today(), Math.max(doctor.currentToken, 1), limit);
}

function todayHistory(db, doctorId, limit = 50) {
  return db
    .prepare(
      `SELECT e.id, e.action, e.token, e.detail, e.created_at AS at, u.username
       FROM token_events e LEFT JOIN users u ON u.id = e.user_id
       WHERE e.doctor_id = ? AND e.queue_date = ? ORDER BY e.id DESC LIMIT ?`
    )
    .all(doctorId, today(), limit);
}

module.exports = {
  QueueError,
  STATUSES,
  BOOKING_STATUSES,
  SKIPPED,
  today,
  normalizePhone,
  maskName,
  maskPhone,
  getDoctor,
  listDoctors,
  callNext,
  callPrevious,
  setToken,
  issueToken,
  bookOnline,
  resetQueue,
  setStatus,
  trackToken,
  tokensForPhone,
  cancelByPatient,
  setBookingStatus,
  getBooking,
  listBookings,
  upcoming,
  todayHistory,
};
