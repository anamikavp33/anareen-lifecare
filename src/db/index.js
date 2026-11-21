const fs = require("fs");
const path = require("path");

// Node's built-in SQLite driver (Node 22.5+). There's no native module to
// compile, so `npm install` works the same on Windows, macOS and Linux.
// Silence only the one-time "SQLite is experimental" notice.
const emitWarning = process.emitWarning;
process.emitWarning = (w, ...rest) => (String(w).includes("SQLite") ? undefined : emitWarning.call(process, w, ...rest));
const { DatabaseSync } = require("node:sqlite");
process.emitWarning = emitWarning;

// Map SQLite extended error codes to readable names used by the error handler.
const SQLITE_CODES = { 2067: "SQLITE_CONSTRAINT_UNIQUE", 1555: "SQLITE_CONSTRAINT_UNIQUE", 787: "SQLITE_CONSTRAINT_FOREIGNKEY", 275: "SQLITE_CONSTRAINT_CHECK" };

/**
 * Thin wrapper that adds `transaction(fn)` and `pragma()` on top of
 * node:sqlite, so the rest of the code reads cleanly.
 */
class Database {
  constructor(file) {
    this.raw = new DatabaseSync(file);
    this.depth = 0;
  }
  exec(sql) {
    return this.raw.exec(sql);
  }
  prepare(sql) {
    const stmt = this.raw.prepare(sql);
    const wrap = (fn) => (...args) => {
      try {
        return fn.apply(stmt, args);
      } catch (e) {
        if (SQLITE_CODES[e.errcode]) e.code = SQLITE_CODES[e.errcode];
        throw e;
      }
    };
    return { run: wrap(stmt.run), get: wrap(stmt.get), all: wrap(stmt.all) };
  }
  pragma(p) {
    this.raw.exec(`PRAGMA ${p}`);
  }
  /** Returns a function that runs `fn` inside BEGIN/COMMIT, rolling back on error. Nested calls join the outer transaction. */
  transaction(fn) {
    return (...args) => {
      if (this.depth > 0) return fn(...args);
      this.raw.exec("BEGIN IMMEDIATE");
      this.depth++;
      try {
        const result = fn(...args);
        this.raw.exec("COMMIT");
        return result;
      } catch (e) {
        this.raw.exec("ROLLBACK");
        throw e;
      } finally {
        this.depth--;
      }
    };
  }
  close() {
    this.raw.close();
  }
}

/**
 * Opens (and if needed creates) the SQLite database and applies the schema.
 * Pass ":memory:" for an in-memory database (used by the test suite).
 */
function openDatabase(dbPath) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new Database(dbPath);
  if (dbPath !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  migrate(db);
  return db;
}

/** Upgrades a database created by an earlier version, keeping its data. */
function migrate(db) {
  const cols = db.prepare("PRAGMA table_info(doctors)").all().map((c) => c.name);
  if (!cols.includes("online_enabled")) db.exec("ALTER TABLE doctors ADD COLUMN online_enabled INTEGER NOT NULL DEFAULT 1");
  if (!cols.includes("online_limit")) db.exec("ALTER TABLE doctors ADD COLUMN online_limit INTEGER NOT NULL DEFAULT 20");

  // v2.2 records when the patient agreed to the privacy notice.
  const bookingCols = db.prepare("PRAGMA table_info(bookings)").all().map((c) => c.name);
  if (!bookingCols.includes("consent_at")) db.exec("ALTER TABLE bookings ADD COLUMN consent_at TEXT");

  // v2.0 restricted token_events.action to fewer values; rebuild the table with the new rule.
  const ev = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'token_events'").get();
  if (ev && !ev.sql.includes("'book'")) {
    db.pragma("foreign_keys = OFF"); // copying rows as they are; must be set outside the transaction
    db.transaction(() => {
      db.exec("ALTER TABLE token_events RENAME TO token_events_old");
      db.exec("DROP INDEX IF EXISTS idx_events_doctor_date");
      db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
      db.exec(`INSERT INTO token_events (id, doctor_id, user_id, action, token, detail, queue_date, created_at)
               SELECT id, doctor_id, user_id, action, token, detail, queue_date, created_at FROM token_events_old`);
      db.exec("DROP TABLE token_events_old");
    })();
    db.pragma("foreign_keys = ON");
  }
}

module.exports = { openDatabase, DatabaseSync };
