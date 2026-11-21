-- Anareen Lifecare: database schema (SQLite)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE,
  slug         TEXT    NOT NULL UNIQUE,
  icon         TEXT    NOT NULL DEFAULT '🏥',
  description  TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS doctors (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id    INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  name             TEXT    NOT NULL,
  designation      TEXT    NOT NULL DEFAULT '',
  room             TEXT    NOT NULL DEFAULT '',
  avg_consult_min  INTEGER NOT NULL DEFAULT 10 CHECK (avg_consult_min BETWEEN 1 AND 120),
  current_token    INTEGER NOT NULL DEFAULT 0 CHECK (current_token >= 0),
  issued_tokens    INTEGER NOT NULL DEFAULT 0 CHECK (issued_tokens >= 0),
  status           TEXT    NOT NULL DEFAULT 'unavailable'
                   CHECK (status IN ('consulting', 'break', 'unavailable')),
  resume_time      TEXT,
  queue_date       TEXT,
  active           INTEGER NOT NULL DEFAULT 1,
  online_enabled   INTEGER NOT NULL DEFAULT 1,
  online_limit     INTEGER NOT NULL DEFAULT 20 CHECK (online_limit BETWEEN 0 AND 500),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doctors_department ON doctors(department_id);

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT    NOT NULL,
  role           TEXT    NOT NULL CHECK (role IN ('admin', 'reception', 'doctor')),
  doctor_id      INTEGER REFERENCES doctors(id) ON DELETE CASCADE,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (role <> 'doctor' OR doctor_id IS NOT NULL)
);

-- Every change to a queue is recorded: used for live history,
-- average consultation time and daily analytics.
CREATE TABLE IF NOT EXISTS token_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id   INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT    NOT NULL CHECK (action IN ('next', 'previous', 'set', 'issue', 'book', 'cancel', 'arrived', 'no_show', 'reset', 'status')),
  token       INTEGER,
  detail      TEXT,
  queue_date  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_events_doctor_date ON token_events(doctor_id, queue_date);

-- One row per token handed out, whether booked online or issued at the desk.
-- The patient's mobile number is how they find their tokens later (no link or QR needed).
-- Names and numbers are cleared after RETENTION_DAYS (src/services/retention.js).
CREATE TABLE IF NOT EXISTS bookings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id     INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  queue_date    TEXT    NOT NULL,
  token         INTEGER NOT NULL CHECK (token >= 1),
  patient_name  TEXT,
  phone         TEXT    CHECK (phone IS NULL OR (length(phone) = 10 AND phone NOT GLOB '*[^0-9]*')),
  source        TEXT    NOT NULL CHECK (source IN ('online', 'walkin')),
  status        TEXT    NOT NULL DEFAULT 'booked'
                CHECK (status IN ('booked', 'arrived', 'done', 'no_show', 'cancelled')),
  code          TEXT    NOT NULL,
  consent_at    TEXT,   -- when the patient agreed to the privacy notice; NULL if not recorded
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (doctor_id, queue_date, token)
);
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone, queue_date);
-- A mobile number can hold only one live token per doctor per day.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_one_per_phone
  ON bookings(doctor_id, queue_date, phone)
  WHERE phone IS NOT NULL AND status NOT IN ('cancelled');

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username    TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
